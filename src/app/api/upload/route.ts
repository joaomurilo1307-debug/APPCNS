import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canModifyTask } from "@/lib/permissions";
import { validateUploadFile, saveUploadedFile } from "@/lib/uploadValidation";

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  const taskId = formData.get("taskId") as string | null;

  if (!file || !taskId) {
    return NextResponse.json({ error: "Arquivo e taskId são obrigatórios" }, { status: 422 });
  }

  const validation = validateUploadFile(file);
  if (!validation.ok) {
    return NextResponse.json({ error: validation.error }, { status: validation.status });
  }

  const task = await prisma.task.findUnique({ where: { id: taskId } });
  if (!task) return NextResponse.json({ error: "Tarefa não encontrada" }, { status: 404 });

  const userId = (session.user as any).id;
  const role = (session.user as any).role;
  if (!canModifyTask(role, task.assigneeId === userId, task.locked)) {
    return NextResponse.json({ error: "Sem permissão para anexar arquivos nesta tarefa" }, { status: 403 });
  }

  const { filePath, fileSize } = await saveUploadedFile(file, taskId);

  const attachment = await prisma.attachment.create({
    data: {
      taskId,
      fileName: file.name,
      filePath,
      fileSize,
      uploadedBy: userId,
    },
  });

  return NextResponse.json(attachment, { status: 201 });
}
