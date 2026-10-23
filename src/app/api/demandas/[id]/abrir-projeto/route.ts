import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canManageTeam, isTeamMember } from "@/lib/permissions";
import { avisarPessoas, ehAtendente, equipesDosNucleos, pessoasValidas, podeGerirDemandas } from "@/lib/demandas";
import { nucleoIdsQueGere } from "@/lib/permissions";
import { z } from "zod";

// A gestao abre um PROJETO a partir da demanda: o projeto nasce com o titulo/descricao dela, cada item da lista vira uma tarefa (para delegar,
// dividir em subtarefas e executar) e o contratante (e quem pediu) passa a acompanhar o andamento no portal, em leitura.
// executores e visualizadores: ganham acesso ao projeto (quem executa recebe as tarefas; quem so' acompanha, nao). Quem pediu (se for da casa) acompanha sempre.
const schema = z.object({
  teamId: z.string().min(1), nome: z.string().trim().min(2).max(150).optional(),
  executores: z.array(z.string()).max(30).optional(), visualizadores: z.array(z.string()).max(60).optional(),
});

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const u = session.user as any;
  if (!(await podeGerirDemandas(u, undefined, params.id))) return NextResponse.json({ error: "Só a gestão abre projeto a partir de uma demanda" }, { status: 403 });
  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });

  const d = await prisma.demanda.findUnique({
    where: { id: params.id },
    include: { itens: { orderBy: { ordem: "asc" } }, contrato: { select: { id: true, codccu: true, nome: true } }, solicitante: { select: { id: true, role: true } } },
  });
  if (!d) return NextResponse.json({ error: "Demanda não encontrada" }, { status: 404 });
  if (d.projectId) return NextResponse.json({ error: "Esta demanda já virou projeto" }, { status: 409 });
  if (d.anexadaProjectId) return NextResponse.json({ error: "Esta demanda já foi anexada a um projeto" }, { status: 409 });
  if (d.status === "RECUSADA" || d.status === "CONCLUIDA") return NextResponse.json({ error: "Reabra a demanda (Nova ou Em análise) antes de abrir o projeto" }, { status: 409 });
  if (!(await podeGerirDemandas(u, d.nucleoId, d.id))) return NextResponse.json({ error: "Só a gestão (ou o coordenador/gerente do núcleo da demanda) abre projeto a partir dela" }, { status: 403 });
  // gestor da equipe (ou admin) abre em qualquer equipe dele; coordenador/gerente do nucleo da demanda, nas equipes com gente do nucleo
  const noNucleo = !!d.nucleoId && (await nucleoIdsQueGere(u.id)).includes(d.nucleoId) && (await equipesDosNucleos([d.nucleoId])).some((e) => e.id === parsed.data.teamId);
  // quem foi indicado para atender a demanda tambem abre o projeto nas equipes de que faz parte
  const membro = !noNucleo && (await ehAtendente(u, d.id)) && (await isTeamMember(u.id, u.role, parsed.data.teamId));
  if (!noNucleo && !membro && !(await canManageTeam(u.id, u.role, parsed.data.teamId))) return NextResponse.json({ error: "Só o gestor da equipe (ou um admin, ou quem atende a demanda e faz parte da equipe) abre projeto nela" }, { status: 403 });

  const clientes = await prisma.contratoUsuario.findMany({ where: { contratoId: d.contrato.id }, select: { userId: true } });
  const donosCliente = new Set(clientes.map((c) => c.userId));
  if (d.solicitante.role === "CLIENTE") donosCliente.add(d.solicitanteId);

  const executores = (await pessoasValidas(parsed.data.executores ?? [])).filter((id) => id !== u.id);
  const visualizadores = (await pessoasValidas([...(parsed.data.visualizadores ?? []), ...(d.solicitante.role !== "CLIENTE" ? [d.solicitanteId] : [])])).filter((id) => id !== u.id && !executores.includes(id));
  const responsavelPadrao = executores.length === 1 ? executores[0] : null; // um so' executor: as tarefas ja nascem com ele; varios: a gestao distribui
  const projeto = await prisma.$transaction(async (tx) => {
    const p = await tx.project.create({
      data: {
        name: parsed.data.nome ?? d.titulo,
        description: [d.descricao, `Origem: demanda para o contrato ${d.contrato.nome} (CCU ${d.contrato.codccu}).`].filter(Boolean).join("\n\n"),
        teamId: parsed.data.teamId, ownerId: u.id, status: "PLANEJADO",
        ...(d.nucleoId ? { nucleos: { connect: { id: d.nucleoId } } } : {}),
        endDate: d.prazoDesejado ?? undefined,
      },
    });
    const comAcesso = [...executores, ...visualizadores];
    if (comAcesso.length) await tx.acessoProjeto.createMany({ data: comAcesso.map((userId) => ({ userId, projectId: p.id, concedidoPor: u.name ?? u.email ?? "demanda" })), skipDuplicates: true });
    if (donosCliente.size) await tx.projectClient.createMany({ data: Array.from(donosCliente).map((userId) => ({ projectId: p.id, userId })), skipDuplicates: true });
    for (const [i, item] of d.itens.entries()) {
      const t = await tx.task.create({ data: { title: item.texto, projectId: p.id, order: i, status: item.concluido ? "FEITO" : "A_FAZER", assigneeId: responsavelPadrao } });
      await tx.demandaItem.update({ where: { id: item.id }, data: { taskId: t.id } });
    }
    await tx.demanda.update({ where: { id: d.id }, data: { projectId: p.id, status: "EM_PROJETO" } });
    await tx.demandaComentario.create({ data: { demandaId: d.id, autorId: u.id, texto: `Projeto “${p.name}” aberto a partir desta demanda.`, interno: false } });
    return p;
  });
  await avisarPessoas(executores, { title: "Você vai executar um projeto", body: `${projeto.name} (demanda: ${d.titulo})`, link: `/projetos/${projeto.id}` }).catch(() => {});
  await avisarPessoas(visualizadores, { title: "Você acompanha um projeto", body: `${projeto.name} (demanda: ${d.titulo})`, link: `/projetos/${projeto.id}` }).catch(() => {});
  return NextResponse.json({ projectId: projeto.id }, { status: 201 });
}
