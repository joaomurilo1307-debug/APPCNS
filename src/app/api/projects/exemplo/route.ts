import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { negarSeSoConsulta } from "@/lib/acesso/servidor";
import { prisma } from "@/lib/prisma";
import { nomeLivreDeEquipe } from "@/lib/pessoas";
import { DESCRICAO_EXEMPLO, MARCADOR_EXEMPLO, NOME_PROJETO_EXEMPLO, TAREFAS_DO_EXEMPLO, emDias } from "@/lib/projetos/exemplo";

// Cria o "projeto teste que ensina" da pessoa, uma unica vez (o registro na auditoria impede de criar de novo, mesmo que ela apague o projeto).
// A pagina de Projetos chama esta rota quando a pessoa ainda nao tem nenhum projeto.
export async function POST() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  { const soConsulta = await negarSeSoConsulta(session.user as any, "projetos"); if (soConsulta) return NextResponse.json({ criado: false }); }

  const userId = (session.user as any).id as string;
  const role = (session.user as any).role as string;
  if (role === "CLIENTE" || role === "VISUALIZADOR") return NextResponse.json({ criado: false });

  const primeiroNome = String((session.user as any).name ?? "").trim().split(/\s+/)[0] || "voce";
  const hoje = new Date();
  const projeto = await prisma.$transaction(async (tx) => {
    // duas chamadas ao mesmo tempo (ex.: tela aberta duas vezes) nao criam dois projetos: a segunda espera a primeira gravar o marcador
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"projeto-exemplo:" + userId}))`;
    if (await tx.auditLog.findFirst({ where: { userId, action: MARCADOR_EXEMPLO }, select: { id: true } })) return null;
    const nome = await nomeLivreDeEquipe(`Equipe de teste de ${primeiroNome}`, async (n) => !!(await tx.team.findUnique({ where: { name: n }, select: { id: true } })));
    const equipe = await tx.team.create({ data: { name: nome, description: "Equipe do projeto de teste", members: { create: [{ userId, role: "GESTOR" as const }] } } });
    const p = await tx.project.create({
      data: { name: NOME_PROJETO_EXEMPLO, description: DESCRICAO_EXEMPLO, status: "EM_ANDAMENTO", teamId: equipe.id, ownerId: userId, approvalStatus: "NAO_REQUER", startDate: emDias(hoje, -3), endDate: emDias(hoje, 7) },
    });
    await tx.task.createMany({
      data: TAREFAS_DO_EXEMPLO.map((t, i) => ({
        title: t.title, description: t.description, status: t.status, order: i + 1, projectId: p.id, assigneeId: userId,
        startDate: emDias(hoje, t.inicioEmDias), dueDate: emDias(hoje, t.prazoEmDias), isEntrega: !!t.isEntrega,
        ...(t.status === "FEITO" ? { actualStartedAt: emDias(hoje, t.inicioEmDias), actualEndedAt: emDias(hoje, t.prazoEmDias) } : {}),
      })),
    });
    await tx.auditLog.create({ data: { userId, action: MARCADOR_EXEMPLO, entityType: "Project", entityId: p.id } });
    return p;
  });

  if (!projeto) return NextResponse.json({ criado: false });
  return NextResponse.json({ criado: true, id: projeto.id }, { status: 201 });
}
