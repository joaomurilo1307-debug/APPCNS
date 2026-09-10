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
// +mes) do lado do script Python -- aqui e so upsert, e a gente tenta ligar
// o item a uma Team existente via Team.codccu pra habilitar o filtro de
// visibilidade "só quem está no contrato ou é gestor da equipe".

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

  const times = await prisma.team.findMany({ where: { codccu: { not: null } }, select: { id: true, codccu: true } });
  const teamPorCcu = new Map(times.map((t) => [t.codccu as string, t.id]));

  let processados = 0;
  const semEquipe = new Set<string>();

  for (const item of parsed.data.itens) {
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
    totalRecebido: parsed.data.itens.length,
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
