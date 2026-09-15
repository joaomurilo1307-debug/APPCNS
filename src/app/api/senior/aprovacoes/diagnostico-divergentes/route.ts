import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: Request) {
  const chave = req.headers.get("x-sync-key");
  if (!chave || chave !== process.env.SENIOR_SYNC_KEY) {
    return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });
  }
  const ocs = await prisma.aprovacaoSenior.findMany({
    where: { numOcp: { in: ["136", "316", "635", "638", "3184"] } },
    select: { numOcp: true, situacaoAtual: true, resolvidoEm: true, resolvidoComo: true, niveisExigidos: true, niveisAprovados: true },
  });
  return NextResponse.json({ ocs });
}
