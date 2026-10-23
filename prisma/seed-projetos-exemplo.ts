// Projeto de exemplo (uma vez por pessoa) para o Bruno Teixeira e o Breno de Lana: um projeto pequeno, ligado a um contrato, com uma
// equipe feita para ele, tarefas em situacoes diferentes e uma subtarefa, para quem abre a aba Projetos ja ver como funciona.
// Marca por pessoa na auditoria ("seed.projeto-exemplo.<chapa>"): roda uma vez; se a pessoa nao for achada ou nao houver contrato, tenta no proximo boot.
import { PrismaClient } from "@prisma/client";
import { acharUsuario } from "./achar-usuario";

const prisma = new PrismaClient();
type Alvo = { chapa: string; nome: string; primeiroNome: string; contratosPreferidos: string[] };
const ALVOS: Alvo[] = [
  { chapa: "23", nome: "BRUNO DE LIMA E SOARES TEIXEIRA", primeiroNome: "Bruno", contratosPreferidos: ["280", "70", "80", "100", "270", "330", "340"] },
  { chapa: "16", nome: "BRENO DE LANA GONÇALVES", primeiroNome: "Breno", contratosPreferidos: ["280", "70", "80", "100", "270", "330", "340"] },
];

async function main() {
  const usuarios = await prisma.user.findMany({ select: { id: true, name: true } });
  const feitos: string[] = [];
  const pendentes: string[] = [];
  for (const a of ALVOS) {
    const marca = `seed.projeto-exemplo.${a.chapa}`;
    if (await prisma.auditLog.findFirst({ where: { action: marca }, select: { id: true } })) continue;
    const pessoa = await acharUsuario(prisma, a.chapa, a.nome, usuarios);
    if (!pessoa) { pendentes.push(`${a.chapa} (pessoa nao achada)`); continue; }
    const contrato =
      (await prisma.contrato.findFirst({ where: { codccu: { in: a.contratosPreferidos }, status: "ATIVO" }, orderBy: { codccu: "asc" }, select: { codccu: true, nome: true } })) ??
      (await prisma.contrato.findFirst({ where: { status: "ATIVO" }, orderBy: { codccu: "asc" }, select: { codccu: true, nome: true } }));
    if (!contrato) { pendentes.push(`${a.chapa} (sem contrato ativo)`); continue; }

    let nomeEquipe = `Exemplo de uso — ${a.primeiroNome}`;
    for (let i = 2; await prisma.team.findUnique({ where: { name: nomeEquipe }, select: { id: true } }); i++) nomeEquipe = `Exemplo de uso — ${a.primeiroNome} (${i})`;

    await prisma.$transaction(async (tx) => {
      const equipe = await tx.team.create({ data: { name: nomeEquipe, description: "Equipe do projeto de exemplo", members: { create: { userId: pessoa.id, role: "GESTOR" } } } });
      const projeto = await tx.project.create({
        data: {
          name: `Projeto exemplo (${a.primeiroNome}): como usar a aba Projetos`,
          description: `Projeto de exemplo ligado ao contrato ${contrato.nome} (CCU ${contrato.codccu}). Abra as tarefas, mude a situação, crie uma subtarefa e, quando não precisar mais, apague o projeto.`,
          status: "EM_ANDAMENTO", teamId: equipe.id, ownerId: pessoa.id, codccu: contrato.codccu,
        },
      });
      const t1 = await tx.task.create({ data: { title: "Ler o passo a passo da aba Projetos", projectId: projeto.id, status: "FEITO", order: 1, assigneeId: pessoa.id } });
      const t2 = await tx.task.create({ data: { title: "Criar uma tarefa e uma subtarefa", projectId: projeto.id, status: "FAZENDO", order: 2, assigneeId: pessoa.id, priority: "ALTA" } });
      await tx.task.create({ data: { title: "Escolher quem executa e dar um prazo", projectId: projeto.id, parentTaskId: t2.id, status: "A_FAZER", order: 1 } });
      await tx.task.create({ data: { title: "Registrar o avanço na Sprint da semana", projectId: projeto.id, status: "A_FAZER", order: 3 } });
      await tx.auditLog.create({ data: { action: marca, entityType: "Project", entityId: projeto.id, metadata: JSON.stringify({ chapa: a.chapa, contrato: contrato.codccu, equipe: nomeEquipe, tarefas: [t1.id, t2.id].length + 2 }) } });
    });
    feitos.push(`${a.chapa}->CCU ${contrato.codccu}`);
  }
  console.log(`Projetos de exemplo: ${feitos.length} criados (${feitos.join(", ") || "-"}); pendentes: ${pendentes.length ? pendentes.join(" | ") : "nenhum"}.`);
}

main()
  .catch((e) => {
    console.error("Falha nos projetos de exemplo:", e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
