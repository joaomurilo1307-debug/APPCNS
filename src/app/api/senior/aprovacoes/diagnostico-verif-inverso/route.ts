import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { criarMotorVinculo } from "@/lib/vinculoOcTitulo";

// Diagnostico TEMPORARIO (14/09/2026): confirma que o sentido inverso
// (OC -> titulo) bate com o sentido direto ja validado. Remover depois.
export async function GET(req: Request) {
  const chave = req.headers.get("x-sync-key");
  if (!chave || chave !== process.env.SENIOR_SYNC_KEY) {
    return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });
  }
  const numOcp = new URL(req.url).searchParams.get("numOcp") || "10541";

  const [titulos, ocs] = await Promise.all([
    prisma.tituloContasAPagar.findMany(),
    prisma.aprovacaoSenior.findMany({
      select: {
        numOcp: true, codFil: true, fornecedorCodigo: true, fornecedorNome: true, valor: true,
        dataEmissao: true, situacaoAtual: true, usuNumTit: true, usuNumNfc: true, codccu: true,
        contratoNome: true, temRateio: true, previsaoPagamento: true,
      },
    }),
  ]);
  const motor = criarMotorVinculo(ocs);
  const encontrados = titulos.filter((t) => motor.ocRelacionadaDe(t).ocRelacionada?.numOcp === numOcp);

  return NextResponse.json({
    numOcp,
    quantidade: encontrados.length,
    titulos: encontrados.map((t) => ({ numTit: t.numTit, pago: t.pago, valorOriginal: t.valorOriginal })),
  });
}
