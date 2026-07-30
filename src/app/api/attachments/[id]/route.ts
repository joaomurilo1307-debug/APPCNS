import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { UPLOAD_DIR } from "@/lib/uploadValidation";
import { readFile } from "fs/promises";
import path from "path";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const userId = (session.user as any).id;
  const role = (session.user as any).role;

  const attachment = await prisma.attachment.findUnique({
    where: { id: params.id },
    include: {
      teamMessage: { select: { teamId: true } },
      directMessage: { select: { senderId: true, receiverId: true } },
    },
  });
  if (!attachment) return NextResponse.json({ error: "Não encontrado" }, { status: 404 });

  if (attachment.teamMessageId && attachment.teamMessage) {
    const isMember =
      role === "ADMIN" ||
      !!(await prisma.userTeam.findUnique({
        where: { userId_teamId: { userId, teamId: attachment.teamMessage.teamId } },
      }));
    if (!isMember) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  } else if (attachment.directMessageId && attachment.directMessage) {
    const isParticipant =
      role === "ADMIN" ||
      attachment.directMessage.senderId === userId ||
      attachment.directMessage.receiverId === userId;
    if (!isParticipant) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  } else if (!attachment.taskId) {
    return NextResponse.json({ error: "Não encontrado" }, { status: 404 });
  }
  // anexos de tarefa: leitura aberta a qualquer autenticado, mesmo padrão do GET de tarefa individual

  let bytes: Buffer;
  try {
    bytes = await readFile(path.join(UPLOAD_DIR, attachment.filePath));
  } catch {
    return NextResponse.json({ error: "Arquivo não encontrado em disco" }, { status: 404 });
  }

  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Disposition": `attachment; filename="${encodeURIComponent(attachment.fileName)}"`,
      "Content-Length": String(attachment.fileSize),
    },
  });
}
