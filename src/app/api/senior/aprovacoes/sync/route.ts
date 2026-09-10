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
  niveisExigidos: z.string().optional().nullable(),
  niveisAprovados: z.string().optional().nullable(),
  nivelAtual: z.number().int().default(1),
  historicoNiveis: z.string().optional().nullable(),
  temRateio: z.boolean().default(false),
  rateioDetalhe: z.string().optional().nullable(),
  mapaCotacao: z.string().optional().nullable(),
  proximoAprovadorCod: z.string().optional().nullable(),
  aprovadoresPendentes: z.string().optional().nullable(),
  aprovadoresPendentesCod: z.string().optional().nullable(),
  criadorCod: z.string().optional().nullable(),
  previsaoPagamento: z.string().optional().nullable(),
  pago: z.boolean().optional().default(false),
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
  // proximo aprovador, os aprovadores pendentes de cada nivel e o criador da OC
  const codsUsados = Array.from(
    new Set(
      parsed.data.itens
        .flatMap((i) => [
          i.proximoAprovadorCod,
          i.criadorCod,
          ...(i.aprovadoresPendentesCod?.split(",") ?? []),
        ])
        .map((c) => c?.trim())
        .filter((c): c is string => !!c)
    )
  );
  const usuariosSenior = codsUsados.length
    ? await prisma.usuarioSenior.findMany({
        where: { codigo: { in: codsUsados } },
        include: { user: { select: { name: true } } },
      })
    : [];
  const deParaSenior = new Map(usuariosSenior.map((u) => [u.codigo, u]));

  function nomeSenior(cod: string | null | undefined) {
    if (!cod) return null;
    const u = deParaSenior.get(cod);
    return u?.user?.name ?? u?.nome ?? null;
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

  // userIds do consominas-gestao pros codigos Senior de quem falta aprovar
  // (todos os niveis pendentes de todas as linhas de rateio)
  function userIdsPendentes(codsCsv: string | null | undefined): string[] {
    if (!codsCsv) return [];
    const ids = new Set<string>();
    for (const cod of codsCsv.split(",").map((c) => c.trim()).filter(Boolean)) {
      const uid = deParaSenior.get(cod)?.userId;
      if (uid) ids.add(uid);
    }
    return [...ids];
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
      criadorCod: item.criadorCod || null,
      criadorNome: nomeSenior(item.criadorCod),
      previsaoPagamento: item.previsaoPagamento ? new Date(item.previsaoPagamento) : null,
      pago: item.pago ?? false,
      rotNap: item.rotNap || null,
      niveisExigidos: item.niveisExigidos || null,
      niveisAprovados: item.niveisAprovados || null,
      historicoNiveis: item.historicoNiveis || null,
      temRateio: item.temRateio,
      rateioDetalhe: item.rateioDetalhe || null,
      mapaCotacao: item.mapaCotacao || null,
      nivelAtual: item.nivelAtual,
      aprovadoresPendentes: item.aprovadoresPendentes || null,
      aprovadoresPendentesCod: item.aprovadoresPendentesCod || null,
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
        // notifica quem a alcada aponta como pendente (todos os niveis que
        // faltam, de todas as linhas de rateio); se nao casou ninguem, o grupo
        const idsPendentes = userIdsPendentes(item.aprovadoresPendentesCod);
        const destinatarios = idsPendentes.length
          ? idsPendentes.map((id) => ({ id }))
          : prox.proximoAprovadorUserId
            ? [{ id: prox.proximoAprovadorUserId }]
            : aprovadores;
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
  const pendentesRows = await prisma.aprovacaoSenior.findMany({
    where: { situacaoAtual: { in: ["ANA", "PRE"] } },
    select: { numOcp: true },
  });
  // resolvidas nos ultimos 30 dias -- o sync re-puxa elas uma vez pra
  // corrigir dados que foram gravados antes de um ajuste na regra
  const trintaDiasAtras = new Date(Date.now() - 30 * 86400000);
  const resolvidasRows = await prisma.aprovacaoSenior.findMany({
    where: { resolvidoEm: { gte: trintaDiasAtras } },
    select: { numOcp: true },
  });
  const pendentes = pendentesRows.length;
  const total = await prisma.aprovacaoSenior.count();
  return NextResponse.json({
    pendentes,
    total,
    pendentesNumOcp: pendentesRows.map((r) => r.numOcp),
    resolvidosRecentesNumOcp: resolvidasRows.map((r) => r.numOcp),
  });
}
