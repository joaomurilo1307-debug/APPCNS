import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { contaConhecida } from "@/lib/custos/planoContas";
import { lerMes } from "@/lib/custos/previsto";

// Importacao UNICA do previsto das planilhas CONTROLE DE CUSTOS dos coordenadores (aba DADOS PREVISTO) e das fichas (responsavel/objeto).
// Chave SENIOR_SYNC_KEY. Idempotente por arquivo: se o arquivo ja foi importado, nada e' repetido, a menos que `substituir` -- e mesmo
// assim so' sai (exclusao logica) o que veio da planilha E ninguem ajustou no sistema. Fichas ja preenchidas nao sao sobrescritas.

const linhaSchema = z.object({
  codccu: z.string().regex(/^\d{1,10}$/),
  conta: z.number().int().positive(),
  competencia: z.string().nullable(),
  valor: z.number().finite(),
  descricao: z.string().max(300).nullable().optional(),
  fornecedor: z.string().max(200).nullable().optional(),
  arquivo: z.string().max(200),
});
const bodySchema = z.object({
  substituir: z.boolean().optional(),
  linhas: z.array(linhaSchema).max(20000),
  fichas: z.array(z.object({ codccu: z.string().regex(/^\d{1,10}$/), responsavel: z.string().max(200).nullable(), objeto: z.string().max(600).nullable() })).max(500).optional(),
});

export async function POST(req: Request) {
  const chave = req.headers.get("x-sync-key");
  if (!chave || chave !== process.env.SENIOR_SYNC_KEY) return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Payload invalido", detalhes: parsed.error.flatten() }, { status: 422 });
  const { linhas, fichas = [], substituir = false } = parsed.data;

  const invalidas: string[] = [];
  const validas = linhas.filter((l) => {
    if (!contaConhecida(l.conta)) {
      invalidas.push(`conta ${l.conta} desconhecida`);
      return false;
    }
    if (l.competencia !== null && !lerMes(l.competencia)) {
      invalidas.push(`mes invalido ${l.competencia}`);
      return false;
    }
    return true;
  });

  const porArquivo = new Map<string, typeof validas>();
  for (const l of validas) porArquivo.set(l.arquivo, [...(porArquivo.get(l.arquivo) ?? []), l]);

  const resultado: Record<string, { jaExistia: boolean; removidas: number; criadas: number }> = {};
  for (const [arquivo, lista] of porArquivo) {
    const existentes = await prisma.custoPrevisto.count({ where: { origem: "PLANILHA", arquivoOrigem: arquivo, excluidoEm: null } });
    if (existentes > 0 && !substituir) {
      resultado[arquivo] = { jaExistia: true, removidas: 0, criadas: 0 };
      continue;
    }
    let removidas = 0;
    if (existentes > 0) {
      const r = await prisma.custoPrevisto.updateMany({ where: { origem: "PLANILHA", arquivoOrigem: arquivo, excluidoEm: null, atualizadoPorId: null }, data: { excluidoEm: new Date() } });
      removidas = r.count;
    }
    for (let i = 0; i < lista.length; i += 1000) {
      await prisma.custoPrevisto.createMany({
        data: lista.slice(i, i + 1000).map((l) => ({
          codccu: l.codccu,
          conta: l.conta,
          competencia: l.competencia ? new Date(`${lerMes(l.competencia)}-01T00:00:00.000Z`) : null,
          valor: l.valor,
          descricao: l.descricao?.trim() || null,
          fornecedor: l.fornecedor?.trim() || null,
          origem: "PLANILHA",
          arquivoOrigem: arquivo,
        })),
      });
    }
    resultado[arquivo] = { jaExistia: existentes > 0, removidas, criadas: lista.length };
  }

  let fichasCriadas = 0;
  for (const f of fichas) {
    const ja = await prisma.custoCentroFicha.findUnique({ where: { codccu: f.codccu } });
    if (ja && (ja.responsavel || ja.objeto) && !substituir) continue;
    await prisma.custoCentroFicha.upsert({ where: { codccu: f.codccu }, create: { codccu: f.codccu, responsavel: f.responsavel, objeto: f.objeto }, update: { responsavel: f.responsavel, objeto: f.objeto } });
    fichasCriadas++;
  }
  return NextResponse.json({ ok: true, recebidas: linhas.length, invalidas: invalidas.length, motivosInvalidas: Array.from(new Set(invalidas)).slice(0, 10), arquivos: resultado, fichasGravadas: fichasCriadas });
}
