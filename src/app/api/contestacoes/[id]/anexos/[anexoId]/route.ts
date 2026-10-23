import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { readFile } from "fs/promises";
import path from "path";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ehRevisorDeContestacao } from "@/lib/contestacoesServidor";
import { UPLOAD_DIR } from "@/lib/uploadValidation";

// Baixa um anexo da contestacao: so' o autor, a pessoa indicada, o financeiro (revisor) e o administrador.
export async function GET(_req: Request, { params }: { params: { id: string; anexoId: string } }) {
  const session = await getServerSession(authOptions);
  const user = session?.user as any;
  if (!user?.id) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const anexo = await prisma.contestacaoAnexo.findUnique({ where: { id: params.anexoId }, include: { contestacao: { select: { id: true, autorId: true, indicadoId: true } } } });
  if (!anexo || anexo.contestacao.id !== params.id) return NextResponse.json({ error: "Arquivo não encontrado" }, { status: 404 });
  const c = anexo.contestacao;
  if (c.autorId !== user.id && c.indicadoId !== user.id && !(await ehRevisorDeContestacao(user))) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

  const base = path.resolve(UPLOAD_DIR);
  const arquivo = path.resolve(base, anexo.caminho);
  if (!arquivo.startsWith(base + path.sep)) return NextResponse.json({ error: "Arquivo inválido" }, { status: 400 });
  let bytes: Buffer;
  try {
    bytes = await readFile(arquivo);
  } catch {
    return NextResponse.json({ error: "O arquivo não está mais no servidor" }, { status: 410 });
  }
  return new NextResponse(new Uint8Array(bytes), {
    headers: { "Content-Type": "application/octet-stream", "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(anexo.nome)}`, "Cache-Control": "private, no-store" },
  });
}
