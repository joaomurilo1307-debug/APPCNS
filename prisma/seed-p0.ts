// Carrega os P0 (linha de base de custos e receita) dos contratos, um arquivo por contrato e versao em prisma/data/p0/<ccu>_v<versao>.json.
//
// Roda sozinho no boot (sem variavel de ambiente) e e' seguro repetir: se a versao ainda nao existe, cria do zero; se ja existe, so'
// ACRESCENTA os tipos (CUSTO_CONTRATO | CUSTO_PESSOAL | RECEITA) que aquela versao ainda nao tem -- nunca sobrescreve nem apaga uma
// linha ja carregada. Um aditivo entra como versao nova. Cada linha do JSON e' uma linha da planilha da area; nada e' somado nem
// estimado aqui.
import { PrismaClient } from "@prisma/client";
import fs from "fs";
import path from "path";

const prisma = new PrismaClient();

type LinhaJson = { tipo: "CUSTO_CONTRATO" | "CUSTO_PESSOAL" | "RECEITA"; codConta: number | null; conta: string; grupoCodigo: string; grupoNome: string; reembolsavel: boolean; competencia: string; valor: number; historico: string | null };
type P0Json = { codccu: string; versao: number; rotulo: string; origem?: string; rotuloNaPlanilha?: string; linhas: LinhaJson[] };

async function main() {
  const pasta = path.join(process.cwd(), "prisma", "data", "p0");
  if (!fs.existsSync(pasta)) return console.log("Sem pasta de P0; nada a carregar.");
  const arquivos = fs.readdirSync(pasta).filter((f) => f.endsWith(".json")).sort();
  let criados = 0;
  let acrescentados = 0;
  for (const arq of arquivos) {
    const p0: P0Json = JSON.parse(fs.readFileSync(path.join(pasta, arq), "utf-8"));
    const existente = await prisma.p0Versao.findUnique({ where: { codccu_versao: { codccu: p0.codccu, versao: p0.versao } } });

    if (existente) {
      // versao ja existe: so' acrescenta tipos que ainda nao foram carregados nela (nunca mexe no que ja tem)
      const tiposExistentes = new Set((await prisma.p0Linha.findMany({ where: { p0Id: existente.id }, select: { tipo: true }, distinct: ["tipo"] })).map((l) => l.tipo));
      const linhasNovas = p0.linhas.filter((l) => !tiposExistentes.has(l.tipo));
      if (linhasNovas.length === 0) {
        console.log(`P0 ${p0.codccu} v${p0.versao} ja carregado (tipos: ${Array.from(tiposExistentes).join(",")}); nada a fazer.`);
        continue;
      }
      const tiposNovos = Array.from(new Set(linhasNovas.map((l) => l.tipo)));
      await prisma.$transaction(
        async (tx) => {
          const dados = linhasNovas.map((l) => ({
            p0Id: existente.id,
            tipo: l.tipo,
            codConta: l.codConta,
            conta: l.conta,
            grupoCodigo: l.grupoCodigo,
            grupoNome: l.grupoNome,
            reembolsavel: l.reembolsavel,
            competencia: new Date(`${l.competencia}-01T00:00:00.000Z`),
            valor: l.valor,
            historico: l.historico,
          }));
          for (let i = 0; i < dados.length; i += 500) await tx.p0Linha.createMany({ data: dados.slice(i, i + 500) });
          await tx.auditLog.create({
            data: { action: "seed.p0.acrescentado", entityType: "P0Versao", entityId: existente.id, metadata: JSON.stringify({ codccu: p0.codccu, versao: p0.versao, arquivo: arq, tiposAcrescentados: tiposNovos, linhas: dados.length }) },
          });
        },
        { timeout: 60_000 }
      );
      acrescentados++;
      console.log(`P0 ${p0.codccu} v${p0.versao}: acrescentado(s) ${tiposNovos.join(",")} (${linhasNovas.length} linhas), sem mexer no que ja existia.`);
      continue;
    }

    // tudo ou nada: se algo falhar no meio, a versao nao fica pela metade
    await prisma.$transaction(
      async (tx) => {
        const v = await tx.p0Versao.create({
          data: { codccu: p0.codccu, versao: p0.versao, rotulo: p0.rotulo, origem: p0.origem ?? null, rotuloNaPlanilha: p0.rotuloNaPlanilha ?? null },
        });
        const dados = p0.linhas.map((l) => ({
          p0Id: v.id,
          tipo: l.tipo,
          codConta: l.codConta,
          conta: l.conta,
          grupoCodigo: l.grupoCodigo,
          grupoNome: l.grupoNome,
          reembolsavel: l.reembolsavel,
          competencia: new Date(`${l.competencia}-01T00:00:00.000Z`),
          valor: l.valor,
          historico: l.historico,
        }));
        for (let i = 0; i < dados.length; i += 500) await tx.p0Linha.createMany({ data: dados.slice(i, i + 500) });
        await tx.auditLog.create({
          data: { action: "seed.p0.carregado", entityType: "P0Versao", entityId: v.id, metadata: JSON.stringify({ codccu: p0.codccu, versao: p0.versao, arquivo: arq, linhas: dados.length }) },
        });
      },
      { timeout: 60_000 }
    );
    criados++;
    console.log(`P0 ${p0.codccu} v${p0.versao} carregado: ${p0.linhas.length} linhas.`);
  }
  console.log(`P0: ${criados} criado(s), ${acrescentados} com tipo novo acrescentado, ${arquivos.length - criados - acrescentados} sem nenhuma mudanca.`);
}

main()
  .catch((e) => {
    console.error("seed-p0 falhou:", e);
  })
  .finally(() => prisma.$disconnect());
