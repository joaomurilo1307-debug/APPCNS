import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: Request) {
  const chave = req.headers.get("x-sync-key");
  if (!chave || chave !== process.env.SENIOR_SYNC_KEY) {
    return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });
  }
  const numOcps = ["4451", "9347"];
  const ocs = await prisma.aprovacaoSenior.findMany({
    where: { numOcp: { in: numOcps } },
    select: { numOcp: true, fornecedorCodigo: true, fornecedorNome: true, usuNumTit: true, usuNumNfc: true },
  });
  const titulos = await prisma.tituloContasAPagar.findMany({
    where: {
      OR: [
        { numTit: { in: ["002962", "9PL01"] } },
        { numTit: { in: ["65778/01", "2923/01", "2516/01", "2922/01"] } },
      ],
    },
    select: { numTit: true, codFor: true, fornecedorNome: true, valorOriginal: true },
  });
  return NextResponse.json({ ocs, titulos });
}
