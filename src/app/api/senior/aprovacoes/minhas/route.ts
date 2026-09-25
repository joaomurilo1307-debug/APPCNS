import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// Ordens de compra do Senior pendentes que estao roteadas pro usuario
// logado. Uma OC "aguarda voce" se voce e o aprovador de QUALQUER nivel
// ainda pendente (alcada multinivel do Senior, E068CNA) -- casado pelo
// seu CODUSU do Senior via UsuarioSenior -- ou, no caso simples de um
// unico aprovador pendente, pelo proximoAprovadorUserId ja resolvido.
// Se o de-para de usuarios do Senior ainda nao estiver preenchido,
// ninguem tem OC roteada e a secao simplesmente nao aparece.
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const userId = (session.user as any).id as string;

  const meusCodigos = new Set(
    (await prisma.usuarioSenior.findMany({ where: { userId }, select: { codigo: true } })).map((u) => u.codigo)
  );

  const candidatas = await prisma.aprovacaoSenior.findMany({
    where: {
      situacaoAtual: { in: ["ANA", "PRE"] },
      OR: [{ proximoAprovadorUserId: userId }, { aprovadoresPendentesCod: { not: null } }],
    },
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
      proximoAprovadorUserId: true,
      temRateio: true,
      niveisExigidos: true,
      niveisAprovados: true,
      nivelAtual: true,
      aprovadoresPendentes: true,
      aprovadoresPendentesCod: true,
      dataEmissao: true,
    },
  });

  const ocs = candidatas.filter((o) => {
    if (o.proximoAprovadorUserId === userId) return true;
    const cods = (o.aprovadoresPendentesCod ?? "").split(",").map((c) => c.trim());
    return cods.some((c) => c && meusCodigos.has(c));
  });

  return NextResponse.json({ ocs });
}
