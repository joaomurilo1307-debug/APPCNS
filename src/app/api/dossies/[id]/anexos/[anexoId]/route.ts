import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { readFile } from "fs/promises";
import path from "path";
import { authOptions } from "@/lib/auth";
import { negarSemModulo } from "@/lib/acesso/servidor";
import { prisma } from "@/lib/prisma";
import { UPLOAD_DIR } from "@/lib/uploadValidation";
import { removerAnexo } from "@/lib/dossie/anexos";

// Um anexo do dossiê: abre o arquivo original (GET) ou tira do dossiê (DELETE). Mesmo acesso de quem abre o dossiê.

async function autorizar() {
  const session = await getServerSession(authOptions);
  if (!session) return { erro: NextResponse.json({ error: "Não autenticado" }, { status: 401 }) };
  const negado = await negarSemModulo(session.user as any, "conferencia_oc", "programacao_pagamento");
  if (negado) return { erro: negado };
  return { usuario: session.user as { id?: string; name?: string | null } };
}

export async function GET(_req: Request, { params }: { params: { id: string; anexoId: string } }) {
  const a = await autorizar();
  if (a.erro) return a.erro;
  const anexo = await prisma.dossieAnexo.findFirst({ where: { id: params.anexoId, dossieId: params.id } });
  if (!anexo) return NextResponse.json({ error: "Anexo não encontrado" }, { status: 404 });
  let bytes: Buffer;
  try {
    bytes = await readFile(path.join(UPLOAD_DIR, anexo.caminho));
  } catch {
    return NextResponse.json({ error: "Arquivo não encontrado em disco" }, { status: 404 });
  }
  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      "Content-Type": anexo.tipo,
      "Content-Disposition": `inline; filename="${encodeURIComponent(anexo.nome)}"`,
      "Content-Length": String(bytes.length),
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export async function DELETE(_req: Request, { params }: { params: { id: string; anexoId: string } }) {
  const a = await autorizar();
  if (a.erro) return a.erro;
  const removido = await removerAnexo(params.id, params.anexoId);
  if (!removido) return NextResponse.json({ error: "Anexo não encontrado" }, { status: 404 });
  await prisma.auditLog
    .create({ data: { userId: a.usuario.id ?? null, action: "DOSSIE_ANEXO_REMOVIDO", entityType: "DossieOC", entityId: params.id, metadata: JSON.stringify({ anexoId: removido.id, nome: removido.nome, tipo: removido.tipo, bytes: removido.bytes }) } })
    .catch(() => {});
  return NextResponse.json({ ok: true });
}
