import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { problemasDaCarga } from "@/lib/custoPessoal/validarCarga";
import { impressaoDoMes, mesesFechadosNaCarga, resumoDoMes } from "@/lib/custoPessoal/fechamento";
import { chaveSyncValida } from "@/lib/senior/chaveSync";

// Carga do custo de pessoal CLT de TODOS os centros de custo (espelho da folha do Senior, calculado fora com a regra do Rito: scratchpad/custo_pessoal_senior.py
// e sincronizado por scratchpad/sync_custo_pessoal.py). Substitui os meses enviados (apaga o mes e grava de novo), porque o centro de custo de uma pessoa pode
// mudar e uma linha antiga nao pode sobrar, e confere se o total de cada linha bate com os componentes.
// MES FECHADO NAO MUDA: se algum mes da carga ja foi fechado (CustoPessoalFechamento), a carga inteira e' recusada (409). `fechar: true` fecha os meses enviados
// na mesma transacao, guardando o resumo e a impressao (SHA-256) deles. Reabrir so' em /api/senior/custo-pessoal/fechamento.
// GET (mesma chave) devolve linhas e total por mes e, nos meses fechados, se a impressao ainda confere.

const MES = z.string().regex(/^\d{4}-\d{2}$/);
const num = z.number().finite();
const itemSchema = z.object({
  codccu: z.string().min(1),
  ccuHcm: z.string().min(1),
  nomeCentro: z.string().nullable().optional(),
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
const bodySchema = z.object({ meses: z.array(MES).min(1), itens: z.array(itemSchema).min(1), fechar: z.boolean().optional(), observacao: z.string().max(300).optional() });

const chaveValida = (req: Request) => {
  const chave = req.headers.get("x-sync-key");
  return chaveSyncValida(chave);
};

export async function POST(req: Request) {
  if (!chaveValida(req)) return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Payload invalido", detalhes: parsed.error.flatten() }, { status: 422 });
  const { meses, itens, fechar, observacao } = parsed.data;

  const problemas = problemasDaCarga(meses, itens);
  if (problemas.length) return NextResponse.json({ error: "Carga recusada: dados inconsistentes", problemas: problemas.slice(0, 30), total: problemas.length }, { status: 422 });

  const fechados = new Set((await prisma.custoPessoalFechamento.findMany({ where: { mes: { in: meses } }, select: { mes: true } })).map((f) => f.mes));
  const emConflito = mesesFechadosNaCarga(meses, fechados);
  if (emConflito.length) return NextResponse.json({ error: "Carga recusada: mes fechado nao muda. Para corrigir um mes fechado, reabra-o antes (com motivo).", mesesFechados: emConflito }, { status: 409 });

  const vazios = meses.filter((m) => !itens.some((i) => i.mes === m));
  if (fechar && vazios.length) return NextResponse.json({ error: "Nao e' possivel fechar mes sem folha", mesesSemFolha: vazios }, { status: 422 });

  const datas = meses.map((m) => new Date(`${m}-01T00:00:00.000Z`));
  const linhasDe = (mes: string) => itens.filter((i) => i.mes === mes);
  const [apagados, criados] = await prisma.$transaction([
    prisma.custoPessoalMes.deleteMany({ where: { competencia: { in: datas } } }),
    prisma.custoPessoalMes.createMany({
      data: itens.map((i) => ({
        codccu: i.codccu, ccuHcm: i.ccuHcm, nomeCentro: i.nomeCentro ?? null, competencia: new Date(`${i.mes}-01T00:00:00.000Z`), matricula: i.matricula, nome: i.nome,
        cargo: i.cargo ?? null, situacao: i.situacao ?? null, dataSituacao: i.dataSituacao || null, admissao: i.admissao ?? null, origemCc: i.origemCc ?? null,
        salarioBase: i.salarioBase, liquido: i.liquido, rescisao: i.rescisao, inss: i.inss, fgts: i.fgts, irrf: i.irrf,
        provFerias: i.provFerias, provTerco: i.provTerco, prov13: i.prov13, provInss: i.provInss, provFgts: i.provFgts, proLabore: i.proLabore, total: i.total,
      })),
    }),
    ...(fechar
      ? meses.map((m) => prisma.custoPessoalFechamento.create({ data: { mes: m, fechadoPor: "carga com fechar=true", observacao: observacao ?? null, impressao: impressaoDoMes(linhasDe(m)), ...resumoDoMes(linhasDe(m)) } }))
      : []),
  ]);
  return NextResponse.json({ ok: true, meses, apagados: apagados.count, gravados: criados.count, fechados: fechar ? meses : [] });
}

export async function GET(req: Request) {
  if (!chaveValida(req)) return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });
  const [por, fechamentos] = await Promise.all([
    prisma.custoPessoalMes.groupBy({ by: ["competencia"], _sum: { total: true, proLabore: true }, _count: { matricula: true }, orderBy: { competencia: "asc" } }),
    prisma.custoPessoalFechamento.findMany({ orderBy: { mes: "asc" } }),
  ]);
  const centavos = (v: number | null) => Math.round((v ?? 0) * 100) / 100;
  const meses = [];
  for (const p of por) {
    const mes = p.competencia.toISOString().slice(0, 7);
    const f = fechamentos.find((x) => x.mes === mes);
    let integro: boolean | null = null;
    if (f) {
      const linhas = await prisma.custoPessoalMes.findMany({ where: { competencia: p.competencia } });
      integro = impressaoDoMes(linhas) === f.impressao;
    }
    meses.push({ mes, linhas: p._count.matricula, total: centavos(p._sum.total), proLabore: centavos(p._sum.proLabore), fechado: !!f, fechadoEm: f?.fechadoEm.toISOString() ?? null, integro });
  }
  return NextResponse.json({ meses });
}
