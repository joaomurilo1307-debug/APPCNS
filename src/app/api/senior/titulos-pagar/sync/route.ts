import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

// Programação de Contas a Pagar por título (E501TCP, Senior) -- pedido do
// João 13/09/2026: "cruzar as informações" com Aprovações OC via NUMOCP.
// Semantica de JANELA (igual custos-conta): dentro do que o payload cobre,
// tudo que não veio de novo foi liquidado/cancelado/removido no Senior e
// devia sumir daqui também -- upsert sozinho nunca limpa isso.

const itemSchema = z.object({
  numTit: z.string(),
  codFil: z.string(),
  codFor: z.string(),
  fornecedorNome: z.string().nullable(),
  tipo: z.string(),
  situacao: z.string(),
  pago: z.boolean(),
  dataEmissao: z.string().nullable(),
  vencimentoOriginal: z.string().nullable(),
  vencimentoProgramado: z.string().nullable(),
  valorOriginal: z.number(),
  valorAberto: z.number(),
  codccu: z.string().nullable(),
  ccuNome: z.string().nullable(),
  numOcp: z.string().nullable(),
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
    return NextResponse.json({ ok: true, processados: 0, totalRecebido: 0, removidos: 0 });
  }

  const chavesRecebidas = new Set(itens.map((i) => `${i.numTit}|${i.codFil}`));
  const existentes = await prisma.tituloContasAPagar.findMany({ select: { id: true, numTit: true, codFil: true } });
  const idsParaRemover = existentes.filter((e) => !chavesRecebidas.has(`${e.numTit}|${e.codFil}`)).map((e) => e.id);
  if (idsParaRemover.length > 0) {
    await prisma.tituloContasAPagar.deleteMany({ where: { id: { in: idsParaRemover } } });
  }

  let processados = 0;
  for (const item of itens) {
    await prisma.tituloContasAPagar.upsert({
      where: { numTit_codFil: { numTit: item.numTit, codFil: item.codFil } },
      update: {
        codFor: item.codFor,
        fornecedorNome: item.fornecedorNome,
        tipo: item.tipo,
        situacao: item.situacao,
        pago: item.pago,
        dataEmissao: item.dataEmissao ? new Date(item.dataEmissao) : null,
        vencimentoOriginal: item.vencimentoOriginal ? new Date(item.vencimentoOriginal) : null,
        vencimentoProgramado: item.vencimentoProgramado ? new Date(item.vencimentoProgramado) : null,
        valorOriginal: item.valorOriginal,
        valorAberto: item.valorAberto,
        codccu: item.codccu,
        ccuNome: item.ccuNome,
        numOcp: item.numOcp,
      },
      create: {
        numTit: item.numTit,
        codFil: item.codFil,
        codFor: item.codFor,
        fornecedorNome: item.fornecedorNome,
        tipo: item.tipo,
        situacao: item.situacao,
        pago: item.pago,
        dataEmissao: item.dataEmissao ? new Date(item.dataEmissao) : null,
        vencimentoOriginal: item.vencimentoOriginal ? new Date(item.vencimentoOriginal) : null,
        vencimentoProgramado: item.vencimentoProgramado ? new Date(item.vencimentoProgramado) : null,
        valorOriginal: item.valorOriginal,
        valorAberto: item.valorAberto,
        codccu: item.codccu,
        ccuNome: item.ccuNome,
        numOcp: item.numOcp,
      },
    });
    processados++;
  }

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
