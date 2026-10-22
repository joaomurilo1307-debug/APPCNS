import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { negarSemModulo } from "@/lib/acesso/servidor";
import { prisma } from "@/lib/prisma";


export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const role = (session.user as any).role;
  const negado = await negarSemModulo(session.user as any, "pagamentos_itau");
  if (negado) return negado;

  const remessa = await prisma.remessaPagamento.findUnique({ where: { id: params.id } });
  if (!remessa || !remessa.conteudoArquivo) return NextResponse.json({ error: "Remessa não encontrada" }, { status: 404 });

  return new NextResponse(remessa.conteudoArquivo, {
    headers: {
      "Content-Type": "text/plain; charset=ascii",
      "Content-Disposition": `attachment; filename="${(remessa.nomeArquivo ?? `remessa-${remessa.id}`).replace(/\.(rem|txt)$/i, "")}.txt"`,
    },
  });
}
