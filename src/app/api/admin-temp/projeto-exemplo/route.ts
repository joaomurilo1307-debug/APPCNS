import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// ROTA TEMPORARIA (19/10/2026) -- sera removida logo apos o uso. Protegida por x-sync-key.
// Reconstroi o conteudo do "Projeto exemplo: como usar a aba Projetos" com tarefas em todas as situacoes, subtarefas,
// comentarios, marcos e risco, para a Carolina e o Andre verem um projeto "funcionando". So' mexe nesse projeto.

const NOME = "Projeto exemplo: como usar a aba Projetos";
const dia = (n: number) => new Date(Date.now() + n * 86_400_000);

export async function POST(req: Request) {
  const chave = req.headers.get("x-sync-key");
  if (!chave || chave !== process.env.SENIOR_SYNC_KEY) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const projeto = await prisma.project.findFirst({ where: { name: NOME } });
  if (!projeto) return NextResponse.json({ error: "Projeto exemplo não encontrado" }, { status: 404 });
  const [carol, andre] = await Promise.all([
    prisma.user.findFirst({ where: { email: "cperes@consominas.com.br" }, select: { id: true } }),
    prisma.user.findFirst({ where: { email: "andre@consominas.com.br" }, select: { id: true } }),
  ]);
  if (!carol || !andre) return NextResponse.json({ error: "Carolina/André não encontrados" }, { status: 409 });

  await prisma.task.deleteMany({ where: { projectId: projeto.id } });
  await prisma.milestone.deleteMany({ where: { projectId: projeto.id } });
  await prisma.risk.deleteMany({ where: { projectId: projeto.id } });
  await prisma.project.update({
    where: { id: projeto.id },
    data: {
      status: "EM_ANDAMENTO", startDate: dia(-14), endDate: dia(30), orcamento: 50000,
      description: "Projeto de exemplo para mostrar a aba Projetos funcionando: quadro com as 4 situações, prazos (inclusive um atrasado), subtarefas, comentários, marcos e riscos. Pode mexer à vontade: é só um exemplo. Cada pessoa só vê os projetos que criou ou em que foi convidada.",
    },
  });

  const mk = (title: string, description: string, status: "A_FAZER" | "FAZENDO" | "BLOQUEADO" | "FEITO", assigneeId: string, due: number, priority: "BAIXA" | "MEDIA" | "ALTA" | "URGENTE", order: number, extra: any = {}) =>
    prisma.task.create({ data: { title, description, status, assigneeId, dueDate: dia(due), startDate: dia(due - 5), priority, order, projectId: projeto.id, ...(status === "FEITO" ? { actualEndedAt: dia(due) } : {}), ...extra } });

  const t1 = await mk("Entender o quadro (Kanban)", "As tarefas ficam em colunas por situação: A fazer, Fazendo, Bloqueado e Feito. Arraste o cartão para mudar a situação.", "FEITO", carol.id, -10, "MEDIA", 0);
  await mk("Criar sua primeira tarefa", "Use o botão de nova tarefa no quadro. Dê um título, um responsável e um prazo.", "FEITO", andre.id, -7, "MEDIA", 1);
  const t3 = await mk("Atribuir responsável e prazo", "Abra o cartão para trocar responsável, prazo e prioridade. O prazo aparece no cartão e, se vencer, a tarefa fica destacada.", "FAZENDO", carol.id, 2, "ALTA", 2);
  const t4 = await mk("Usar subtarefas para dividir o trabalho", "Uma tarefa grande pode ter subtarefas. O percentual do projeto considera o andamento de todas.", "FAZENDO", andre.id, 5, "MEDIA", 3);
  await mk("Aguardando aprovação (exemplo de tarefa bloqueada)", "Use a situação Bloqueado quando a tarefa depende de outra pessoa ou decisão.", "BLOQUEADO", carol.id, 3, "URGENTE", 4);
  await mk("Tarefa atrasada (exemplo de alerta)", "Esta tarefa está com o prazo vencido de propósito: ela entra no indicador de atrasos do projeto.", "A_FAZER", andre.id, -3, "ALTA", 5);
  await mk("Entrega: relatório final", "Marque como entrega as tarefas que representam um resultado para o cliente ou a diretoria.", "A_FAZER", carol.id, 25, "ALTA", 6, { isEntrega: true });
  await mk("Registrar marcos e riscos do projeto", "Na página do projeto há marcos (datas importantes) e riscos (o que pode dar errado e como evitar).", "A_FAZER", andre.id, 12, "BAIXA", 7);

  await mk("Subtarefa: definir o objetivo", "Exemplo de subtarefa concluída.", "FEITO", andre.id, -2, "MEDIA", 0, { parentTaskId: t4.id });
  await mk("Subtarefa: listar as etapas", "Exemplo de subtarefa em andamento.", "FAZENDO", andre.id, 3, "MEDIA", 1, { parentTaskId: t4.id });
  await mk("Subtarefa: combinar prazos", "Exemplo de subtarefa ainda não iniciada.", "A_FAZER", carol.id, 5, "BAIXA", 2, { parentTaskId: t4.id });

  await prisma.taskComment.create({ data: { taskId: t3.id, authorId: carol.id, body: "Combinado: eu fico com esta tarefa e entrego até o prazo." } });
  await prisma.taskComment.create({ data: { taskId: t3.id, authorId: andre.id, body: "Se precisar de ajuda é só marcar a tarefa como Bloqueada e escrever aqui o motivo." } });
  await prisma.taskComment.create({ data: { taskId: t1.id, authorId: andre.id, body: "Comentários ficam registrados dentro da tarefa, com autor e data." } });

  await prisma.milestone.createMany({ data: [
    { projectId: projeto.id, title: "Kickoff do projeto", dueDate: dia(-14), done: true },
    { projectId: projeto.id, title: "Primeira entrega", dueDate: dia(12), done: false },
    { projectId: projeto.id, title: "Encerramento", dueDate: dia(30), done: false },
  ] });
  await prisma.risk.create({ data: { projectId: projeto.id, title: "Atraso na aprovação", description: "A aprovação do cliente pode demorar mais que o previsto.", impact: "ALTO", probability: "MEDIO", mitigationPlan: "Avisar o cliente com antecedência e deixar a decisão pendente registrada no projeto.", status: "ABERTO" } });

  const total = await prisma.task.count({ where: { projectId: projeto.id } });
  return NextResponse.json({ ok: true, projeto: projeto.id, tarefas: total });
}
