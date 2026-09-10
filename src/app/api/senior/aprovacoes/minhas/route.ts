import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// Ordens de compra do Senior pendentes que estao roteadas pro usuario
// logado (AprovacaoSenior.proximoAprovadorUserId). Alimenta a secao
// "aguardando voce" da pagina pessoal /aprovacoes. Se o de-para de
// usuarios do Senior ainda nao estiver preenchido, ninguem tem OC
// roteada e a secao simplesmente nao aparece.
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const userId = (session.user as any).id as string;

  const ocs = await prisma.aprovacaoSenior.findMany({
    where: { situacaoAtual: { in: ["ANA", "PRE"] }, proximoAprovadorUserId: userId },
    orderBy: { dataEmissao: "asc" },
    select: {
      id: true,
      numOcp: true,
      valor: true,
      fornecedorNome: true,
      fornecedorCodigo: true,
      contratoNome: true,
      contratoTexto: true,
      codccu: true,
      nivelAtual: true,
      dataEmissao: true,
    },
  });

  return NextResponse.json({ ocs });
}
