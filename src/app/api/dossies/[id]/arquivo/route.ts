import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { UPLOAD_DIR } from "@/lib/uploadValidation";
import { readFile } from "fs/promises";
import path from "path";

// Serve o PDF do dossiê pelo próprio sistema -- quem confere não precisa de
// login no Senior nem sair da tela. Inline, pra abrir no visualizador do
// navegador em vez de baixar.

const PAPEIS = ["ADMIN", "DIRETOR", "GESTOR_PROJETO", "APROVADOR"];

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const user = session.user as any;
  if (!PAPEIS.includes(user.role)) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const dossie = await prisma.dossieOC.findUnique({ where: { id: params.id } });
  if (!dossie) return NextResponse.json({ error: "Dossiê não encontrado" }, { status: 404 });
  if (!dossie.arquivoPath) {
    return NextResponse.json(
      { error: dossie.motivo || "Este dossiê não tem documento gerado" },
      { status: 404 }
    );
  }

  let bytes: Buffer;
  try {
    bytes = await readFile(path.join(UPLOAD_DIR, dossie.arquivoPath));
  } catch {
    return NextResponse.json({ error: "Arquivo não encontrado em disco" }, { status: 404 });
  }

  const nome = dossie.arquivoNome || `dossie-${dossie.numOcp ?? dossie.id}.pdf`;
  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${encodeURIComponent(nome)}"`,
      "Content-Length": String(bytes.length),
    },
  });
}
