import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import crypto from "crypto";

const UPLOAD_DIR = process.env.UPLOAD_DIR || "/app/uploads";

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  const taskId = formData.get("taskId") as string | null;

  if (!file || !taskId) {
    return NextResponse.json({ error: "Arquivo e taskId são obrigatórios" }, { status: 422 });
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
