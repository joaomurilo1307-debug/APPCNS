import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Rota temporaria de diagnostico -- caso "lavagem" apontado pelo Joao
// 14/09/2026 (titulo de fornecedor com "lavagem" no nome aparecendo sem OC
// vinculada, mesmo achando que deveria ter). Objetivo: (1) achar o
// fornecedor real; (2) listar titulos + OCs sincronizadas pra ele;
// (3) contar o total de OCs que a base local tem (pra entender o quao
// completo eh o historico sincronizado). So leitura, remove depois.
export async function GET(req: Request) {
  const chave = req.headers.get("x-sync-key");
  if (!chave || chave !== process.env.SENIOR_SYNC_KEY) {
    return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });
  }

  const [titulos, ocs, totalOcs, situacoesCount] = await Promise.all([
    prisma.tituloContasAPagar.findMany({
      where: { fornecedorNome: { contains: "LAVAGEM", mode: "insensitive" } },
      orderBy: { dataEmissao: "desc" },
    }),
    prisma.aprovacaoSenior.findMany({
      where: { fornecedorNome: { contains: "LAVAGEM", mode: "insensitive" } },
      orderBy: { dataEmissao: "desc" },
    }),
    prisma.aprovacaoSenior.count(),
    prisma.aprovacaoSenior.groupBy({ by: ["situacaoAtual"], _count: true }),
  ]);

  const codsFornecedor = Array.from(new Set(titulos.map((t) => t.codFor)));
  const ocsPorCodigo = codsFornecedor.length
    ? await prisma.aprovacaoSenior.findMany({
        where: { fornecedorCodigo: { in: codsFornecedor } },
        orderBy: { dataEmissao: "desc" },
      })
    : [];

  return NextResponse.json({
    totalOcsNaBaseLocal: totalOcs,
    situacoesNaBaseLocal: situacoesCount,
    titulosEncontrados: titulos.length,
    titulos: titulos.map((t) => ({
      numTit: t.numTit,
      codFor: t.codFor,
      fornecedorNome: t.fornecedorNome,
      tipo: t.tipo,
      situacao: t.situacao,
      pago: t.pago,
      dataEmissao: t.dataEmissao,
      valorOriginal: t.valorOriginal,
      numOcp: t.numOcp,
    })),
    ocsPorNomeFornecedor: ocs.map((o) => ({
      numOcp: o.numOcp,
      fornecedorCodigo: o.fornecedorCodigo,
      fornecedorNome: o.fornecedorNome,
      valor: o.valor,
      dataEmissao: o.dataEmissao,
      situacaoAtual: o.situacaoAtual,
      niveisExigidos: o.niveisExigidos,
      niveisAprovados: o.niveisAprovados,
      usuNumTit: o.usuNumTit,
    })),
    ocsPorCodigoFornecedor: ocsPorCodigo.map((o) => ({
      numOcp: o.numOcp,
      fornecedorCodigo: o.fornecedorCodigo,
      fornecedorNome: o.fornecedorNome,
      valor: o.valor,
      dataEmissao: o.dataEmissao,
      situacaoAtual: o.situacaoAtual,
      niveisExigidos: o.niveisExigidos,
      niveisAprovados: o.niveisAprovados,
      usuNumTit: o.usuNumTit,
    })),
  });
}
