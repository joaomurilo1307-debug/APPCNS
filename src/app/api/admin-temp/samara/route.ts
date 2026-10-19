import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { categoriaDoTitulo } from "@/lib/contratos/previsao";

// ROTA TEMPORARIA (19/10/2026), protegida por x-sync-key. Sera removida apos o uso.
// GET ?q=nome            -> busca usuarios por nome (somente leitura)
// GET ?ambiental=1       -> lista os centros de custo considerados "da Ambiental" (somente leitura)
// POST {confirmar, userId}  -> libera para essa pessoa TODOS os centros de custo da Ambiental (AcessoCentroCusto) e ativa o acesso aos contratos.
const NUCLEO_AMBIENTAL = ["190", "210", "230", "280", "102065", "102225", "102245", "102295", "102335", "102345", "102385"]; // prisma/data/nucleo_assignments.json, nucleo "Engenharia Ambiental"
const PADRAO_AMBIENTAL = /^(MRN|ALCOA|AMG)\b/i; // contratos que as planilhas guardam na pasta MRN_AMBIENTAL

async function centrosAmbientais() {
  const todos = await prisma.custoContaFinanceira.findMany({ distinct: ["codccu"], select: { codccu: true, contrato: true } });
  const limpa = (c: { codccu: string; contrato: string }) => c.contrato.replace(new RegExp(`^${c.codccu}\\s*-\\s*`), "").trim();
  const lista = todos.filter((c) => NUCLEO_AMBIENTAL.includes(c.codccu) || PADRAO_AMBIENTAL.test(limpa(c))).map((c) => ({ codccu: c.codccu, nome: limpa(c), viaNucleo: NUCLEO_AMBIENTAL.includes(c.codccu) }));
  return lista.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
}

const autorizado = (req: Request) => {
  const chave = req.headers.get("x-sync-key");
  return !!chave && chave === process.env.SENIOR_SYNC_KEY;
};

export async function GET(req: Request) {
  if (!autorizado(req)) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const sp = new URL(req.url).searchParams;
  if (sp.get("ambiental")) return NextResponse.json({ centros: await centrosAmbientais() });
  if (sp.get("previsao")) {
    // diagnostico SOMENTE LEITURA do que existe em titulos em aberto (para desenhar a aba Previsao por contrato)
    const ab = await prisma.tituloContasAPagar.findMany({ where: { pago: false }, select: { numTit: true, tipo: true, codccu: true, vencimentoProgramado: true, vencimentoOriginal: true, valorAberto: true, dataEmissao: true, fornecedorNome: true, descricao: true, numOcp: true, numNfc: true } });
    const por = (f: (t: (typeof ab)[number]) => string) => { const m: Record<string, { n: number; v: number }> = {}; for (const t of ab) { const k = f(t); (m[k] ??= { n: 0, v: 0 }); m[k].n++; m[k].v += t.valorAberto; } return m; };
    const venc = (t: (typeof ab)[number]) => (t.vencimentoProgramado ?? t.vencimentoOriginal)?.toISOString().slice(0, 7) ?? "sem";
    const total = await prisma.tituloContasAPagar.count();
    return NextResponse.json({
      titulosNaBase: total, abertos: ab.length, semCcu: ab.filter((t) => !t.codccu).length,
      porTipo: por((t) => t.tipo), porVencimentoMes: Object.fromEntries(Object.entries(por(venc)).sort()), porAnoEmissao: por((t) => String(t.dataEmissao.getUTCFullYear())),
      comParcela: ab.filter((t) => t.numTit.includes("$")).length, ccusDistintos: new Set(ab.map((t) => t.codccu)).size,
      categorias: por((t) => categoriaDoTitulo(t)),
      amostraVeiculo: ab.filter((t) => categoriaDoTitulo(t) === "VEICULO").slice(0, 25).map((t) => `${t.codccu} | ${t.fornecedorNome} | ${t.descricao ?? ""} | ${t.valorAberto}`),
      amostraTI: ab.filter((t) => categoriaDoTitulo(t) === "TI").slice(0, 25).map((t) => `${t.codccu} | ${t.fornecedorNome} | ${t.descricao ?? ""} | ${t.valorAberto}`),
      topFornecedoresDemais: Object.entries(ab.filter((t) => categoriaDoTitulo(t) === "DEMAIS").reduce((m: Record<string, number>, t) => { const k = t.fornecedorNome ?? "?"; m[k] = (m[k] ?? 0) + t.valorAberto; return m; }, {})).sort((a, b) => b[1] - a[1]).slice(0, 25),
      amostraCcus: Object.entries(por((t) => String(t.codccu))).sort((a, b) => b[1].n - a[1].n).slice(0, 15),
      emissaoMaisAntiga: ab.reduce((m, t) => (t.dataEmissao < m ? t.dataEmissao : m), new Date()).toISOString().slice(0, 10),
    });
  }
  const q = sp.get("q") ?? "";
  const usuarios = await prisma.user.findMany({
    where: { name: { contains: q, mode: "insensitive" } },
    select: { id: true, name: true, email: true, role: true, active: true, nivelHierarquico: true, cargo: true, verTodosCustos: true, nucleo: { select: { name: true } }, teams: { select: { role: true, team: { select: { name: true } } } }, acessosCentroCusto: { select: { codccu: true } } },
    take: 15,
  });
  return NextResponse.json({ q, usuarios: usuarios.map((u) => ({ ...u, nucleo: u.nucleo?.name ?? null, teams: u.teams.map((t) => `${t.team.name} (${t.role})`), acessosCentroCusto: u.acessosCentroCusto.map((a) => a.codccu) })) });
}

export async function POST(req: Request) {
  if (!autorizado(req)) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  if (body?.confirmar !== true || typeof body.userId !== "string") return NextResponse.json({ error: 'Envie {"confirmar": true, "userId": "..."}' }, { status: 400 });
  const user = await prisma.user.findUnique({ where: { id: body.userId }, select: { id: true, name: true, email: true, active: true } });
  if (!user) return NextResponse.json({ error: "Usuário não encontrado. Nada foi alterado." }, { status: 404 });
  const centros = await centrosAmbientais();
  const adm = await prisma.user.findUnique({ where: { email: "admin@consominas.com.br" }, select: { id: true } });
  if (!user.active) await prisma.user.update({ where: { id: user.id }, data: { active: true } });
  const r = await prisma.acessoCentroCusto.createMany({ data: centros.map((c) => ({ userId: user.id, codccu: c.codccu, concedidoPor: adm?.id ?? null })), skipDuplicates: true });
  const total = await prisma.acessoCentroCusto.count({ where: { userId: user.id } });
  return NextResponse.json({ ok: true, usuario: `${user.name} <${user.email}>`, centrosConsiderados: centros.length, novosAcessos: r.count, acessosTotais: total, centros });
}
