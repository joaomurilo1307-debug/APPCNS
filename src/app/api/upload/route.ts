import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canModifyTask } from "@/lib/permissions";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import crypto from "crypto";

const UPLOAD_DIR = process.env.UPLOAD_DIR || "/app/uploads";
const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25MB
const BLOCKED_EXTENSIONS = [".exe", ".bat", ".cmd", ".msi", ".sh", ".ps1", ".vbs", ".js", ".jar", ".com", ".scr"];

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  const taskId = formData.get("taskId") as string | null;

  if (!file || !taskId) {
    return NextResponse.json({ error: "Arquivo e taskId são obrigatórios" }, { status: 422 });
  }

  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json({ error: "Arquivo maior que 25MB" }, { status: 413 });
  }
  const ext = path.extname(file.name).toLowerCase();
  if (BLOCKED_EXTENSIONS.includes(ext)) {
    return NextResponse.json({ error: "Tipo de arquivo não permitido" }, { status: 422 });
  }

  const task = await prisma.task.findUnique({ where: { id: taskId } });
  if (!task) return NextResponse.json({ error: "Tarefa não encontrada" }, { status: 404 });

  const userId = (session.user as any).id;
  const role = (session.user as any).role;
  if (!canModifyTask(role, task.assigneeId === userId, task.locked)) {
    return NextResponse.json({ error: "Sem permissão para anexar arquivos nesta tarefa" }, { status: 403 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const safeName = `${crypto.randomUUID()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
  const taskDir = path.join(UPLOAD_DIR, taskId);
  await mkdir(taskDir, { recursive: true });
  const filePath = path.join(taskDir, safeName);
  await writeFile(filePath, buffer);

  const attachment = await prisma.attachment.create({
    data: {
      taskId,
      fileName: file.name,
      filePath: path.join(taskId, safeName),
      fileSize: buffer.length,
      uploadedBy: (session.user as any).id,
    },
  });

  return NextResponse.json(attachment, { status: 201 });
}
