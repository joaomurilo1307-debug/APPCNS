// Substitui os Projects antigos (iniciativas internas do nucleo, sem
// relacao com o Senior) pelos 30 contratos de cliente ATIVOS do Rito de
// Gestao (com atividade de faturamento/custo ate o ultimo mes carregado,
// jul/2026) -- cada um vira um Project com o mesmo nome do CCU, ligado a
// equipe ja criada pelo seed-senior-teams.ts. So o nome/vinculo por
// enquanto -- atividades/tarefas entram depois, manualmente.
//
// Roda MANUAL, uma vez, via RUN_SEED_CONTRATOS=true (mesmo padrao dos
// outros seeds pontuais). Backup dos 7 Projects antigos ja feito em
// backup_projetos_antigos_2026-09-10.json (local, fora do repo) antes de
// rodar isso.
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const CONTRATOS_ATIVOS: { codccu: string; nome: string }[] = [
  { codccu: "230", nome: "MRN CT 3687/2023" },
  { codccu: "210", nome: "MRN CT 3686/2023" },
  { codccu: "240", nome: "MRN CT 3581/2022" },
  { codccu: "190", nome: "MRN CT 3748/2023" },
  { codccu: "280", nome: "SVPM CT 072/2024" },
  { codccu: "102185", nome: "AGA CT 15140/2025 CB" },
  { codccu: "102345", nome: "MRN CT 4343/2026" },
  { codccu: "102195", nome: "AGA CT 15140/2025 QZ" },
  { codccu: "102235", nome: "MRN 3686 PLT02" },
  { codccu: "102205", nome: "AGA CT 15140/2025 CDS" },
  { codccu: "170", nome: "AGA CT 13288 MSG/2023" },
  { codccu: "102225", nome: "MRN 3686 BAQ" },
  { codccu: "102295", nome: "PAREX ENGENHARIA S.A" },
  { codccu: "102245", nome: "MRN 3686 PMRE" },
  { codccu: "270", nome: "PM CONTAGEM CT 017/2021" },
  { codccu: "102335", nome: "MRN CT 4337/2026" },
  { codccu: "102385", nome: "MRN CT 4362/2026" },
  { codccu: "20", nome: "MRN CT 3484/2022" },
  { codccu: "102255", nome: "RIO GALEAO CT PR 060/2025" },
  { codccu: "102215", nome: "ALCOA PR 052/2025" },
  { codccu: "17", nome: "HYDRO PR 095/2021" },
  { codccu: "310", nome: "MRN CT 3728/2023" },
  { codccu: "102355", nome: "SHOPPING DEL REY CT PR 029/2026" },
  { codccu: "340", nome: "CCR AEROPORTOS CT 4600080415" },
  { codccu: "70", nome: "ALCOA JURUTI PR 100/2022" },
  { codccu: "160", nome: "AGA CT 13287 QZ/2023" },
  { codccu: "102365", nome: "AMG CT 20.022/2020" },
  { codccu: "102055", nome: "BH AIRPORT PR CT 4600084150/2024" },
  { codccu: "140", nome: "AGA CT 13287 CB/2023" },
  { codccu: "150", nome: "AGA CT 13287 CDS/2023" },
];

const PROJETOS_ANTIGOS_IDS = [
  "cms8ag22900145k3gnl7gzu8m",
  "cms8ag20w00125k3gl9aypu5r",
  "cms8ag1zn00105k3g1xnml2m2",
  "cms8ag1yc000y5k3g4ik6pkeh",
  "cms4x6jgw006nmta31i0bcghb",
  "cms3hvxrl0001an8uc5px34m7",
  "cms3bqtiu0001iv86bkxdp3it",
];

async function log(action: string, metadata: Record<string, unknown>) {
  try {
    await prisma.auditLog.create({ data: { action, entityType: "SeedContratosProjetos", metadata: JSON.stringify(metadata) } });
  } catch {
    // nunca deixa o log quebrar o seed
  }
}

async function main() {
  await log("seed.contratos.iniciado", { totalContratos: CONTRATOS_ATIVOS.length });

  // 1) apaga os projetos antigos (ja tem backup local fora do banco)
  const del = await prisma.project.deleteMany({ where: { id: { in: PROJETOS_ANTIGOS_IDS } } });
  await log("seed.contratos.projetos_antigos_removidos", { count: del.count });

  // 2) admin como owner padrao (nenhuma equipe de CCU tem gestor definido ainda)
  const admin = await prisma.user.findUnique({ where: { email: "admin@consominas.com.br" } });
  if (!admin) {
    await log("seed.contratos.erro", { motivo: "admin@consominas.com.br nao encontrado" });
    throw new Error("Usuario admin nao encontrado -- abortando.");
  }

  let criados = 0;
  let semEquipe: string[] = [];

  for (const contrato of CONTRATOS_ATIVOS) {
    const nomeEquipe = `${contrato.nome} [${contrato.codccu}]`;
    // contrato ativo financeiramente mas sem ninguem alocado no Senior/Rubi
    // (ex: 100% terceirizado, ou pequeno demais pra ter equipe dedicada) --
    // cria a equipe vazia mesmo assim, pra ninguem ficar sem projeto
    const team = await prisma.team.upsert({
      where: { name: nomeEquipe },
      update: {},
      create: { name: nomeEquipe, description: "Contrato de cliente (Senior) -- sem pessoal CLT alocado hoje." },
    });

    const existente = await prisma.project.findFirst({ where: { teamId: team.id, name: contrato.nome } });
    if (existente) continue;

    await prisma.project.create({
      data: {
        name: contrato.nome,
        description: `Contrato de cliente (Senior, CCU ${contrato.codccu}) -- Rito de Gestao.`,
        status: "PLANEJADO",
        teamId: team.id,
        ownerId: admin.id,
      },
    });
    criados++;
  }

  const resumo = { criados, semEquipe };
  console.log(`Seed Contratos concluido: ${JSON.stringify(resumo)}`);
  await log("seed.contratos.concluido", resumo);
}

main()
  .catch(async (e) => {
    console.error(e);
    await log("seed.contratos.erro_fatal", { mensagem: String(e?.message || e), stack: String(e?.stack || "") });
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
