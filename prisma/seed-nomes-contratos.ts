// Troca, no banco, o nome de exibicao dos centros de custo 210 ("MRN CT 3686 + 3687") e 230 ("MRN CT 3687 LT"): ficha do contrato e nome gravado nos custos.
// Roda sozinho no boot e e' seguro repetir: so' troca o que ainda esta com o nome antigo do Senior (um nome que o administrador ja mudou fica como esta).
// Nao toca em valores, contratos, P0 nem no Senior. Ver src/lib/contratos/nomesDeExibicao.ts.
import { PrismaClient } from "@prisma/client";
import { NOMES_DE_EXIBICAO, nomeGravadoNovo, podeTrocarNome } from "../src/lib/contratos/nomesDeExibicao";

const prisma = new PrismaClient();

async function main() {
  let trocados = 0;
  for (const [codccu, nome] of Object.entries(NOMES_DE_EXIBICAO)) {
    const contrato = await prisma.contrato.findUnique({ where: { codccu }, select: { nome: true } });
    if (contrato && contrato.nome !== nome && podeTrocarNome(codccu, contrato.nome)) {
      await prisma.contrato.update({ where: { codccu }, data: { nome } });
      console.log(`Contrato ${codccu}: "${contrato.nome}" -> "${nome}"`);
      trocados++;
    }
    const gravados = await prisma.custoContaFinanceira.findMany({ where: { codccu }, distinct: ["contrato"], select: { contrato: true } });
    for (const { contrato: atual } of gravados) {
      const novo = nomeGravadoNovo(codccu, atual);
      if (atual !== novo && podeTrocarNome(codccu, atual)) {
        const r = await prisma.custoContaFinanceira.updateMany({ where: { codccu, contrato: atual }, data: { contrato: novo } });
        console.log(`Custos ${codccu}: "${atual}" -> "${novo}" (${r.count} linhas)`);
        trocados++;
      }
    }
  }
  console.log(trocados ? `Nomes de contrato: ${trocados} troca(s).` : "Nomes de contrato: nada a trocar.");
}

main()
  .catch((e) => {
    console.error("seed-nomes-contratos falhou:", e);
  })
  .finally(() => prisma.$disconnect());
