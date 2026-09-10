// Reestrutura os Nucleos conforme decisao do Joao (10/09/2026):
//   - Nucleos = setores ADM (cada um espelha a equipe de mesmo nome) +
//     "Engenharia Ambiental" + "Engenharia Civil".
//   - Split Civil/Ambiental "por contrato" (contratos de obra -> Civil;
//     resto da engenharia -> Ambiental) -- ja resolvido no arquivo
//     prisma/data/nucleo_assignments.json (gerado do Senior R034FUN, so
//     funcionarios ativos SITAFA=1, ~270 pessoas).
//
// Faz: cria os nucleos canonicos, poe cada pessoa (match por
// matriculaSenior) no nucleo dela. NAO apaga nucleos antigos -- so
// esvazia os que sobrarem e loga pro Joao revisar. Idempotente.
// Roda via RUN_SEED_NUCLEOS=true.
import { PrismaClient } from "@prisma/client";
import fs from "fs";
import path from "path";

const prisma = new PrismaClient();

type Assign = { matricula: string; nome: string; codccu: string; nucleo: string };

async function log(action: string, metadata: Record<string, unknown>) {
  try {
    await prisma.auditLog.create({ data: { action, entityType: "SeedNucleosV2", metadata: JSON.stringify(metadata) } });
  } catch {
    /* nunca derruba o seed */
  }
}

async function main() {
  const arq = path.join(process.cwd(), "prisma", "data", "nucleo_assignments.json");
  if (!fs.existsSync(arq)) {
    await log("seed.nucleos.erro", { motivo: "nucleo_assignments.json nao encontrado", arq });
    throw new Error("nucleo_assignments.json nao encontrado");
  }
  const assigns: Assign[] = JSON.parse(fs.readFileSync(arq, "utf-8"));
  await log("seed.nucleos.iniciado", { total: assigns.length });

  // 1) cria/garante os nucleos canonicos
  const nomesCanonicos = Array.from(new Set(assigns.map((a) => a.nucleo)));
  const nucleoPorNome = new Map<string, string>();
  for (const nome of nomesCanonicos) {
    const n = await prisma.nucleo.upsert({ where: { name: nome }, update: {}, create: { name: nome } });
    nucleoPorNome.set(nome, n.id);
  }

  // 2) poe cada pessoa no nucleo dela (match por matriculaSenior)
  let atribuidos = 0;
  const semUser: string[] = [];
  for (const a of assigns) {
    const user = await prisma.user.findFirst({ where: { matriculaSenior: a.matricula } });
    if (!user) {
      semUser.push(`${a.matricula} ${a.nome}`);
      continue;
    }
    const nucId = nucleoPorNome.get(a.nucleo)!;
    if (user.nucleoId !== nucId) {
      await prisma.user.update({ where: { id: user.id }, data: { nucleoId: nucId } });
    }
    atribuidos++;
  }

  // 3) nucleos que sobraram vazios (nao canonicos) -- so lista, nao apaga
  const todos = await prisma.nucleo.findMany({ include: { _count: { select: { membros: true } } } });
  const orfaos = todos
    .filter((n) => !nomesCanonicos.includes(n.name) && n._count.membros === 0)
    .map((n) => n.name);
  const naoCanonicosComGente = todos
    .filter((n) => !nomesCanonicos.includes(n.name) && n._count.membros > 0)
    .map((n) => `${n.name} (${n._count.membros})`);

  const resumo = {
    nucleosCanonicos: nomesCanonicos.length,
    atribuidos,
    semUserNoSistema: semUser.length,
    exemplosSemUser: semUser.slice(0, 10),
    nucleosAntigosVazios: orfaos,
    nucleosAntigosComGente: naoCanonicosComGente,
  };
  console.log("Seed Nucleos v2:", JSON.stringify(resumo, null, 2));
  await log("seed.nucleos.concluido", resumo);
}

main()
  .catch(async (e) => {
    console.error(e);
    await log("seed.nucleos.erro_fatal", { mensagem: String(e?.message || e) });
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
