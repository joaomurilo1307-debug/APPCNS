// Clean slate de Equipes e Nucleos (pedido do Joao, 10/09/2026 - "todas
// as equipes"). Ele vai reconstruir do zero. Apaga:
//   - TODAS as equipes  -> cascade leva chats de equipe (TeamMessage),
//     leituras, vinculos pessoa<->equipe (UserTeam), pastas/anexos e
//     scorecards ligados a equipe. Goal.assignedTeamId e
//     CustoContaFinanceira.teamId viram null (SetNull).
//   - TODOS os nucleos  -> User.nucleoId vira null; some das relacoes
//     m2m de gerente/projeto.
// NAO mexe em usuarios, DMs, aprovacoes, custos (fora o teamId->null),
// calendario. Roda via RUN_WIPE_EQ=true.
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function log(action: string, metadata: Record<string, unknown>) {
  try {
    await prisma.auditLog.create({ data: { action, entityType: "WipeEquipesNucleos", metadata: JSON.stringify(metadata) } });
  } catch {
    /* nunca derruba */
  }
}

async function main() {
  const [teamsAntes, nucleosAntes, vinculosAntes, msgsAntes] = await Promise.all([
    prisma.team.count(),
    prisma.nucleo.count(),
    prisma.userTeam.count(),
    prisma.teamMessage.count(),
  ]);
  await log("wipe_eq.iniciado", { equipes: teamsAntes, nucleos: nucleosAntes, vinculos: vinculosAntes, mensagensEquipe: msgsAntes });

  // some primeiro o que aponta pra equipe sem cascade garantido pela ordem
  await prisma.userTeam.deleteMany({});
  await prisma.teamMessageRead.deleteMany({});
  await prisma.teamMessage.deleteMany({});
  const team = await prisma.team.deleteMany({});

  // nucleos: solta os vinculos e apaga
  await prisma.user.updateMany({ where: { nucleoId: { not: null } }, data: { nucleoId: null } });
  const nucleo = await prisma.nucleo.deleteMany({});

  const resumo = {
    equipesApagadas: team.count,
    nucleosApagados: nucleo.count,
    vinculosPessoaEquipeRemovidos: vinculosAntes,
    chatsDeEquipeRemovidos: msgsAntes,
  };
  console.log("Wipe equipes/nucleos:", JSON.stringify(resumo));
  await log("wipe_eq.concluido", resumo);
}

main()
  .catch(async (e) => {
    console.error(e);
    await log("wipe_eq.erro_fatal", { mensagem: String(e?.message || e) });
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
