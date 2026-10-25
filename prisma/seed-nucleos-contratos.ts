// Cria os NUCLEOS DOS CONTRATOS (MRN, AGA, SVPM...), com os nomes exatos da lotacao da planilha "LISTAGEM DE ATIVOS" -- os que ficaram de fora
// quando se criaram os nucleos dos setores ADM (pedido do Joao, 25/10/2026: "jogue na parte de nucleos os nucleos de contratos tambem").
//
// Roda sozinho no boot (sem variavel de ambiente) e e' seguro repetir: cria so' os que faltam, por nome, UMA vez (marca
// "seed.nucleos-contratos.concluido" na auditoria). Se o Joao renomear ou apagar um nucleo depois, ele nao volta. Nao liga ninguem a nenhum
// nucleo (gerentes, coordenadores, diretores e colaboradores sao escolhidos na tela de Nucleos) e nao mexe em equipes, projetos nem em
// nucleos que ja existiam.
import { PrismaClient } from "@prisma/client";
import fs from "fs";
import path from "path";

const prisma = new PrismaClient();
const MARCA = "seed.nucleos-contratos.concluido";

async function main() {
  if (await prisma.auditLog.findFirst({ where: { action: MARCA }, select: { id: true } })) {
    console.log("Nucleos de contratos ja foram criados antes; nada a criar.");
    return;
  }
  const lista: { name: string; description?: string }[] = JSON.parse(fs.readFileSync(path.join(process.cwd(), "prisma", "data", "nucleos_contratos_listagem.json"), "utf-8"));
  const criados: string[] = [];
  const jaExistiam: string[] = [];
  for (const n of lista) {
    if (await prisma.nucleo.findUnique({ where: { name: n.name }, select: { id: true } })) {
      jaExistiam.push(n.name);
      continue;
    }
    await prisma.nucleo.create({ data: { name: n.name, description: n.description ?? null, tipo: "CONTRATO" } });
    criados.push(n.name);
  }
  await prisma.auditLog.create({ data: { action: MARCA, entityType: "Nucleo", metadata: JSON.stringify({ criados, jaExistiam }) } });
  console.log(`Nucleos de contratos: ${criados.length} criados, ${jaExistiam.length} ja existiam.`);
}

main()
  .catch((e) => { console.error("seed-nucleos-contratos falhou:", e); })
  .finally(() => prisma.$disconnect());
