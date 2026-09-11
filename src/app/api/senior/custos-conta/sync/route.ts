import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

// Sincronizacao do custo por plano de contas (conta_financeira), agregado
// por CCU/mes, a partir de rito_financeiro.composicao_custo_financeiro.
// Chamado pelo mesmo mecanismo das aprovacoes (chave SENIOR_SYNC_KEY), mas
// disparado junto com a cascata MENSAL do Rito de Gestao -- o dado fonte so
// muda quando o mes fecha, nao precisa de sync frequente feito o de OC.
//
// Cada item ja vem agregado (SUM(valor_rateado) por codccu+conta_financeira
// +mes) do lado do script Python, sempre para a MESMA janela rolante (13
// meses) -- e a gente tenta ligar o item a uma Team existente via
// Team.codccu pra habilitar o filtro de visibilidade "só quem está no
// contrato ou é gestor da equipe".
//
// Semantica de JANELA, nao so upsert: se uma linha (codccu+conta+mes) que
// existia numa sincronizacao anterior PAROU de vir (porque a fonte no Rito
// mudou -- ex: uma conta que passou a ser excluida do calculo, tipo "IRRF
// Colaboradores" em 10/09/2026), ela precisa ser APAGADA daqui tambem, senao
// fica orfa pra sempre (upsert nunca remove o que sumiu). Por isso: dentro
// da janela coberta pelo payload, tudo que nao veio de novo e' deletado.

const itemSchema = z.object({
  codccu: z.string(),
  contrato: z.string(),
  contaFinanceira: z.string(),
  competencia: z.string(), // ISO, dia 1 do mes
  valor: z.number(),
});

const bodySchema = z.object({
  itens: z.array(itemSchema),
});

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

  const itens = parsed.data.itens;
  if (itens.length === 0) {
    return NextResponse.json({ ok: true, processados: 0, totalRecebido: 0, removidos: 0, ccusSemEquipe: [] });
  }

  const times = await prisma.team.findMany({ where: { codccu: { not: null } }, select: { id: true, codccu: true } });
  const teamPorCcu = new Map(times.map((t) => [t.codccu as string, t.id]));

  let processados = 0;
  const semEquipe = new Set<string>();

  // janela coberta por este sync = do mes mais antigo do payload pra frente
  const competencias = itens.map((i) => new Date(i.competencia).getTime());
  const inicioJanela = new Date(Math.min(...competencias));
  const chavesRecebidas = new Set(itens.map((i) => `${i.codccu}|${i.contaFinanceira}|${i.competencia}`));

  const existentesNaJanela = await prisma.custoContaFinanceira.findMany({
    where: { competencia: { gte: inicioJanela } },
    select: { id: true, codccu: true, contaFinanceira: true, competencia: true },
  });
  const idsParaRemover = existentesNaJanela
    .filter((r) => !chavesRecebidas.has(`${r.codccu}|${r.contaFinanceira}|${r.competencia.toISOString().slice(0, 10)}`))
    .map((r) => r.id);

  if (idsParaRemover.length > 0) {
    await prisma.custoContaFinanceira.deleteMany({ where: { id: { in: idsParaRemover } } });
  }

  for (const item of itens) {
    const teamId = teamPorCcu.get(item.codccu) ?? null;
    if (!teamId) semEquipe.add(item.codccu);

    await prisma.custoContaFinanceira.upsert({
      where: {
        codccu_contaFinanceira_competencia: {
          codccu: item.codccu,
          contaFinanceira: item.contaFinanceira,
          competencia: new Date(item.competencia),
        },
      },
      update: { valor: item.valor, contrato: item.contrato, teamId },
      create: {
        codccu: item.codccu,
        contrato: item.contrato,
        contaFinanceira: item.contaFinanceira,
        competencia: new Date(item.competencia),
        valor: item.valor,
        teamId,
      },
    });
    processados++;
  }

  return NextResponse.json({
    ok: true,
    processados,
    totalRecebido: itens.length,
    removidos: idsParaRemover.length,
    ccusSemEquipe: Array.from(semEquipe),
  });
}

export async function GET(req: Request) {
  const chave = req.headers.get("x-sync-key");
  if (!chave || chave !== process.env.SENIOR_SYNC_KEY) {
    return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });
  }
  const total = await prisma.custoContaFinanceira.count();
  const ultimaCompetencia = await prisma.custoContaFinanceira.findFirst({ orderBy: { competencia: "desc" }, select: { competencia: true } });
  return NextResponse.json({ total, ultimaCompetencia: ultimaCompetencia?.competencia ?? null });
}
