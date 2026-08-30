import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { upsertEpiEstoque, upsertEpiProdutoPorNome } from "@/lib/epi";
import { z } from "zod";

// Import estruturado a partir de uma planilha no padrão "INFORMAÇÕES GERAIS" (ex: MRN):
// aba de colaboradores (nome/contrato/função/tamanhos/dados pessoais), aba de regra de
// EPI por função (matriz função x contrato x parte do corpo) e aba de estoque (produto,
// estoque inicial, mínimo). O parse do .xlsx acontece no navegador (lib xlsx já usada em
// TaskListView) — aqui só recebemos JSON já estruturado e fazemos upsert.

const colaboradorSchema = z.object({
  nomeCompleto: z.string().min(1),
  contrato: z.string().min(1),
  funcao: z.string().min(1),
  situacao: z.string().optional(),
  admissao: z.string().nullable().optional(),
  bota: z.union([z.number(), z.string()]).nullable().optional(),
  camisa: z.string().nullable().optional(),
  calca: z.union([z.number(), z.string()]).nullable().optional(),
  cpf: z.string().nullable().optional(),
  rg: z.string().nullable().optional(),
  nascimento: z.string().nullable().optional(),
  moradia: z.string().nullable().optional(),
  endereco: z.string().nullable().optional(),
  numero: z.string().nullable().optional(),
});

const funcaoRegraSchema = z.object({
  contrato: z.string().min(1),
  funcao: z.string().min(1),
  categoria: z.string().min(1),
  descricao: z.string().min(1),
});

const estoqueItemSchema = z.object({
  produto: z.string().min(1),
  contrato: z.string().nullable().optional(),
  estoqueInicial: z.number().default(0),
  estoqueMinimo: z.number().default(0),
  medida: z.string().nullable().optional(),
});

const importSchema = z.object({
  colaboradores: z.array(colaboradorSchema).default([]),
  funcaoRegras: z.array(funcaoRegraSchema).default([]),
  estoque: z.array(estoqueItemSchema).default([]),
});

function parseDate(v: string | null | undefined) {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

function extractCA(nome: string): string | null {
  const m = nome.match(/CA\s*[:\-]?\s*(\d{3,7})/i);
  return m ? m[1] : null;
}

function toIntOrNull(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : parseInt(String(v).replace(/\D/g, ""), 10);
  return Number.isFinite(n) ? n : null;
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const role = (session.user as any).role;
  if (!["ADMIN", "DIRETOR", "GESTOR_PROJETO"].includes(role)) {
    return NextResponse.json({ error: "Sem permissão para importar dados do almoxarifado" }, { status: 403 });
  }

  const body = await req.json();
  const parsed = importSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });
  const { colaboradores, funcaoRegras, estoque } = parsed.data;

  const contratoCache = new Map<string, string>();
  async function contratoId(codigo: string): Promise<string> {
    const key = codigo.trim();
    if (contratoCache.has(key)) return contratoCache.get(key)!;
    const c = await prisma.epiContrato.upsert({
      where: { codigo: key },
      update: {},
      create: { codigo: key },
    });
    contratoCache.set(key, c.id);
    return c.id;
  }

  let colaboradoresImportados = 0;
  for (const c of colaboradores) {
    const cId = await contratoId(c.contrato);
    await prisma.epiColaborador.upsert({
      where: { contratoId_nomeCompleto: { contratoId: cId, nomeCompleto: c.nomeCompleto.trim() } },
      update: {
        funcao: c.funcao.trim(),
        situacao: c.situacao?.trim() || "ATIVO",
        admissao: parseDate(c.admissao),
        tamanhoBota: toIntOrNull(c.bota),
        tamanhoCamisa: c.camisa?.trim() || null,
        tamanhoCalca: toIntOrNull(c.calca),
        cpf: c.cpf?.trim() || null,
        rg: c.rg?.trim() || null,
        nascimento: parseDate(c.nascimento),
        moradia: c.moradia?.trim() || null,
        endereco: c.endereco?.trim() || null,
        numero: c.numero?.trim() || null,
      },
      create: {
        contratoId: cId,
        nomeCompleto: c.nomeCompleto.trim(),
        funcao: c.funcao.trim(),
        situacao: c.situacao?.trim() || "ATIVO",
        admissao: parseDate(c.admissao),
        tamanhoBota: toIntOrNull(c.bota),
        tamanhoCamisa: c.camisa?.trim() || null,
        tamanhoCalca: toIntOrNull(c.calca),
        cpf: c.cpf?.trim() || null,
        rg: c.rg?.trim() || null,
        nascimento: parseDate(c.nascimento),
        moradia: c.moradia?.trim() || null,
        endereco: c.endereco?.trim() || null,
        numero: c.numero?.trim() || null,
      },
    });
    colaboradoresImportados++;
  }

  let regrasImportadas = 0;
  for (const r of funcaoRegras) {
    const cId = await contratoId(r.contrato);
    await prisma.epiFuncaoRegra.upsert({
      where: {
        contratoId_funcao_categoria: { contratoId: cId, funcao: r.funcao.trim(), categoria: r.categoria.trim() },
      },
      update: { descricao: r.descricao },
      create: { contratoId: cId, funcao: r.funcao.trim(), categoria: r.categoria.trim(), descricao: r.descricao },
    });
    regrasImportadas++;
  }

  let estoqueImportado = 0;
  for (const e of estoque) {
    const nome = e.produto.trim();
    const ca = extractCA(nome);
    const produto = await upsertEpiProdutoPorNome(
      nome,
      null,
      { ca, unidade: e.medida?.trim() || "UNID" },
      { ca: ca ?? undefined, unidade: e.medida?.trim() || undefined }
    );
    const cId = e.contrato ? await contratoId(e.contrato) : null;
    await upsertEpiEstoque(produto.id, cId, { estoqueInicial: e.estoqueInicial, estoqueMinimo: e.estoqueMinimo });
    estoqueImportado++;
  }

  return NextResponse.json({
    colaboradoresImportados,
    regrasImportadas,
    estoqueImportado,
    contratos: contratoCache.size,
  });
}
