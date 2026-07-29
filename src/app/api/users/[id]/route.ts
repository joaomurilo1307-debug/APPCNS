import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { z } from "zod";

const updateUserSchema = z.object({
  role: z.enum(["ADMIN", "DIRETOR", "GESTOR_PROJETO", "APROVADOR", "COLABORADOR", "CLIENTE", "VISUALIZADOR"]).optional(),
  active: z.boolean().optional(),
  name: z.string().min(2).max(150).optional(),
  avatarColor: z.string().optional(),
  cargo: z.string().optional(),
  setor: z.string().optional(),
  diretoria: z.string().optional(),
  ramal: z.string().optional(),
  whatsapp: z.string().optional(),
  dataInicio: z.string().datetime().nullable().optional(),
  gestorImediatoId: z.string().nullable().optional(),
  password: z.string().min(8).optional(),
  nivelHierarquico: z.enum(["DIRETORIA", "GERENCIA", "COORDENACAO", "COLABORADOR"]).nullable().optional(),
  nucleoId: z.string().nullable().optional(),
  newNucleoName: z.string().min(2).max(100).optional(),
});

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const currentUserId = (session.user as any).id;
  const currentRole = (session.user as any).role;

  const body = await req.json();
  const parsed = updateUserSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });

  const onlyAvatarColor = Object.keys(parsed.data).every((k) => k === "avatarColor");
  const isSelf = currentUserId === params.id;
  const isAdmin = currentRole === "ADMIN";
  const isManagerSettingAvatar = currentRole === "GESTOR_PROJETO" && onlyAvatarColor;

  if (!isAdmin && !(isSelf && onlyAvatarColor) && !isManagerSettingAvatar) {
    return NextResponse.json({ error: "Sem permissão para essa alteração" }, { status: 403 });
  }

  if (parsed.data.password && !isAdmin) {
    return NextResponse.json({ error: "Só administradores podem redefinir a senha de outra pessoa" }, { status: 403 });
  }

  const { dataInicio, password, newNucleoName, ...rest } = parsed.data;

  let nucleoId = rest.nucleoId;
  if (!nucleoId && newNucleoName) {
    const nucleo = await prisma.nucleo.upsert({
      where: { name: newNucleoName },
      update: {},
      create: { name: newNucleoName },
    });
    nucleoId = nucleo.id;
  }

  const updated = await prisma.user.update({
    where: { id: params.id },
    data: {
      ...rest,
      ...(nucleoId !== undefined ? { nucleoId } : {}),
      ...(dataInicio !== undefined ? { dataInicio: dataInicio ? new Date(dataInicio) : null } : {}),
      ...(password ? { passwordHash: await bcrypt.hash(password, 10) } : {}),
    },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      active: true,
      avatarColor: true,
      cargo: true,
      setor: true,
      diretoria: true,
      ramal: true,
      whatsapp: true,
      dataInicio: true,
      gestorImediatoId: true,
      gestorImediato: { select: { id: true, name: true } },
      nivelHierarquico: true,
      nucleoId: true,
      nucleo: { select: { id: true, name: true } },
    },
  });

  return NextResponse.json(updated);
}
