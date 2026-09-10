import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

// Sincronizacao periodica das Ordens de Compra pendentes de aprovacao no
// Senior (E420OCP). Chamado pelo script Python que roda no VPS do Rito de
// Gestao (tem acesso ao GetDBInfo do Senior), autenticado por chave
// compartilhada -- nao expoe nenhum dado do Senior sem essa chave.
//
// Efeitos: (1) upsert em AprovacaoSenior por numOcp (campos descritivos
// -- fornecedor, contrato, rateio, historico -- sempre atualizados);
// (2) toda mudanca de situacaoAtual vira 1 linha em AprovacaoSeniorEvento;
// (3) OC nova e pendente -> Notification pros aprovadores; (4) OC que
// estava pendente e virou APR/REP/CAN -> marca resolvidoEm/resolvidoComo.
// O "proximo aprovador" vem como codigo do Senior e e resolvido pra nome/
// conta via a tabela UsuarioSenior (de-para), quando ela estiver populada.

const itemSchema = z.object({
  numOcp: z.string(),
  dataEmissao: z.string(), // ISO
  fornecedorCodigo: z.string(),
  fornecedorNome: z.string().optional().nullable(),
  valor: z.number(),
  descricao: z.string().optional().nullable(),
  contratoTexto: z.string().optional().nullable(),
  codccu: z.string().optional().nullable(),
  contratoNome: z.string().optional().nullable(),
  numApr: z.string(),
  rotNap: z.string().optional().nullable(),
  situacaoAtual: z.string(),
  nivelAtual: z.number().int().default(1),
  historicoNiveis: z.string().optional().nullable(),
  temRateio: z.boolean().default(false),
  rateioDetalhe: z.string().optional().nullable(),
  mapaCotacao: z.string().optional().nullable(),
  proximoAprovadorCod: z.string().optional().nullable(),
});

const bodySchema = z.object({ itens: z.array(itemSchema) });

const SITUACOES_PENDENTES = new Set(["ANA", "PRE"]);
const SITUACOES_RESOLVIDAS = new Set(["APR", "REP", "CAN"]);

export async function POST(req: Request) {
  const chave = req.headers.get("x-sync-key");
  if (!chave || chave !== process.env.SENIOR_SYNC_KEY) {
    return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Payload invalido", detalhes: parsed.error.flatten() }, { status: 422 });
  }

  const aprovadores = await prisma.user.findMany({
    where: {
      active: true,
      OR: [
        { role: { in: ["ADMIN", "DIRETOR", "GESTOR_PROJETO", "APROVADOR"] } },
        { nivelHierarquico: { in: ["DIRETORIA", "GERENCIA", "COORDENACAO"] } },
      ],
    },
    select: { id: true },
  });

  // de-para de usuarios do Senior (codigo -> nome/conta), pra resolver o
  // "proximo aprovador". Se a tabela estiver vazia, os codigos ficam sem nome.
  const codsAprovador = Array.from(
    new Set(parsed.data.itens.map((i) => i.proximoAprovadorCod).filter((c): c is string => !!c))
  );
  const usuariosSenior = codsAprovador.length
    ? await prisma.usuarioSenior.findMany({ where: { codigo: { in: codsAprovador } } })
    : [];
  const deParaSenior = new Map(usuariosSenior.map((u) => [u.codigo, u]));

  // cria stub pra cada codigo de aprovador ainda sem cadastro -- assim o
  // admin abre /usuarios/senior e ja ve quais codigos precisam de nome
  const codsSemCadastro = codsAprovador.filter((c) => !deParaSenior.has(c));
  if (codsSemCadastro.length > 0) {
    await prisma.usuarioSenior.createMany({
      data: codsSemCadastro.map((c) => ({ codigo: c, nome: `(sem nome — código Senior ${c})` })),
      skipDuplicates: true,
    });
  }

  function resolverProximo(cod: string | null | undefined) {
    if (!cod) return { proximoAprovadorCod: null, proximoAprovadorNome: null, proximoAprovadorUserId: null };
    const u = deParaSenior.get(cod);
    return {
      proximoAprovadorCod: cod,
      proximoAprovadorNome: u?.nome ?? null,
      proximoAprovadorUserId: u?.userId ?? null,
    };
  }

  let novas = 0;
  let atualizadas = 0;
  let resolvidas = 0;
  let notificacoesCriadas = 0;

  for (const item of parsed.data.itens) {
    const existente = await prisma.aprovacaoSenior.findUnique({ where: { numOcp: item.numOcp } });
    const prox = resolverProximo(item.proximoAprovadorCod);

    // campos descritivos -- reescritos a cada sync (dado do Senior manda)
    const descritivos = {
      fornecedorCodigo: item.fornecedorCodigo,
      fornecedorNome: item.fornecedorNome || null,
      valor: item.valor,
      descricao: item.descricao || null,
      contratoTexto: item.contratoTexto || null,
      codccu: item.codccu || existente?.codccu || null,
      contratoNome: item.contratoNome || null,
      rotNap: item.rotNap || null,
      historicoNiveis: item.historicoNiveis || null,
      temRateio: item.temRateio,
      rateioDetalhe: item.rateioDetalhe || null,
      mapaCotacao: item.mapaCotacao || null,
      nivelAtual: item.nivelAtual,
      ...prox,
    };

    if (!existente) {
      const criada = await prisma.aprovacaoSenior.create({
        data: {
          numOcp: item.numOcp,
          dataEmissao: new Date(item.dataEmissao),
          numApr: item.numApr,
          situacaoAtual: item.situacaoAtual,
          ...descritivos,
          ...(SITUACOES_RESOLVIDAS.has(item.situacaoAtual)
            ? { resolvidoEm: new Date(), resolvidoComo: item.situacaoAtual }
            : {}),
        },
      });
      await prisma.aprovacaoSeniorEvento.create({
        data: { aprovacaoSeniorId: criada.id, situacao: item.situacaoAtual, nivel: item.nivelAtual, observacao: "Deteccao inicial" },
      });
      novas++;

      if (SITUACOES_PENDENTES.has(item.situacaoAtual)) {
        const valorFmt = item.valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
        // se ja sabemos quem e a pessoa, notifica so ela; senao, o grupo
        const destinatarios = prox.proximoAprovadorUserId ? [{ id: prox.proximoAprovadorUserId }] : aprovadores;
        await prisma.notification.createMany({
          data: destinatarios.map((a) => ({
            userId: a.id,
            type: "APROVACAO_PENDENTE" as const,
            title: `OC ${item.numOcp} aguardando aprovação (${valorFmt})`,
            body: item.descricao?.slice(0, 200) || null,
            link: "/aprovacoes/senior",
          })),
        });
        notificacoesCriadas += destinatarios.length;
      }
      continue;
    }

    const mudouSituacao = existente.situacaoAtual !== item.situacaoAtual;
    const foiResolvidaAgora =
      mudouSituacao && SITUACOES_PENDENTES.has(existente.situacaoAtual) && SITUACOES_RESOLVIDAS.has(item.situacaoAtual);

    if (mudouSituacao) {
      await prisma.aprovacaoSeniorEvento.create({
        data: {
          aprovacaoSeniorId: existente.id,
          situacao: item.situacaoAtual,
          nivel: item.nivelAtual,
          observacao: `Mudou de ${existente.situacaoAtual} para ${item.situacaoAtual}`,
        },
      });
      if (foiResolvidaAgora) resolvidas++;
      else atualizadas++;
    }

    await prisma.aprovacaoSenior.update({
      where: { id: existente.id },
      data: {
        situacaoAtual: item.situacaoAtual,
        ...descritivos,
        ...(foiResolvidaAgora ? { resolvidoEm: new Date(), resolvidoComo: item.situacaoAtual } : {}),
      },
    });
  }

  return NextResponse.json({ ok: true, novas, atualizadas, resolvidas, notificacoesCriadas, totalRecebido: parsed.data.itens.length });
}

export async function GET(req: Request) {
  const chave = req.headers.get("x-sync-key");
  if (!chave || chave !== process.env.SENIOR_SYNC_KEY) {
    return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });
  }
  const pendentes = await prisma.aprovacaoSenior.count({ where: { situacaoAtual: { in: ["ANA", "PRE"] } } });
  const total = await prisma.aprovacaoSenior.count();
  return NextResponse.json({ pendentes, total });
}
