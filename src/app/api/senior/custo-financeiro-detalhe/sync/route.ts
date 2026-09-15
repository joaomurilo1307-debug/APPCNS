import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

// Detalhe titulo-a-titulo por tras de cada linha de Custo por Plano de
// Contas -- pedido do Joao 15/09/2026: "abrir a conta financeira e ver os
// lancamentos certinhos, com a OC relacionada". Espelho de
// rito_financeiro.composicao_custo_financeiro (Postgres do Rito), a MESMA
// fonte ja validada que soma pro total exibido em CustoContaFinanceira --
// nunca recalculado aqui, so' copiado.
//
// Sem chave unica de proposito (o titulo pode aparecer >1x na mesma
// conta/mes/CCU/fornecedor -- rateio real, confirmado na fonte). Por isso o
// sync e' sempre substituicao total (apaga tudo, insere tudo de novo) --
// mesma semantica da fonte, que tambem e' recalculada inteira a cada
// cascata mensal.

const itemSchema = z.object({
  codccu: z.string(),
  contaFinanceira: z.string(),
  competencia: z.string(), // ISO, dia 1 do mes
  numTit: z.string(),
  codFor: z.string(),
  fornecedorNome: z.string().nullable(),
  dataEntrada: z.string().nullable(),
  dataVencimento: z.string().nullable(),
  valorRateado: z.number(),
});

const bodySchema = z.object({ itens: z.array(itemSchema) });

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
    return NextResponse.json({ ok: true, processados: 0 });
  }

  await prisma.$transaction(
    async (tx) => {
      await tx.custoFinanceiroDetalhe.deleteMany({});
      await tx.custoFinanceiroDetalhe.createMany({
        data: itens.map((item) => ({
          codccu: item.codccu,
          contaFinanceira: item.contaFinanceira,
          competencia: new Date(item.competencia),
          numTit: item.numTit,
          codFor: item.codFor,
          fornecedorNome: item.fornecedorNome,
          dataEntrada: item.dataEntrada ? new Date(item.dataEntrada) : null,
          dataVencimento: item.dataVencimento ? new Date(item.dataVencimento) : null,
          valorRateado: item.valorRateado,
        })),
      });
    },
    { timeout: 60000 }
  );

  return NextResponse.json({ ok: true, processados: itens.length });
}

export async function GET(req: Request) {
  const chave = req.headers.get("x-sync-key");
  if (!chave || chave !== process.env.SENIOR_SYNC_KEY) {
    return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });
  }
  const total = await prisma.custoFinanceiroDetalhe.count();
  return NextResponse.json({ total });
}
