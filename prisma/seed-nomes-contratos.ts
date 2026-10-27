// Troca, no banco, o nome de exibicao dos centros de custo 210 ("MRN CT 3686 + 3687") e 230 ("MRN CT 3687 LT"): ficha do contrato e nome gravado nos custos.
// Roda sozinho no boot e e' seguro repetir: so' troca o que ainda esta com o nome antigo do Senior (um nome que o administrador ja mudou fica como esta).
// Nao toca em valores, contratos, P0 nem no Senior. Ver src/lib/contratos/nomesDeExibicao.ts.
import { PrismaClient } from "@prisma/client";
// ATENCAO: a imagem de producao so' leva a pasta prisma/ (sem src/), entao este arquivo nao pode importar de ../src. Mantenha os nomes iguais aos de
// src/lib/contratos/nomesDeExibicao.ts (o teste tests/nomes-exibicao.test.ts confere).
const NOMES_DE_EXIBICAO: Record<string, string> = { "210": "MRN CT 3686 + 3687", "230": "MRN CT 3687 LT" };
const NOMES_ANTIGOS_DO_SENIOR: Record<string, string> = { "210": "MRN CT 3686/2023", "230": "MRN CT 3687/2023" };
const semPrefixoCcu = (codccu: string, nome: string) => nome.replace(new RegExp(String.raw`^${codccu}\s*-\s*`), "").trim();
const podeTrocarNome = (codccu: string, gravado: string) => semPrefixoCcu(codccu, gravado) === NOMES_ANTIGOS_DO_SENIOR[codccu];
const nomeGravadoNovo = (codccu: string, gravado: string) => (new RegExp(String.raw`^${codccu}\s*-\s*`).test(gravado) ? `${codccu} - ${NOMES_DE_EXIBICAO[codccu]}` : NOMES_DE_EXIBICAO[codccu]);

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
