import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

// Espelho de consulta do ledger IMUTAVEL rito_financeiro.historico_ccu_colaborador
// (Postgres do Rito, VPS 2.25.191.135) -- qual CC cada colaborador CLT tinha em
// cada mes, capturado NAQUELE mes pela cascata mensal (nunca reescrito depois).
// Existe pq R034FUN.CODCCU no Senior so guarda o valor ATUAL (achado 11/09/2026,
// caso Elisangela/ALCOA CT PR 052/2025: contrato ja encerrado aparecia com
// margem otima porque o custo dela tinha ido pro CC novo).
//
// Diferente do sync de custos-conta: aqui NUNCA se apaga nada. A fonte
// (Postgres do Rito) so' cresce (INSERT ON CONFLICT DO NOTHING la), entao
// aqui e' so upsert simples -- se um (matricula,competencia) ja existe, o
// valor gravado e' definitivo e nao muda; upsert e' so pra idempotencia do
// proprio sync (rodar de novo nao duplica).

const itemSchema = z.object({
  matricula: z.string(),
  colaborador: z.string(),
  codccu: z.string(),
  competencia: z.string(), // ISO, dia 1 do mes
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
    return NextResponse.json({ ok: true, processados: 0, totalRecebido: 0 });
  }

  const times = await prisma.team.findMany({ where: { codccu: { not: null } }, select: { id: true, codccu: true } });
  const teamPorCcu = new Map(times.map((t) => [t.codccu as string, t.id]));

  let processados = 0;
  for (const item of itens) {
    const teamId = teamPorCcu.get(item.codccu) ?? null;
    await prisma.historicoCcuColaborador.upsert({
      where: { matricula_competencia: { matricula: item.matricula, competencia: new Date(item.competencia) } },
      update: { codccu: item.codccu, colaborador: item.colaborador, teamId },
      create: {
        matricula: item.matricula,
        colaborador: item.colaborador,
        codccu: item.codccu,
        competencia: new Date(item.competencia),
        teamId,
      },
    });
    processados++;
  }

  return NextResponse.json({ ok: true, processados, totalRecebido: itens.length });
}

export async function GET(req: Request) {
  const chave = req.headers.get("x-sync-key");
  if (!chave || chave !== process.env.SENIOR_SYNC_KEY) {
    return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });
  }
  const total = await prisma.historicoCcuColaborador.count();
  const ultimaCompetencia = await prisma.historicoCcuColaborador.findFirst({ orderBy: { competencia: "desc" }, select: { competencia: true } });
  return NextResponse.json({ total, ultimaCompetencia: ultimaCompetencia?.competencia ?? null });
}
