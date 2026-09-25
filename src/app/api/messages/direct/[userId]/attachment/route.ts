import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { validateUploadFile, saveUploadedFile } from "@/lib/uploadValidation";

export async function POST(req: Request, { params }: { params: { userId: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const userId = (session.user as any).id;
  const otherId = params.userId;
  if (otherId === userId) return NextResponse.json({ error: "Não é possível enviar mensagem para si mesmo" }, { status: 422 });

  const target = await prisma.user.findUnique({ where: { id: otherId }, select: { id: true, active: true } });
  if (!target || !target.active) return NextResponse.json({ error: "Usuário não encontrado" }, { status: 404 });

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  const caption = (formData.get("body") as string | null) ?? "";
  if (!file) return NextResponse.json({ error: "Arquivo é obrigatório" }, { status: 422 });

  const validation = validateUploadFile(file);
  if (!validation.ok) return NextResponse.json({ error: validation.error }, { status: validation.status });

  const conversationKey = [userId, otherId].sort().join("_");
  const { filePath, fileSize } = await saveUploadedFile(file, `chat/dm/${conversationKey}`);

  const message = await prisma.$transaction(async (tx) => {
    const msg = await tx.directMessage.create({
      data: { senderId: userId, receiverId: otherId, body: caption.trim() || `📎 ${file.name}` },
    });
    await tx.attachment.create({
      data: {
        directMessageId: msg.id,
        fileName: file.name,
        filePath,
        fileSize,
        uploadedBy: userId,
      },
    });
    return tx.directMessage.findUniqueOrThrow({
      where: { id: msg.id },
      include: { attachments: { select: { id: true, fileName: true, fileSize: true } } },
    });
  });

  return NextResponse.json(message, { status: 201 });
}
