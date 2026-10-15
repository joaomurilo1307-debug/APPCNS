// Grava o dossie gerado pelo proprio APPCNS (DossieOC + PDF em disco). Mesma regra do
// POST /api/senior/dossies/sync (que o n8n usa): um registro por chave "OC|filial|numero";
// so' troca o PDF quando vem PDF novo, e o antigo sai do disco depois que o banco confirma.

import { unlink } from "fs/promises";
import path from "path";
import { prisma } from "@/lib/prisma";
import { saveUploadedFile, UPLOAD_DIR } from "@/lib/uploadValidation";

export type DadosDossie = {
  chave: string;
  numOcp: string | null;
  codFil: string;
  codFor?: string | null;
  titulos: string[];
  fornecedorNome?: string | null;
  vencimento?: string | null; // aaaa-mm-dd
  valorTotal?: number | null;
  status: "PUBLICADO" | "ERRO" | "GERANDO";
  motivo?: string | null;
  origem?: string | null;
};

export function chaveDaOc(codFil: string | number, numOcp: string | number) {
  return `OC|${codFil}|${numOcp}`;
}

/** Ignora as sentinelas de "sem data" da Senior (31/12/1900 e afins). */
function dataOuNull(v: string | null | undefined) {
  if (!v) return null;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return null;
  const ano = d.getUTCFullYear();
  return ano < 1950 || ano > 2100 ? null : d;
}

export async function salvarDossie(d: DadosDossie, pdf?: { bytes: Buffer; nome: string } | null) {
  const existente = await prisma.dossieOC.findUnique({ where: { chave: d.chave } });
  let arquivoNome = existente?.arquivoNome ?? null;
  let arquivoPath = existente?.arquivoPath ?? null;
  let arquivoBytes = existente?.arquivoBytes ?? null;
  let pathAntigo: string | null = null;

  if (pdf && pdf.bytes.length > 0) {
    const salvo = await saveUploadedFile(new File([new Uint8Array(pdf.bytes)], pdf.nome, { type: "application/pdf" }), "dossies");
    pathAntigo = existente?.arquivoPath ?? null;
    arquivoNome = pdf.nome;
    arquivoPath = salvo.filePath;
    arquivoBytes = salvo.fileSize;
  }

  const dados = {
    numOcp: d.numOcp,
    codFil: d.codFil,
    codFor: d.codFor ?? null,
    titulos: d.titulos,
    fornecedorNome: d.fornecedorNome ?? null,
    vencimento: dataOuNull(d.vencimento),
    valorTotal: d.valorTotal ?? null,
    status: d.status,
    motivo: d.motivo ?? null,
    origem: d.origem ?? "APPCNS",
    arquivoNome,
    arquivoPath,
    arquivoBytes,
  };
  const registro = await prisma.dossieOC.upsert({ where: { chave: d.chave }, update: dados, create: { chave: d.chave, ...dados } });
  if (pathAntigo && pathAntigo !== arquivoPath) {
    try {
      await unlink(path.join(UPLOAD_DIR, pathAntigo));
    } catch {
      /* ja pode ter sumido */
    }
  }
  return registro;
}

/** Marca a OC como "gerando" sem apagar nada do que ja existe. */
export async function marcarGerando(codFil: string, numOcp: string) {
  const chave = chaveDaOc(codFil, numOcp);
  const existente = await prisma.dossieOC.findUnique({ where: { chave } });
  if (existente) return prisma.dossieOC.update({ where: { chave }, data: { status: "GERANDO", motivo: null } });
  return prisma.dossieOC.create({ data: { chave, numOcp, codFil, titulos: [], status: "GERANDO", origem: "APPCNS" } });
}

/** Falha na geracao: so' troca status/motivo -- dados e PDF anteriores (se houver) ficam como estavam. */
export async function registrarFalha(codFil: string, numOcp: string, motivo: string) {
  const chave = chaveDaOc(codFil, numOcp);
  const existente = await prisma.dossieOC.findUnique({ where: { chave } });
  if (existente) return prisma.dossieOC.update({ where: { chave }, data: { status: "ERRO", motivo } });
  return prisma.dossieOC.create({ data: { chave, numOcp, codFil, titulos: [], status: "ERRO", motivo, origem: "APPCNS" } });
}
