import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

// Sincronizacao periodica das Ordens de Compra pendentes de aprovacao no
// Senior (E420OCP). Chamado pelo script Python que roda no VPS do Rito de
// Gestao (tem acesso ao GetDBInfo do Senior), autenticado por chave
// compartilhada -- nao expoe nenhum dado do Senior sem essa chave.
//
// Efeitos: (1) upsert em AprovacaoSenior por numOcp; (2) toda mudanca de
// situacaoAtual vira 1 linha em AprovacaoSeniorEvento (alimenta o
// relatorio de aprovacao: quem aprovou, quando, tempo parado); (3) OC nova
// e ainda pendente -> Notification pra aprovadores/coordenadores/gerentes/
// diretores; (4) OC que estava pendente e virou APR/REP/CAN -> marca
// resolvidoEm/resolvidoComo.

const itemSchema = z.object({
  numOcp: z.string(),
  dataEmissao: z.string(), // ISO
  fornecedorCodigo: z.string(),
  fornecedorNome: z.string().optional().nullable(),
  valor: z.number(),
  descricao: z.string().optional().nullable(),
  contratoTexto: z.string().optional().nullable(),
  codccu: z.string().optional().nullable(),
  numApr: z.string(),
  rotNap: z.string().optional().nullable(),
  situacaoAtual: z.string(),
  nivelAtual: z.number().int().default(1),
  historicoNiveis: z.string().optional().nullable(),
  temRateio: z.boolean().default(false),
});

const bodySchema = z.object({
  itens: z.array(itemSchema),
});

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

  let novas = 0;
  let atualizadas = 0;
  let resolvidas = 0;
  let notificacoesCriadas = 0;

  for (const item of parsed.data.itens) {
    const existente = await prisma.aprovacaoSenior.findUnique({ where: { numOcp: item.numOcp } });

    if (!existente) {
      const criada = await prisma.aprovacaoSenior.create({
        data: {
          numOcp: item.numOcp,
          dataEmissao: new Date(item.dataEmissao),
          fornecedorCodigo: item.fornecedorCodigo,
          fornecedorNome: item.fornecedorNome,
          valor: item.valor,
          descricao: item.descricao,
          contratoTexto: item.contratoTexto,
          codccu: item.codccu,
          numApr: item.numApr,
          rotNap: item.rotNap,
          situacaoAtual: item.situacaoAtual,
          nivelAtual: item.nivelAtual,
          historicoNiveis: item.historicoNiveis,
          temRateio: item.temRateio,
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
        await prisma.notification.createMany({
          data: aprovadores.map((a) => ({
            userId: a.id,
            type: "APROVACAO_PENDENTE" as const,
            title: `OC ${item.numOcp} aguardando aprovação (${valorFmt})`,
            body: item.descricao?.slice(0, 200) || null,
            link: "/aprovacoes/senior",
          })),
        });
        notificacoesCriadas += aprovadores.length;
      }
      continue;
    }

    if (existente.situacaoAtual !== item.situacaoAtual) {
      await prisma.aprovacaoSeniorEvento.create({
        data: {
          aprovacaoSeniorId: existente.id,
          situacao: item.situacaoAtual,
          nivel: item.nivelAtual,
          observacao: `Mudou de ${existente.situacaoAtual} para ${item.situacaoAtual}`,
        },
      });

      const foiResolvidaAgora = SITUACOES_PENDENTES.has(existente.situacaoAtual) && SITUACOES_RESOLVIDAS.has(item.situacaoAtual);
      await prisma.aprovacaoSenior.update({
        where: { id: existente.id },
        data: {
          situacaoAtual: item.situacaoAtual,
          nivelAtual: item.nivelAtual,
          historicoNiveis: item.historicoNiveis,
          codccu: item.codccu ?? existente.codccu,
          ...(foiResolvidaAgora ? { resolvidoEm: new Date(), resolvidoComo: item.situacaoAtual } : {}),
        },
      });
      if (foiResolvidaAgora) resolvidas++;
      else atualizadas++;
    }
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
