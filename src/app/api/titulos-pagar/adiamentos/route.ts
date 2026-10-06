import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// Historico dos titulos "jogados pra proxima programacao" (06/10/2026): fica
// guardado por programacao de origem, mesmo depois que o vencimento mudou no
// Senior e o titulo saiu daquela semana. Le da copia que o proprio adiamento
// guarda (numTit/fornecedor/valor), entao funciona ate se o sincronismo apagar
// ou recriar o titulo.
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const user = session.user as any;
  if (!["ADMIN", "DIRETOR", "GESTOR_PROJETO", "APROVADOR"].includes(user.role)) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const adiamentos = await prisma.tituloAdiamento.findMany({
    orderBy: [{ programacaoOrigem: "desc" }, { marcadoEm: "desc" }],
    take: 1000,
    include: { titulo: { select: { pago: true, vencimentoProgramado: true, valorAberto: true } } },
  });

  return NextResponse.json({
    adiamentos: adiamentos.map((a) => ({
      id: a.id,
      tituloId: a.tituloId,
      numTit: a.numTit,
      fornecedorNome: a.fornecedorNome ?? `código ${a.codFor}`,
      valor: a.valor,
      programacaoOrigem: a.programacaoOrigem,
      marcadoPorNome: a.marcadoPorNome,
      marcadoEm: a.marcadoEm,
      motivo: a.motivo,
      resolvidoEm: a.resolvidoEm,
      resolvidoComo: a.resolvidoComo,
      // Situacao de hoje do titulo, quando ele ainda existe na base.
      pagoAgora: a.titulo?.pago ?? null,
      vencimentoAtual: a.titulo?.vencimentoProgramado ?? null,
    })),
  });
}
