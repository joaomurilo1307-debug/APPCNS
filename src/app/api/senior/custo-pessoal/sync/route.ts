import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { problemasDaCarga } from "@/lib/custoPessoal/validarCarga";

// Carga do custo de pessoal CLT dos centros de custo ADM (espelho da folha do Senior, calculado fora com a regra do Rito: scratchpad/custo_pessoal_adm_senior.py
// e sincronizado por scratchpad/sync_custo_pessoal_adm.py). SEMPRE substitui os meses enviados (apaga os meses e grava de novo), porque o centro de custo de
// uma pessoa pode mudar e uma linha antiga nao pode sobrar. So' aceita centros ADM e confere se o total de cada linha bate com os componentes.
// GET (mesma chave) devolve linhas e total por mes, para conferir a carga sem login.

const MES = z.string().regex(/^\d{4}-\d{2}$/);
const num = z.number().finite();
const itemSchema = z.object({
  codccu: z.string().min(1),
  ccuHcm: z.string().min(1),
  mes: MES,
  matricula: z.string().min(1),
  nome: z.string().min(1),
  cargo: z.string().nullable().optional(),
  situacao: z.string().nullable().optional(),
  dataSituacao: z.string().nullable().optional(),
  admissao: z.string().nullable().optional(),
  origemCc: z.string().nullable().optional(),
  salarioBase: num,
  liquido: num,
  rescisao: num,
  inss: num,
  fgts: num,
  irrf: num,
  provFerias: num,
  provTerco: num,
  prov13: num,
  provInss: num,
  provFgts: num,
  proLabore: num,
  total: num,
});
const bodySchema = z.object({ meses: z.array(MES).min(1), itens: z.array(itemSchema).min(1) });

const chaveValida = (req: Request) => {
  const chave = req.headers.get("x-sync-key");
  return !!chave && chave === process.env.SENIOR_SYNC_KEY;
};

export async function POST(req: Request) {
  if (!chaveValida(req)) return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Payload invalido", detalhes: parsed.error.flatten() }, { status: 422 });
  const { meses, itens } = parsed.data;

  const problemas = problemasDaCarga(meses, itens);
  if (problemas.length) return NextResponse.json({ error: "Carga recusada: dados inconsistentes", problemas: problemas.slice(0, 30), total: problemas.length }, { status: 422 });

  const datas = meses.map((m) => new Date(`${m}-01T00:00:00.000Z`));
  const [apagados, criados] = await prisma.$transaction([
    prisma.custoPessoalMes.deleteMany({ where: { competencia: { in: datas } } }),
    prisma.custoPessoalMes.createMany({
      data: itens.map((i) => ({
        codccu: i.codccu, ccuHcm: i.ccuHcm, competencia: new Date(`${i.mes}-01T00:00:00.000Z`), matricula: i.matricula, nome: i.nome,
        cargo: i.cargo ?? null, situacao: i.situacao ?? null, dataSituacao: i.dataSituacao || null, admissao: i.admissao ?? null, origemCc: i.origemCc ?? null,
        salarioBase: i.salarioBase, liquido: i.liquido, rescisao: i.rescisao, inss: i.inss, fgts: i.fgts, irrf: i.irrf,
        provFerias: i.provFerias, provTerco: i.provTerco, prov13: i.prov13, provInss: i.provInss, provFgts: i.provFgts, proLabore: i.proLabore, total: i.total,
      })),
    }),
  ]);
  return NextResponse.json({ ok: true, meses, apagados: apagados.count, gravados: criados.count });
}

export async function GET(req: Request) {
  if (!chaveValida(req)) return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });
  const por = await prisma.custoPessoalMes.groupBy({ by: ["competencia"], _sum: { total: true, proLabore: true }, _count: { matricula: true }, orderBy: { competencia: "asc" } });
  return NextResponse.json({ meses: por.map((p) => ({ mes: p.competencia.toISOString().slice(0, 7), linhas: p._count.matricula, total: Math.round((p._sum.total ?? 0) * 100) / 100, proLabore: Math.round((p._sum.proLabore ?? 0) * 100) / 100 })) });
}
