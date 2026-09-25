import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { UPLOAD_DIR, validateUploadFile, saveUploadedFile } from "@/lib/uploadValidation";
import { isTeamMember } from "@/lib/permissions";
import { readFile } from "fs/promises";
import { unlink } from "fs/promises";
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
      project: { select: { teamId: true } },
      folder: { select: { teamId: true, project: { select: { teamId: true } } } },
    },
  });
  if (!attachment) return NextResponse.json({ error: "Não encontrado" }, { status: 404 });

  const folderTeamId = attachment.folder?.teamId ?? attachment.folder?.project?.teamId;

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
  } else if (attachment.projectId && attachment.project) {
    if (!(await isTeamMember(userId, role, attachment.project.teamId))) {
      return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
    }
  } else if (attachment.teamId) {
    if (!(await isTeamMember(userId, role, attachment.teamId))) {
      return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
    }
  } else if (attachment.folderId && folderTeamId) {
    if (!(await isTeamMember(userId, role, folderTeamId))) {
      return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
    }
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

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const userId = (session.user as any).id;
  const role = (session.user as any).role;

  const attachment = await prisma.attachment.findUnique({
    where: { id: params.id },
    include: {
      project: { select: { teamId: true } },
      folder: { select: { teamId: true, project: { select: { teamId: true } } } },
    },
  });
  if (!attachment) return NextResponse.json({ error: "Não encontrado" }, { status: 404 });

  const teamId = attachment.projectId
    ? attachment.project?.teamId
    : attachment.teamId ?? attachment.folder?.teamId ?? attachment.folder?.project?.teamId;
  if (!teamId) {
    return NextResponse.json({ error: "Este tipo de anexo ainda não pode ser substituído por aqui" }, { status: 400 });
  }
  if (!(await isTeamMember(userId, role, teamId))) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "Arquivo é obrigatório" }, { status: 422 });

  const validation = validateUploadFile(file);
  if (!validation.ok) return NextResponse.json({ error: validation.error }, { status: validation.status });

  const subDir = attachment.projectId ? `projects/${attachment.projectId}` : `teams/${attachment.teamId}`;
  const { filePath, fileSize } = await saveUploadedFile(file, subDir);

  const oldFilePath = attachment.filePath;
  const updated = await prisma.attachment.update({
    where: { id: params.id },
    data: { fileName: file.name, filePath, fileSize, uploadedAt: new Date() },
  });

  try {
    await unlink(path.join(UPLOAD_DIR, oldFilePath));
  } catch {
    // arquivo antigo já pode ter sido removido — não bloqueia a troca
  }

  return NextResponse.json(updated);
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const userId = (session.user as any).id;
  const role = (session.user as any).role;

  const attachment = await prisma.attachment.findUnique({
    where: { id: params.id },
    include: {
      project: { select: { teamId: true } },
      folder: { select: { teamId: true, project: { select: { teamId: true } } } },
    },
  });
  if (!attachment) return NextResponse.json({ error: "Não encontrado" }, { status: 404 });

  // Por enquanto só cobre exclusão de arquivos da aba "Arquivos" do projeto/equipe (projectId/teamId/folderId).
  // Anexos de tarefa/chat não têm exclusão pelo mesmo motivo de sempre: sem endpoint de excluir
  // mensagem ainda, então excluir só o anexo deixaria a mensagem "quebrada".
  const teamId = attachment.projectId
    ? attachment.project?.teamId
    : attachment.teamId ?? attachment.folder?.teamId ?? attachment.folder?.project?.teamId;
  if (!teamId) {
    return NextResponse.json({ error: "Este tipo de anexo ainda não pode ser excluído por aqui" }, { status: 400 });
  }
  if (!(await isTeamMember(userId, role, teamId))) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  await prisma.attachment.delete({ where: { id: params.id } });
  try {
    await unlink(path.join(UPLOAD_DIR, attachment.filePath));
  } catch {
    // arquivo já pode ter sido removido do disco — não bloqueia a exclusão do registro
  }
  return NextResponse.json({ ok: true });
}
