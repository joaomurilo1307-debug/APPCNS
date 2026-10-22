import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canViewProject, nucleoIdsQueGere } from "@/lib/permissions";

// Associa (POST) ou solta (DELETE) um projeto do nucleo. Quem pode: admin, ou o coordenador/gerente DESTE nucleo, e so' de projeto que
// ele ja enxerga. O projeto ligado ao nucleo passa a aparecer para o coordenador e o gerente (src/lib/permissions.ts).
const schema = z.object({ projectId: z.string().min(1) });

async function autorizar(nucleoId: string, req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return { erro: NextResponse.json({ error: "Não autenticado" }, { status: 401 }) };
  const u = session.user as any;
  const nucleo = await prisma.nucleo.findUnique({ where: { id: nucleoId }, select: { id: true } });
  if (!nucleo) return { erro: NextResponse.json({ error: "Núcleo não encontrado" }, { status: 404 }) };
  if (u.role !== "ADMIN" && !(await nucleoIdsQueGere(u.id)).includes(nucleoId)) {
    return { erro: NextResponse.json({ error: "Só o coordenador ou o gerente do núcleo (ou um admin) associa projetos" }, { status: 403 }) };
  }
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return { erro: NextResponse.json({ error: "Informe o projeto" }, { status: 422 }) };
  if (!(await canViewProject(u.id, u.role, parsed.data.projectId))) {
    return { erro: NextResponse.json({ error: "Você não enxerga este projeto" }, { status: 403 }) };
  }
  return { projectId: parsed.data.projectId };
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const a = await autorizar(params.id, req);
  if (a.erro) return a.erro;
  await prisma.nucleo.update({ where: { id: params.id }, data: { projetos: { connect: { id: a.projectId } } } });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  const a = await autorizar(params.id, req);
  if (a.erro) return a.erro;
  await prisma.nucleo.update({ where: { id: params.id }, data: { projetos: { disconnect: { id: a.projectId } } } });
  return NextResponse.json({ ok: true });
}
