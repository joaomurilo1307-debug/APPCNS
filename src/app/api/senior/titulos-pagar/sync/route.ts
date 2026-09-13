import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

// Programação de Contas a Pagar por título (E501TCP, Senior). Traz TUDO —
// abertos (SITTIT='AB') e o histórico completo de pagos (SITTIT='LQ',
// 17.136 títulos) — pedido do João 13/09/2026: ele quer ver o histórico de
// pagos e a programação da semana, não só o que está em aberto.
//
// Chave: numTit sozinho NÃO identifica um título (nem +codFil, nem +codFor
// -- achado 13/09/2026, 101 pares repetidos, 161 títulos se perderiam).
// (numTit,codFil,codFor,tipo,dataEmissao) é a chave real, 100% única —
// checada nos 19.602 títulos reais (abertos + pagos) antes de assumir.
//
// Quando um título MUDA de aberto pra pago no Senior, a chave continua a
// MESMA (numTit/codFor/tipo/dataEmissao não mudam) -- o upsert atualiza a
// linha existente (pago:true, dataPagamento preenchida) em vez de duplicar.
// Por isso a limpeza de "sumiu da fonte" só precisa rodar dentro do
// conjunto ABERTO (que pode encolher quando algo é pago ou cancelado);
// o histórico de pagos só cresce, nunca precisa de limpeza.
//
// Envio em lote único (não em paginas) -- a limpeza de "sumiu" (janela)
// só funciona corretamente com o conjunto completo dos abertos numa
// chamada só. Upserts rodam em paralelo limitado (50 por vez) porque
// 19 mil upserts sequenciais um a um demoraria demais.

const itemSchema = z.object({
  numTit: z.string(),
  codFil: z.string(),
  codFor: z.string(),
  fornecedorNome: z.string().nullable(),
  tipo: z.string(),
  situacao: z.string(),
  pago: z.boolean(),
  dataEmissao: z.string(), // sempre presente na base real
  vencimentoOriginal: z.string().nullable(),
  vencimentoProgramado: z.string().nullable(),
  valorOriginal: z.number(),
  valorAberto: z.number(),
  dataPagamento: z.string().nullable(),
  codccu: z.string().nullable(),
  ccuNome: z.string().nullable(),
  numOcp: z.string().nullable(),
});

const bodySchema = z.object({ itens: z.array(itemSchema) });

function chaveDe(i: { numTit: string; codFil: string; codFor: string; tipo: string; dataEmissao: string }) {
  return `${i.numTit}|${i.codFil}|${i.codFor}|${i.tipo}|${i.dataEmissao}`;
}

async function emLotes<T>(items: T[], tamanho: number, fn: (item: T) => Promise<unknown>) {
  for (let i = 0; i < items.length; i += tamanho) {
    await Promise.all(items.slice(i, i + tamanho).map(fn));
  }
}

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
    return NextResponse.json({ ok: true, processados: 0, totalRecebido: 0, removidos: 0 });
  }

  // limpeza: so' entre os que o payload manda como ABERTOS -- um titulo
  // aberto que sumiu do Senior (pago/cancelado fora deste sync) fica orfao
  // senao. Titulos ja pagos no banco nunca sao removidos por aqui.
  const abertosRecebidos = new Set(itens.filter((i) => !i.pago).map(chaveDe));
  const abertosExistentes = await prisma.tituloContasAPagar.findMany({
    where: { pago: false },
    select: { id: true, numTit: true, codFil: true, codFor: true, tipo: true, dataEmissao: true },
  });
  const idsParaRemover = abertosExistentes
    .filter((e) => !abertosRecebidos.has(`${e.numTit}|${e.codFil}|${e.codFor}|${e.tipo}|${e.dataEmissao.toISOString().slice(0, 10)}`))
    .map((e) => e.id);
  if (idsParaRemover.length > 0) {
    await prisma.tituloContasAPagar.deleteMany({ where: { id: { in: idsParaRemover } } });
  }

  let processados = 0;
  await emLotes(itens, 50, async (item) => {
    const dataEmissao = new Date(item.dataEmissao);
    await prisma.tituloContasAPagar.upsert({
      where: {
        numTit_codFil_codFor_tipo_dataEmissao: {
          numTit: item.numTit,
          codFil: item.codFil,
          codFor: item.codFor,
          tipo: item.tipo,
          dataEmissao,
        },
      },
      update: {
        fornecedorNome: item.fornecedorNome,
        situacao: item.situacao,
        pago: item.pago,
        vencimentoOriginal: item.vencimentoOriginal ? new Date(item.vencimentoOriginal) : null,
        vencimentoProgramado: item.vencimentoProgramado ? new Date(item.vencimentoProgramado) : null,
        valorOriginal: item.valorOriginal,
        valorAberto: item.valorAberto,
        dataPagamento: item.dataPagamento ? new Date(item.dataPagamento) : null,
        codccu: item.codccu,
        ccuNome: item.ccuNome,
        numOcp: item.numOcp,
      },
      create: {
        numTit: item.numTit,
        codFil: item.codFil,
        codFor: item.codFor,
        tipo: item.tipo,
        dataEmissao,
        fornecedorNome: item.fornecedorNome,
        situacao: item.situacao,
        pago: item.pago,
        vencimentoOriginal: item.vencimentoOriginal ? new Date(item.vencimentoOriginal) : null,
        vencimentoProgramado: item.vencimentoProgramado ? new Date(item.vencimentoProgramado) : null,
        valorOriginal: item.valorOriginal,
        valorAberto: item.valorAberto,
        dataPagamento: item.dataPagamento ? new Date(item.dataPagamento) : null,
        codccu: item.codccu,
        ccuNome: item.ccuNome,
        numOcp: item.numOcp,
      },
    });
    processados++;
  });

  return NextResponse.json({ ok: true, processados, totalRecebido: itens.length, removidos: idsParaRemover.length });
}

export async function GET(req: Request) {
  const chave = req.headers.get("x-sync-key");
  if (!chave || chave !== process.env.SENIOR_SYNC_KEY) {
    return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });
  }
  const total = await prisma.tituloContasAPagar.count();
  return NextResponse.json({ total });
}
