import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/auditLog";
import { CARGOS_LISTA, resolverCargo } from "@/lib/cargos";

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  cargo: z.enum(CARGOS_LISTA as [string, ...string[]]),
  setor: z.string().trim().max(120).optional(),
  nucleoNome: z.string().trim().max(120).optional(),
  projetoIds: z.array(z.string()).max(60).optional(),
});

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Dados inválidos: confira e-mail, cargo e senha (8+ caracteres)." },
      { status: 422 }
    );
  }

  const userId = (session.user as any).id as string;
  const novoEmail = parsed.data.email.toLowerCase();
  const { cargo, setor, nucleoNome, projetoIds } = parsed.data;

  const emailEmUso = await prisma.user.findUnique({ where: { email: novoEmail } });
  if (emailEmUso && emailEmUso.id !== userId) {
    return NextResponse.json({ error: "Esse e-mail já está em uso por outra conta." }, { status: 409 });
  }

  const info = resolverCargo(cargo);
  const passwordHash = await bcrypt.hash(parsed.data.password, 10);

  // cargo "sensivel" (gerente/diretor): entra com acesso basico e um admin
  // confirma a elevacao depois -- ninguem se auto-promove nesse primeiro
  // login. Os demais cargos aplicam o nivel na hora.
  const aplicaImediato = !info.sensivel;

  // resolve o nucleo/area escolhido (cria se ainda nao existir)
  let nucleoId: string | undefined;
  if (nucleoNome) {
    const nucleo = await prisma.nucleo.upsert({
      where: { name: nucleoNome },
      update: {},
      create: { name: nucleoNome },
    });
    nucleoId = nucleo.id;
  }

  await prisma.user.update({
    where: { id: userId },
    data: {
      email: novoEmail,
      passwordHash,
      primeiroAcesso: false,
      cargo,
      ...(setor ? { setor } : {}),
      ...(nucleoId ? { nucleoId } : {}),
      ...(aplicaImediato ? { role: info.role, nivelHierarquico: info.nivel } : {}),
    },
  });

  // vincula a pessoa aos projetos/contratos que ela marcou (entra na equipe
  // de cada um como MEMBRO). So aceita projetos de equipe de contrato.
  let projetosVinculados = 0;
  if (projetoIds && projetoIds.length > 0) {
    const projetos = await prisma.project.findMany({
      where: { id: { in: projetoIds }, team: { codccu: { not: null } } },
      select: { teamId: true },
    });
    for (const p of projetos) {
      await prisma.userTeam.upsert({
        where: { userId_teamId: { userId, teamId: p.teamId } },
        update: {},
        create: { userId, teamId: p.teamId, role: "MEMBRO" },
      });
      projetosVinculados++;
    }
  }

  await logAudit({
    userId,
    action: "user.completou_cadastro_senior",
    entityType: "User",
    entityId: userId,
    metadata: {
      cargo,
      setor: setor ?? null,
      nucleo: nucleoNome ?? null,
      projetosVinculados,
      aplicaImediato,
      roleAlvo: info.role,
      nivelAlvo: info.nivel,
    },
  });

  // avisa os admins pra confirmarem o acesso de quem escolheu cargo sensivel
  if (!aplicaImediato) {
    const nome = (session.user as any).name ?? novoEmail;
    const admins = await prisma.user.findMany({ where: { role: "ADMIN", active: true }, select: { id: true } });
    if (admins.length > 0) {
      await prisma.notification.createMany({
        data: admins.map((a) => ({
          userId: a.id,
          type: "OUTRO" as const,
          title: `Confirmar acesso: ${nome} se cadastrou como ${cargo}`,
          body: `A conta entrou com acesso básico. Ajuste o nível em Usuários se o cargo estiver correto.`,
          link: "/usuarios",
        })),
      });
    }
  }

  return NextResponse.json({ ok: true, cargoAplicado: aplicaImediato, projetosVinculados });
}
