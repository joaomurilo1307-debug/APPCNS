// Correcao pontual (27/11/2026): a RECEITA carregada neste mesmo dia tinha 1 linha agregada "Receita Prevista" por mes, mas o Joao pediu item a
// item (cada atividade da planilha de medicoes), para poder comparar com a medicao realizada linha a linha. Este script roda uma unica vez (marca
// na auditoria): apaga so' as linhas de RECEITA com conta exatamente "Receita Prevista" das versoes afetadas, e deixa o seed-p0.ts normal, que
// roda logo em seguida no boot, recarregar do zero com os arquivos JSON ja atualizados (item a item). Nunca mexe em CUSTO_CONTRATO nem
// CUSTO_PESSOAL, nem em nenhuma outra versao ou CCU.
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const MARCA = "fix.p0-receita-item.2026-11-27";
const AFETADOS: { codccu: string; versao: number }[] = [
  { codccu: "102345", versao: 1 },
  { codccu: "102385", versao: 1 },
  { codccu: "102395", versao: 1 },
  { codccu: "210", versao: 2 },
  { codccu: "230", versao: 2 },
];

async function main() {
  const jaRodou = await prisma.auditLog.findFirst({ where: { action: MARCA } });
  if (jaRodou) return console.log("fix-p0-receita-item ja rodou antes; nada a fazer.");

  let totalApagado = 0;
  for (const { codccu, versao } of AFETADOS) {
    const v = await prisma.p0Versao.findUnique({ where: { codccu_versao: { codccu, versao } } });
    if (!v) {
      console.log(`P0 ${codccu} v${versao} nao encontrado; pulando.`);
      continue;
    }
    const apagado = await prisma.p0Linha.deleteMany({ where: { p0Id: v.id, tipo: "RECEITA", conta: "Receita Prevista" } });
    console.log(`P0 ${codccu} v${versao}: ${apagado.count} linha(s) de RECEITA agregada apagada(s).`);
    totalApagado += apagado.count;
  }
  await prisma.auditLog.create({ data: { action: MARCA, entityType: "P0Linha", entityId: "varios", metadata: JSON.stringify({ afetados: AFETADOS, totalApagado }) } });
  console.log(`fix-p0-receita-item: ${totalApagado} linha(s) apagada(s) no total. O seed-p0.ts normal recarrega item a item em seguida.`);
}

main()
  .catch((e) => console.error("fix-p0-receita-item falhou:", e))
  .finally(() => prisma.$disconnect());
