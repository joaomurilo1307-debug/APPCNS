import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const ROLES_LEITURA = ["ADMIN", "DIRETOR", "GESTOR_PROJETO", "APROVADOR"];

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const role = (session.user as any).role;
  if (!ROLES_LEITURA.includes(role)) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

  const remessa = await prisma.remessaPagamento.findUnique({ where: { id: params.id } });
  if (!remessa || !remessa.conteudoArquivo) return NextResponse.json({ error: "Remessa não encontrada" }, { status: 404 });

  return new NextResponse(remessa.conteudoArquivo, {
    headers: {
      "Content-Type": "text/plain; charset=ascii",
      "Content-Disposition": `attachment; filename="${remessa.nomeArquivo ?? `remessa-${remessa.id}.rem`}"`,
    },
  });
}
