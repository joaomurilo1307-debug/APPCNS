import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { validateUploadFile, saveUploadedFile } from "@/lib/uploadValidation";
import { isTeamMember } from "@/lib/permissions";

export async function POST(req: Request, { params }: { params: { teamId: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const userId = (session.user as any).id;
  const role = (session.user as any).role;
  if (!(await isTeamMember(userId, role, params.teamId))) {
    return NextResponse.json({ error: "Você não faz parte desta equipe" }, { status: 403 });
  }

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  const caption = (formData.get("body") as string | null) ?? "";
  if (!file) return NextResponse.json({ error: "Arquivo é obrigatório" }, { status: 422 });

  const validation = validateUploadFile(file);
  if (!validation.ok) return NextResponse.json({ error: validation.error }, { status: validation.status });

  const { filePath, fileSize } = await saveUploadedFile(file, `chat/team/${params.teamId}`);

  const message = await prisma.$transaction(async (tx) => {
    const msg = await tx.teamMessage.create({
      data: { teamId: params.teamId, senderId: userId, body: caption.trim() || `📎 ${file.name}` },
    });
    await tx.attachment.create({
      data: {
        teamMessageId: msg.id,
        fileName: file.name,
        filePath,
        fileSize,
        uploadedBy: userId,
      },
    });
    return tx.teamMessage.findUniqueOrThrow({
      where: { id: msg.id },
      include: {
        sender: { select: { id: true, name: true, avatarColor: true } },
        attachments: { select: { id: true, fileName: true, fileSize: true } },
      },
    });
  });

  return NextResponse.json(message, { status: 201 });
}
