import { prisma } from "@/lib/prisma";

// Prisma nao aceita `null` direto dentro do objeto de where composto de um
// @@unique quando um dos campos e opcional (o tipo gerado exige o escalar, nao
// aceita `| null` ali) — mesmo o banco permitindo. Por isso, pra qualquer
// upsert onde contratoId/tamanho pode ser nulo (deposito geral, produto sem
// tamanho), fazemos find-then-create/update manual em vez de `.upsert()`.

export async function upsertEpiEstoque(
  produtoId: string,
  contratoId: string | null,
  data: { estoqueInicial: number; estoqueMinimo: number }
) {
  const existente = await prisma.epiEstoque.findFirst({ where: { produtoId, contratoId } });
  if (existente) {
    return prisma.epiEstoque.update({ where: { id: existente.id }, data });
  }
  return prisma.epiEstoque.create({ data: { produtoId, contratoId, ...data } });
}

export async function upsertEpiProdutoPorNome(
  nome: string,
  tamanho: string | null,
  create: { tipo?: "EPI" | "EPC" | "FARDAMENTO"; ca?: string | null; unidade?: string },
  update: { ca?: string; unidade?: string }
) {
  const existente = await prisma.epiProduto.findFirst({ where: { nome, tamanho } });
  if (existente) {
    return prisma.epiProduto.update({ where: { id: existente.id }, data: update });
  }
  return prisma.epiProduto.create({ data: { nome, tamanho, ...create } });
}

// Estoque atual de EPI/EPC nunca fica guardado direto no banco — é sempre recalculado
// a partir de estoqueInicial + soma de entradas - soma de saídas em EpiMovimentacao,
// pra nunca dessincronizar do histórico real (mesmo princípio da planilha Excel que
// deu origem a este módulo).
export async function listaEstoqueComCalculo(where: { contratoId?: string | null } = {}) {
  const estoques = await prisma.epiEstoque.findMany({
    where,
    include: { produto: true, contrato: { select: { id: true, codigo: true, nome: true } } },
    orderBy: [{ produto: { nome: "asc" } }],
  });

  const movs = await prisma.epiMovimentacao.groupBy({
    by: ["produtoId", "contratoId", "tipo"],
    _sum: { quantidade: true },
  });

  function movFor(produtoId: string, contratoId: string | null) {
    let entradas = 0;
    let saidas = 0;
    for (const m of movs) {
      if (m.produtoId !== produtoId) continue;
      if ((m.contratoId ?? null) !== (contratoId ?? null)) continue;
      if (m.tipo === "ENTRADA") entradas += m._sum.quantidade ?? 0;
      else saidas += m._sum.quantidade ?? 0;
    }
    return { entradas, saidas };
  }

  return estoques.map((e) => {
    const { entradas, saidas } = movFor(e.produtoId, e.contratoId);
    const atual = e.estoqueInicial + entradas - saidas;
    return {
      id: e.id,
      produto: e.produto,
      contrato: e.contrato,
      estoqueInicial: e.estoqueInicial,
      entradas,
      saidas,
      estoqueAtual: atual,
      estoqueMinimo: e.estoqueMinimo,
      necessidade: Math.max(0, Math.ceil(e.estoqueMinimo - atual)),
      status: atual < e.estoqueMinimo ? ("COMPRAR" as const) : ("OK" as const),
    };
  });
}
