import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Rota de diagnostico TEMPORARIA (14/09/2026) -- investigar o caso
// FORTE PNEUS / OC 4133 apontado pelo Joao (vinculo aproximado repetido em
// 27+ titulos, aparenta nao bater com o Senior ao vivo). Mesmo padrao de
// auth por chave da sync da rota anterior. Remover depois que a
// investigacao fechar.
export async function GET(req: Request) {
  const chave = req.headers.get("x-sync-key");
  if (!chave || chave !== process.env.SENIOR_SYNC_KEY) {
    return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });
  }

  const [titulos, ocsTodasFornecedor, oc4133] = await Promise.all([
    prisma.tituloContasAPagar.findMany({
      where: { fornecedorNome: { contains: "FORTE PNEUS", mode: "insensitive" } },
      select: { numTit: true, codFor: true, codFil: true, fornecedorNome: true, valorOriginal: true, dataEmissao: true, tipo: true, pago: true },
      orderBy: { numTit: "asc" },
    }),
    prisma.aprovacaoSenior.findMany({
      where: { fornecedorNome: { contains: "FORTE PNEUS", mode: "insensitive" } },
      select: { numOcp: true, fornecedorCodigo: true, fornecedorNome: true, valor: true, dataEmissao: true, situacaoAtual: true, usuNumTit: true },
    }),
    prisma.aprovacaoSenior.findUnique({
      where: { numOcp: "4133" },
    }),
  ]);

  return NextResponse.json({
    qtdTitulosForte: titulos.length,
    titulos,
    qtdOcsForte: ocsTodasFornecedor.length,
    ocsForte: ocsTodasFornecedor,
    oc4133,
  });
}
