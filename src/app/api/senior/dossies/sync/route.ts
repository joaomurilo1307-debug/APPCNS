import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { saveUploadedFile, UPLOAD_DIR } from "@/lib/uploadValidation";
import { unlink } from "fs/promises";
import path from "path";

// Ingestão dos dossiês de OC gerados pela automação do n8n.
//
// Mesmo padrão de autenticação das outras rotas de sincronismo do Senior
// (header x-sync-key). Aceita dois formatos, porque o fluxo tem dois ramos:
//
//   application/json     -> os dados, com o PDF opcional em base64
//                           (arquivoBase64 + arquivoNome). É o caminho que o
//                           n8n usa, porque monta tudo num Code node só.
//   multipart/form-data  -> campo "dados" (JSON em texto) + campo "arquivo"
//                           (o PDF cru). Alternativa pra arquivo grande, sem
//                           o inchaço de 33% do base64.
//
// Em ambos, o PDF é opcional: o fluxo também registra o que NÃO conseguiu
// gerar (título sem OC, OC ainda não quitada, falha na publicação do GED) --
// é isso que permite a tela dizer POR QUE não existe dossiê, em vez de só
// omitir a linha e deixar a pergunta no ar.
//
// O PDF é gravado em disco com o mesmo helper dos anexos (UPLOAD_DIR), e o
// registro guarda só o caminho relativo.

const MAX_PDF = 40 * 1024 * 1024; // um dossiê tem ~4 páginas; 40MB é folga larga

const dadosSchema = z.object({
  chave: z.string().min(1),
  numOcp: z.string().nullable().optional(),
  codFil: z.string().min(1),
  codFor: z.string().nullable().optional(),
  titulos: z.array(z.string()).default([]),
  fornecedorNome: z.string().nullable().optional(),
  vencimento: z.string().nullable().optional(),
  valorTotal: z.number().nullable().optional(),
  status: z.enum(["PUBLICADO", "ERRO", "SEM_OC", "OC_NAO_QUITADA"]),
  motivo: z.string().nullable().optional(),
  origem: z.string().nullable().optional(),
  gedDocumentId: z.string().nullable().optional(),
  gedVersao: z.string().nullable().optional(),
  arquivoNome: z.string().nullable().optional(),
  arquivoBase64: z.string().nullable().optional(),
});

function dataOuNull(v: string | null | undefined) {
  if (!v) return null;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return null;
  // O Senior usa 31/12/1900 e 30/12/1899 como "sem data" -- não deixar
  // sentinela virar data real aqui, que é onde ela contamina relatório.
  const ano = d.getUTCFullYear();
  if (ano < 1950 || ano > 2100) return null;
  return d;
}

export async function POST(req: Request) {
  const chaveSync = req.headers.get("x-sync-key");
  if (!chaveSync || chaveSync !== process.env.SENIOR_SYNC_KEY) {
    return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });
  }

  const contentType = req.headers.get("content-type") || "";
  let brutos: unknown;
  let arquivo: File | null = null;
  let pdfBytes: Buffer | null = null;
  let pdfNome: string | null = null;

  if (contentType.includes("multipart/form-data")) {
    const form = await req.formData().catch(() => null);
    if (!form) return NextResponse.json({ error: "Multipart invalido" }, { status: 422 });
    const dados = form.get("dados");
    if (typeof dados !== "string") {
      return NextResponse.json({ error: "Campo 'dados' (JSON em texto) e obrigatorio" }, { status: 422 });
    }
    try {
      brutos = JSON.parse(dados);
    } catch {
      return NextResponse.json({ error: "Campo 'dados' nao e um JSON valido" }, { status: 422 });
    }
    const f = form.get("arquivo");
    if (f && typeof f !== "string") arquivo = f as File;
  } else {
    brutos = await req.json().catch(() => null);
    if (brutos === null) return NextResponse.json({ error: "JSON invalido" }, { status: 422 });
  }

  const parsed = dadosSchema.safeParse(brutos);
  if (!parsed.success) {
    return NextResponse.json({ error: "Payload invalido", detalhes: parsed.error.flatten() }, { status: 422 });
  }
  const d = parsed.data;

  if (arquivo) {
    if (arquivo.size > MAX_PDF) {
      return NextResponse.json({ error: `Arquivo maior que ${MAX_PDF / 1024 / 1024}MB` }, { status: 413 });
    }
    pdfBytes = Buffer.from(await arquivo.arrayBuffer());
    pdfNome = arquivo.name;
  } else if (d.arquivoBase64) {
    try {
      pdfBytes = Buffer.from(d.arquivoBase64, "base64");
    } catch {
      return NextResponse.json({ error: "arquivoBase64 invalido" }, { status: 422 });
    }
    if (pdfBytes.length === 0) {
      return NextResponse.json({ error: "arquivoBase64 vazio" }, { status: 422 });
    }
    if (pdfBytes.length > MAX_PDF) {
      return NextResponse.json({ error: `Arquivo maior que ${MAX_PDF / 1024 / 1024}MB` }, { status: 413 });
    }
    pdfNome = d.arquivoNome || `dossie-${d.numOcp ?? d.chave}.pdf`;
  }

  const existente = await prisma.dossieOC.findUnique({ where: { chave: d.chave } });

  // Só grava arquivo novo se veio arquivo. Reenvio sem PDF (ex. o ramo de
  // erro rodando depois de um sucesso) não apaga o documento que já existe.
  let arquivoNome = existente?.arquivoNome ?? null;
  let arquivoPath = existente?.arquivoPath ?? null;
  let arquivoBytes = existente?.arquivoBytes ?? null;
  let pathAntigo: string | null = null;

  if (pdfBytes && pdfNome) {
    const comoArquivo = new File([new Uint8Array(pdfBytes)], pdfNome, { type: "application/pdf" });
    const salvo = await saveUploadedFile(comoArquivo, "dossies");
    pathAntigo = existente?.arquivoPath ?? null;
    arquivoNome = pdfNome;
    arquivoPath = salvo.filePath;
    arquivoBytes = salvo.fileSize;
  }

  const dados = {
    numOcp: d.numOcp ?? null,
    codFil: d.codFil,
    codFor: d.codFor ?? null,
    titulos: d.titulos,
    fornecedorNome: d.fornecedorNome ?? null,
    vencimento: dataOuNull(d.vencimento),
    valorTotal: d.valorTotal ?? null,
    status: d.status,
    motivo: d.motivo ?? null,
    origem: d.origem ?? null,
    gedDocumentId: d.gedDocumentId ?? null,
    gedVersao: d.gedVersao ?? null,
    arquivoNome,
    arquivoPath,
    arquivoBytes,
  };

  const registro = await prisma.dossieOC.upsert({
    where: { chave: d.chave },
    update: dados,
    create: { chave: d.chave, ...dados },
  });

  // versão anterior do PDF sai do disco só depois do banco confirmar
  if (pathAntigo && pathAntigo !== arquivoPath) {
    try {
      await unlink(path.join(UPLOAD_DIR, pathAntigo));
    } catch {
      // já pode ter sumido -- não é motivo pra falhar a ingestão
    }
  }

  return NextResponse.json({ ok: true, id: registro.id, chave: registro.chave, comArquivo: !!arquivoPath });
}

export async function GET(req: Request) {
  const chaveSync = req.headers.get("x-sync-key");
  if (!chaveSync || chaveSync !== process.env.SENIOR_SYNC_KEY) {
    return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });
  }
  const [total, publicados] = await Promise.all([
    prisma.dossieOC.count(),
    prisma.dossieOC.count({ where: { status: "PUBLICADO" } }),
  ]);
  return NextResponse.json({ total, publicados });
}
