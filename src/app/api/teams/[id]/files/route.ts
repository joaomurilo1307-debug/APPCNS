import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isTeamMember } from "@/lib/permissions";
import { validateUploadFile, saveUploadedFile } from "@/lib/uploadValidation";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const userId = (session.user as any).id;
  const role = (session.user as any).role;

  if (!(await isTeamMember(userId, role, params.id))) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const files = await prisma.attachment.findMany({
    where: {
      OR: [{ teamId: params.id }, { folder: { teamId: params.id } }],
    },
    include: { uploader: { select: { id: true, name: true } } },
    orderBy: { uploadedAt: "desc" },
  });
  return NextResponse.json(files);
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const userId = (session.user as any).id;
  const role = (session.user as any).role;

  if (!(await isTeamMember(userId, role, params.id))) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  const folderId = (formData.get("folderId") as string | null) || null;
  if (!file) return NextResponse.json({ error: "Arquivo é obrigatório" }, { status: 422 });

  if (folderId) {
    const folder = await prisma.folder.findUnique({ where: { id: folderId } });
    if (!folder || folder.teamId !== params.id) {
      return NextResponse.json({ error: "Pasta inválida" }, { status: 422 });
    }
  }

  const validation = validateUploadFile(file);
  if (!validation.ok) return NextResponse.json({ error: validation.error }, { status: validation.status });

  const { filePath, fileSize } = await saveUploadedFile(file, `teams/${params.id}`);

  const attachment = await prisma.attachment.create({
    data: {
      teamId: params.id,
      folderId,
      fileName: file.name,
      filePath,
      fileSize,
      uploadedBy: userId,
    },
    include: { uploader: { select: { id: true, name: true } } },
  });
  return NextResponse.json(attachment, { status: 201 });
}
