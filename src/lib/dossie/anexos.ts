// Anexos do dossie (botao "Editar dossie", 11/11/2026): PDF, JPG ou PNG que entram no FIM do PDF do dossie.
//
// O PDF gerado (DossieOC.arquivoPath) nao e' alterado: os anexos ficam guardados a parte (DossieAnexo) e sao juntados na hora
// de entregar o dossie (lerPdfDoDossie) -- uma pagina "Anexos do dossie" com a lista e, depois, as paginas de cada anexo.
// Assim a geracao automatica pode refazer o PDF quando a OC muda sem perder nada do que foi anexado.
// O tipo do arquivo e' conferido pelo CONTEUDO (assinatura do arquivo), nao pela extensao; PDF com senha ou corrompido e'
// recusado na hora de anexar, para nunca quebrar a abertura do dossie depois.

import { readFile, unlink } from "fs/promises";
import path from "path";
import { PDFDocument, PageSizes, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { prisma } from "@/lib/prisma";
import { UPLOAD_DIR, saveUploadedFile } from "@/lib/uploadValidation";

export type TipoAnexo = "application/pdf" | "image/jpeg" | "image/png";
export const LIMITES_ANEXO = { bytesPorArquivo: 15 * 1024 * 1024, bytesPorDossie: 50 * 1024 * 1024, arquivosPorDossie: 20 };
const MB = (n: number) => `${Math.round(n / 1024 / 1024)} MB`;

/** Tipo pelo conteudo: %PDF (nos primeiros 1024 bytes, como os leitores aceitam), assinatura PNG ou JPEG. */
export function tipoPeloConteudo(bytes: Uint8Array): TipoAnexo | null {
  const inicio = Buffer.from(bytes.subarray(0, 1024)).toString("latin1");
  if (inicio.includes("%PDF-")) return "application/pdf";
  const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (bytes.length > 8 && png.every((b, i) => bytes[i] === b)) return "image/png";
  if (bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  return null;
}

/** Confere o arquivo antes de guardar. Erro = mensagem pronta para a tela. */
export async function conferirAnexo(bytes: Uint8Array): Promise<{ tipo: TipoAnexo; paginas: number }> {
  if (!bytes.length) throw new Error("Arquivo vazio.");
  if (bytes.length > LIMITES_ANEXO.bytesPorArquivo) throw new Error(`Arquivo maior que ${MB(LIMITES_ANEXO.bytesPorArquivo)}.`);
  const tipo = tipoPeloConteudo(bytes);
  if (!tipo) throw new Error("Só é possível anexar PDF, JPG ou PNG.");
  if (tipo === "application/pdf") {
    let paginas: number;
    try {
      // pdf-lib aceita lixo com cabecalho %PDF e so' falha ao procurar as paginas: as duas coisas ficam aqui dentro.
      paginas = (await PDFDocument.load(bytes)).getPageCount();
    } catch (e) {
      throw new Error(/encrypt/i.test(String((e as Error)?.message)) ? "PDF protegido por senha não pode ser anexado. Salve uma cópia sem senha." : "PDF corrompido ou ilegível.");
    }
    if (!paginas) throw new Error("PDF sem páginas.");
    return { tipo, paginas };
  }
  try {
    const doc = await PDFDocument.create();
    await (tipo === "image/png" ? doc.embedPng(bytes) : doc.embedJpg(bytes));
  } catch {
    throw new Error("Imagem corrompida ou em formato não suportado.");
  }
  return { tipo, paginas: 1 };
}

// ---------------------------------------------------------------- montagem do PDF final

export type AnexoParaPdf = { nome: string; tipo: string; bytes: Uint8Array | null; criadoPorNome: string | null; criadoEm: Date };

/** Helvetica do PDF so' escreve WinAnsi (latim + alguns sinais); o resto vira "?". */
const winAnsi = (t: string) => t.normalize("NFC").replace(/[^\x20-\x7E -ÿ€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ]/g, "?");

function caber(t: string, fonte: PDFFont, tamanho: number, largura: number): string {
  let s = winAnsi(t);
  if (fonte.widthOfTextAtSize(s, tamanho) <= largura) return s;
  while (s.length > 1 && fonte.widthOfTextAtSize(`${s}…`, tamanho) > largura) s = s.slice(0, -1);
  return `${s}…`;
}

const quando = (d: Date) => d.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });

/** PDF do dossie + pagina com a lista dos anexos + as paginas de cada anexo, na ordem em que foram anexados. */
export async function montarPdfComAnexos(base: Uint8Array, anexos: AnexoParaPdf[]): Promise<Uint8Array> {
  const final = await PDFDocument.load(base);
  if (!anexos.length) return final.save();
  const fonte = await final.embedFont(StandardFonts.Helvetica);
  const negrito = await final.embedFont(StandardFonts.HelveticaBold);
  const [larguraA4, alturaA4] = PageSizes.A4;
  const margem = 42;
  const util = larguraA4 - 2 * margem;
  const cinza = rgb(0.35, 0.35, 0.35);

  // Pagina-indice
  let pagina: PDFPage = final.addPage([larguraA4, alturaA4]);
  let y = alturaA4 - margem - 10;
  const escrever = (t: string, tamanho: number, f = fonte, cor = rgb(0.13, 0.13, 0.13)) => {
    if (y < margem + 20) {
      pagina = final.addPage([larguraA4, alturaA4]);
      y = alturaA4 - margem - 10;
    }
    pagina.drawText(caber(t, f, tamanho, util), { x: margem, y, size: tamanho, font: f, color: cor });
    y -= tamanho + 7;
  };
  escrever("Anexos do dossiê", 16, negrito);
  y -= 4;
  escrever("Documentos anexados pelo botão \"Editar dossiê\" do sistema. Seguem a partir da próxima página, nesta ordem:", 9.5, fonte, cinza);
  y -= 6;
  anexos.forEach((a, i) => {
    escrever(`${i + 1}. ${a.nome}`, 11, negrito);
    escrever(`${a.tipo === "application/pdf" ? "PDF" : "Imagem"} — anexado${a.criadoPorNome ? ` por ${a.criadoPorNome}` : ""} em ${quando(a.criadoEm)}${a.bytes ? "" : " — ARQUIVO NÃO ENCONTRADO NO SERVIDOR"}`, 9, fonte, cinza);
    y -= 4;
  });

  // Paginas de cada anexo
  for (const [i, a] of anexos.entries()) {
    const titulo = `Anexo ${i + 1} — ${a.nome}`;
    try {
      if (!a.bytes) throw new Error("arquivo não encontrado no servidor");
      if (a.tipo === "application/pdf") {
        const origem = await PDFDocument.load(a.bytes);
        for (const p of await final.copyPages(origem, origem.getPageIndices())) final.addPage(p);
        continue;
      }
      const imagem = a.tipo === "image/png" ? await final.embedPng(a.bytes) : await final.embedJpg(a.bytes);
      const deitada = imagem.width > imagem.height;
      const [w, h] = deitada ? [alturaA4, larguraA4] : [larguraA4, alturaA4];
      const p = final.addPage([w, h]);
      p.drawText(caber(titulo, fonte, 9, w - 2 * margem), { x: margem, y: h - margem + 12, size: 9, font: fonte, color: cinza });
      const escala = Math.min((w - 2 * margem) / imagem.width, (h - 2 * margem - 10) / imagem.height, 1);
      const [iw, ih] = [imagem.width * escala, imagem.height * escala];
      p.drawImage(imagem, { x: (w - iw) / 2, y: (h - margem - 10 - ih) / 2 + margem / 2, width: iw, height: ih });
    } catch (e) {
      const p = final.addPage([larguraA4, alturaA4]);
      p.drawText(caber(titulo, negrito, 12, util), { x: margem, y: alturaA4 - margem - 10, size: 12, font: negrito });
      p.drawText(caber(`Este anexo não pôde ser incluído: ${(e as Error)?.message ?? e}`, fonte, 10, util), { x: margem, y: alturaA4 - margem - 32, size: 10, font: fonte, color: cinza });
    }
  }
  return final.save();
}

// ---------------------------------------------------------------- banco + disco

/** O PDF que o usuario recebe: o gerado + os anexos (se houver). Sem anexo, devolve o arquivo como esta. */
export async function lerPdfDoDossie(dossie: { id: string; arquivoPath: string | null }): Promise<Buffer> {
  if (!dossie.arquivoPath) throw new Error("Este dossiê não tem documento gerado.");
  const base = await readFile(path.join(UPLOAD_DIR, dossie.arquivoPath));
  const anexos = await prisma.dossieAnexo.findMany({ where: { dossieId: dossie.id }, orderBy: { criadoEm: "asc" } });
  if (!anexos.length) return base;
  const comBytes = await Promise.all(anexos.map(async (a) => ({ ...a, bytes: await readFile(path.join(UPLOAD_DIR, a.caminho)).catch(() => null) })));
  return Buffer.from(await montarPdfComAnexos(base, comBytes));
}

export const listarAnexos = (dossieId: string) =>
  prisma.dossieAnexo.findMany({
    where: { dossieId },
    orderBy: { criadoEm: "asc" },
    select: { id: true, nome: true, tipo: true, bytes: true, paginas: true, criadoPorNome: true, criadoEm: true },
  });

/** Guarda um anexo no dossie. Erro = mensagem pronta para a tela (limites, tipo, PDF com senha...). */
export async function incluirAnexo(dossieId: string, arquivo: { nome: string; bytes: Uint8Array }, usuario: { id?: string | null; nome?: string | null }) {
  const existentes = await prisma.dossieAnexo.findMany({ where: { dossieId }, select: { bytes: true } });
  if (existentes.length >= LIMITES_ANEXO.arquivosPorDossie) throw new Error(`O dossiê já tem ${LIMITES_ANEXO.arquivosPorDossie} anexos (limite).`);
  const total = existentes.reduce((s, a) => s + a.bytes, 0);
  if (total + arquivo.bytes.length > LIMITES_ANEXO.bytesPorDossie) throw new Error(`Os anexos do dossiê passariam de ${MB(LIMITES_ANEXO.bytesPorDossie)} (limite).`);
  const { tipo, paginas } = await conferirAnexo(arquivo.bytes);
  const nome = arquivo.nome.trim().slice(0, 200) || "anexo";
  const salvo = await saveUploadedFile(new File([new Uint8Array(arquivo.bytes)], nome, { type: tipo }), "dossies-anexos");
  try {
    return await prisma.dossieAnexo.create({
      data: { dossieId, nome, tipo, caminho: salvo.filePath, bytes: salvo.fileSize, paginas, criadoPorId: usuario.id ?? null, criadoPorNome: usuario.nome ?? null },
      select: { id: true, nome: true, tipo: true, bytes: true, paginas: true, criadoPorNome: true, criadoEm: true },
    });
  } catch (e) {
    await unlink(path.join(UPLOAD_DIR, salvo.filePath)).catch(() => {});
    throw e;
  }
}

/** Tira o anexo do dossie e apaga o arquivo. null = nao existe (ou e' de outro dossie). */
export async function removerAnexo(dossieId: string, anexoId: string) {
  const anexo = await prisma.dossieAnexo.findFirst({ where: { id: anexoId, dossieId } });
  if (!anexo) return null;
  await prisma.dossieAnexo.delete({ where: { id: anexo.id } });
  await unlink(path.join(UPLOAD_DIR, anexo.caminho)).catch(() => {});
  return anexo;
}
