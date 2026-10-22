// Cria os NUCLEOS dos setores ADM, com os nomes exatos da lotacao da planilha "LISTAGEM DE ATIVOS" (pedido do Joao, 22/10/2026).
// Contratos (MRN, AGA, SVPM...) NAO entram: os nucleos sao so' os setores administrativos.
//
// Faz so' isto: cria os nucleos que ainda nao existem (por nome). Nao mexe em pessoas, equipes, projetos nem em nucleos ja existentes.
// Roda UMA vez, sozinho, no primeiro boot depois do deploy (sem variavel de ambiente): grava a marca "seed.nucleos-adm.concluido" na
// auditoria e, se a marca existir, nao faz nada -- assim, se o Joao renomear ou apagar um nucleo depois, ele nao volta.
import { PrismaClient } from "@prisma/client";
import fs from "fs";
import path from "path";

const prisma = new PrismaClient();
const MARCA = "seed.nucleos-adm.concluido";

async function main() {
  const feito = await prisma.auditLog.findFirst({ where: { action: MARCA }, select: { id: true } });
  if (feito) {
    console.log("Nucleos ADM ja foram criados antes; nada a fazer.");
    return;
  }

  const arq = path.join(process.cwd(), "prisma", "data", "nucleos_adm_listagem.json");
  const lista: { name: string; description?: string }[] = JSON.parse(fs.readFileSync(arq, "utf-8"));

  const criados: string[] = [];
  const jaExistiam: string[] = [];
  for (const n of lista) {
    const existente = await prisma.nucleo.findUnique({ where: { name: n.name }, select: { id: true } });
    if (existente) {
      jaExistiam.push(n.name);
      continue;
    }
    await prisma.nucleo.create({ data: { name: n.name, description: n.description ?? null } });
    criados.push(n.name);
  }

  await prisma.auditLog.create({
    data: { action: MARCA, entityType: "Nucleo", metadata: JSON.stringify({ criados, jaExistiam }) },
  });
  console.log(`Nucleos ADM: ${criados.length} criados, ${jaExistiam.length} ja existiam.`);
}

main()
  .catch((e) => {
    console.error("Falha ao criar os nucleos ADM:", e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
