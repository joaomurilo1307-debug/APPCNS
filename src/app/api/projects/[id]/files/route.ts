import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isTeamMember } from "@/lib/permissions";
import { validateUploadFile, saveUploadedFile } from "@/lib/uploadValidation";

async function requireProjectMember(userId: string, role: string, projectId: string) {
  const project = await prisma.project.findUnique({ where: { id: projectId }, select: { teamId: true } });
  if (!project) return null;
  const member = await isTeamMember(userId, role, project.teamId);
  return member ? project : null;
}

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const userId = (session.user as any).id;
  const role = (session.user as any).role;

  if (!(await requireProjectMember(userId, role, params.id))) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const files = await prisma.attachment.findMany({
    where: {
      OR: [{ projectId: params.id }, { folder: { projectId: params.id } }],
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

  if (!(await requireProjectMember(userId, role, params.id))) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  const folderId = (formData.get("folderId") as string | null) || null;
  if (!file) return NextResponse.json({ error: "Arquivo é obrigatório" }, { status: 422 });

  if (folderId) {
    const folder = await prisma.folder.findUnique({ where: { id: folderId } });
    if (!folder || folder.projectId !== params.id) {
      return NextResponse.json({ error: "Pasta inválida" }, { status: 422 });
    }
  }

  const validation = validateUploadFile(file);
  if (!validation.ok) return NextResponse.json({ error: validation.error }, { status: validation.status });

  const { filePath, fileSize } = await saveUploadedFile(file, `projects/${params.id}`);

  const attachment = await prisma.attachment.create({
    data: {
      projectId: params.id,
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
