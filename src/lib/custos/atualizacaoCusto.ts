// Atualizacao do Custo por Contrato direto do Senior. Roda em SEGUNDO PLANO dentro do processo do app (a requisicao
// HTTP so' dispara e responde na hora -- ler o Senior dentro do request estourava o proxy: achado de 30/09/2026).
// Uma por vez (trava em memoria + registro AtualizacaoCusto); as consultas ao Senior passam pela fila unica do app
// (consultarSenior), entao nunca rodam em paralelo.
//
// Seguranca: (1) so' LE o Senior; (2) se a leitura falhar ou vier vazia/absurda, NADA e' gravado; (3) antes da PRIMEIRA
// gravacao tira uma copia das duas tabelas no schema "backup" (fora do alcance do `prisma db push`).

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { consultarSenior } from "@/lib/senior/getDbInfo";
import {
  buscarDadosSenior,
  calcularCusto,
  enriquecerTitulos,
  resolverContasNovas,
  type Consulta,
  type InfoTitulo,
  type ItemCusto,
  type LinhaDetalheCusto,
} from "./motorCustoContrato";

export const TEMPO_MAXIMO_EXECUCAO_MS = 25 * 60_000; // execucao "EXECUTANDO" mais antiga que isso morreu (reinicio do container)
export const INTERVALO_MINIMO_MS = 2 * 60_000; // nao refaz a leitura se acabou de terminar
export const DADOS_VELHOS_APOS_MS = 45 * 60_000; // a tela dispara sozinha quando abre e os dados tem mais que isso

const consultar: Consulta = (sql, timeoutMs) => consultarSenior(sql, timeoutMs ? { timeoutMs } : undefined);

let emExecucao: Promise<void> | null = null;

export type ExecucaoCusto = {
  id: string;
  status: string;
  etapa: string | null;
  progresso: number;
  iniciadoEm: string;
  finalizadoEm: string | null;
  disparadoPor: string | null;
  erro: string | null;
  resumo: unknown;
};

function serializar(e: { id: string; status: string; etapa: string | null; progresso: number; iniciadoEm: Date; finalizadoEm: Date | null; disparadoPor: string | null; erro: string | null; resumo: unknown }): ExecucaoCusto {
  return { ...e, iniciadoEm: e.iniciadoEm.toISOString(), finalizadoEm: e.finalizadoEm?.toISOString() ?? null };
}

export async function estadoAtualizacao() {
  const limite = new Date(Date.now() - TEMPO_MAXIMO_EXECUCAO_MS);
  const [emCurso, ultimaOk, ultimoErro] = await Promise.all([
    prisma.atualizacaoCusto.findFirst({ where: { status: "EXECUTANDO", iniciadoEm: { gt: limite } }, orderBy: { iniciadoEm: "desc" } }),
    prisma.atualizacaoCusto.findFirst({ where: { status: "OK" }, orderBy: { finalizadoEm: "desc" } }),
    prisma.atualizacaoCusto.findFirst({ where: { status: "ERRO" }, orderBy: { finalizadoEm: "desc" } }),
  ]);
  // so' mostra o erro se for mais novo que o ultimo sucesso
  const erroRecente = ultimoErro && (!ultimaOk || (ultimoErro.finalizadoEm ?? ultimoErro.iniciadoEm) > (ultimaOk.finalizadoEm ?? ultimaOk.iniciadoEm)) ? ultimoErro : null;
  return {
    emCurso: emCurso ? serializar(emCurso) : null,
    ultimaOk: ultimaOk ? serializar(ultimaOk) : null,
    ultimoErro: erroRecente ? serializar(erroRecente) : null,
    dadosVelhos: !ultimaOk || Date.now() - (ultimaOk.finalizadoEm ?? ultimaOk.iniciadoEm).getTime() > DADOS_VELHOS_APOS_MS,
  };
}

export async function dispararAtualizacao(disparadoPor: string, opcoes: { forcar?: boolean } = {}): Promise<{ iniciada: boolean; motivo: string; execucao: ExecucaoCusto | null }> {
  const estado = await estadoAtualizacao();
  if (emExecucao || estado.emCurso) return { iniciada: false, motivo: "Já existe uma atualização em andamento.", execucao: estado.emCurso };
  if (!opcoes.forcar && estado.ultimaOk?.finalizadoEm && Date.now() - new Date(estado.ultimaOk.finalizadoEm).getTime() < INTERVALO_MINIMO_MS) {
    return { iniciada: false, motivo: "Os dados acabaram de ser atualizados.", execucao: estado.ultimaOk };
  }
  const criada = await prisma.atualizacaoCusto.create({ data: { status: "EXECUTANDO", etapa: "Iniciando", progresso: 1, disparadoPor } });
  emExecucao = executar(criada.id).finally(() => {
    emExecucao = null;
  });
  return { iniciada: true, motivo: "Atualização iniciada.", execucao: serializar(criada) };
}

async function marcar(id: string, etapa: string, progresso: number) {
  await prisma.atualizacaoCusto.update({ where: { id }, data: { etapa, progresso: Math.min(99, Math.max(1, Math.round(progresso))) } }).catch(() => {});
}

const iso = (d: Date) => d.toISOString().slice(0, 10);
const data = (s: string) => new Date(`${s}T00:00:00.000Z`);

async function criarBackupSePrimeiraVez() {
  const jaTeveOk = await prisma.atualizacaoCusto.count({ where: { status: "OK" } });
  if (jaTeveOk > 0) return false;
  await prisma.$executeRawUnsafe(`CREATE SCHEMA IF NOT EXISTS backup`);
  await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS backup.custo_conta_financeira_pre_senior_direto AS TABLE public."CustoContaFinanceira"`);
  await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS backup.custo_financeiro_detalhe_pre_senior_direto AS TABLE public."CustoFinanceiroDetalhe"`);
  return true;
}

async function executar(id: string) {
  const inicio = Date.now();
  try {
    const dados = await buscarDadosSenior(consultar, (etapa, pct) => marcar(id, etapa, pct));
    const contasNovas = await resolverContasNovas(consultar, dados.rateios);
    await marcar(id, "Calculando o custo de cada contrato", 78);
    const { itens, detalhe, descartadas } = calcularCusto(dados.rateios, dados.baixas);

    // ---- protecao: nunca trocar o que ja esta na tela por um resultado vazio ou muito menor
    const antes = await prisma.custoContaFinanceira.count();
    if (itens.length === 0) throw new Error("O cálculo não gerou nenhuma linha de custo — nada foi alterado.");
    if (antes > 200 && itens.length < antes * 0.5) {
      throw new Error(`O cálculo gerou ${itens.length} linhas contra ${antes} já gravadas (menos da metade) — suspeita de leitura incompleta do Senior, nada foi alterado.`);
    }

    // ---- nomes de contrato: mantem o que ja aparece na tela; CCU novo usa a descricao do Senior
    const nomesAtuais = await prisma.custoContaFinanceira.findMany({ distinct: ["codccu"], select: { codccu: true, contrato: true } });
    const nomePorCcu = new Map(nomesAtuais.map((n) => [n.codccu, n.contrato]));
    const ccusNovos: string[] = [];
    const nomeContrato = (codccu: string) => {
      const atual = nomePorCcu.get(codccu);
      if (atual) return atual;
      const desc = dados.ccus.get(codccu);
      return desc ? `${codccu} - ${desc}` : `CCU ${codccu}`;
    };
    for (const codccu of new Set(itens.map((i) => i.codccu))) if (!nomePorCcu.has(codccu)) ccusNovos.push(codccu);

    // ---- nome do fornecedor e datas por titulo (so' consulta o que ainda nao se sabe)
    await marcar(id, "Completando fornecedor e datas dos títulos", 80);
    const cache = new Map<string, InfoTitulo>();
    const atuais = await prisma.custoFinanceiroDetalhe.findMany({ distinct: ["numTit", "codFor"], select: { numTit: true, codFor: true, fornecedorNome: true, dataEntrada: true, dataVencimento: true } });
    for (const a of atuais) cache.set(`${a.numTit}|${a.codFor}`, { fornecedorNome: a.fornecedorNome, dataEntrada: a.dataEntrada ? iso(a.dataEntrada) : null, dataVencimento: a.dataVencimento ? iso(a.dataVencimento) : null });
    const info = await enriquecerTitulos(consultar, detalhe, cache, (etapa, pct) => marcar(id, etapa, pct));

    // ---- grava
    await marcar(id, "Gravando", 90);
    const backupFeito = await criarBackupSePrimeiraVez();
    const resultadoGravacao = await gravarItens(prisma, itens, nomeContrato);
    await gravarDetalhe(prisma, detalhe, info);

    const totalPorMes: Record<string, number> = {};
    for (const i of itens) totalPorMes[i.competencia.slice(0, 7)] = Math.round(((totalPorMes[i.competencia.slice(0, 7)] ?? 0) + i.valor) * 100) / 100;
    const meses = Object.keys(totalPorMes).sort();
    const resumo = {
      linhas: itens.length,
      titulos: detalhe.length,
      ccusLidos: dados.ccus.size,
      ccusComCusto: new Set(itens.map((i) => i.codccu)).size,
      primeiroMes: meses[0] ?? null,
      ultimoMes: meses[meses.length - 1] ?? null,
      totalPorMes,
      criadas: resultadoGravacao.criadas,
      atualizadas: resultadoGravacao.atualizadas,
      removidas: resultadoGravacao.removidas,
      ccusNovos,
      contasNovas,
      descartadas,
      backupFeito,
      duracaoSegundos: Math.round((Date.now() - inicio) / 1000),
    };
    await prisma.atualizacaoCusto.update({ where: { id }, data: { status: "OK", etapa: "Concluído", progresso: 100, finalizadoEm: new Date(), resumo: resumo as Prisma.InputJsonValue } });
  } catch (e) {
    const mensagem = e instanceof Error ? e.message : String(e);
    await prisma.atualizacaoCusto.update({ where: { id }, data: { status: "ERRO", etapa: "Falhou", finalizadoEm: new Date(), erro: mensagem.slice(0, 1500) } }).catch(() => {});
  }
}

export async function gravarItens(db: typeof prisma, itens: ItemCusto[], nomeContrato: (codccu: string) => string) {
  const times = await db.team.findMany({ where: { codccu: { not: null } }, select: { id: true, codccu: true } });
  const teamPorCcu = new Map(times.map((t) => [t.codccu as string, t.id]));
  const existentes = await db.custoContaFinanceira.findMany({ select: { id: true, codccu: true, contaFinanceira: true, competencia: true, valor: true, contrato: true, teamId: true } });
  const novos = new Map(itens.map((i) => [`${i.codccu}|${i.contaFinanceira}|${i.competencia}`, i]));
  const vistos = new Set<string>();

  const remover: string[] = [];
  const atualizar: { id: string; valor: number; contrato: string; teamId: string | null }[] = [];
  for (const e of existentes) {
    const k = `${e.codccu}|${e.contaFinanceira}|${iso(e.competencia)}`;
    const novo = novos.get(k);
    if (!novo || vistos.has(k)) {
      remover.push(e.id); // some da fonte (ou duplicata)
      continue;
    }
    vistos.add(k);
    const contrato = nomeContrato(e.codccu);
    const teamId = teamPorCcu.get(e.codccu) ?? null;
    if (Math.abs(e.valor - novo.valor) > 0.004 || e.contrato !== contrato || e.teamId !== teamId) atualizar.push({ id: e.id, valor: novo.valor, contrato, teamId });
  }
  const criar = itens
    .filter((i) => !vistos.has(`${i.codccu}|${i.contaFinanceira}|${i.competencia}`))
    .map((i) => ({ codccu: i.codccu, contrato: nomeContrato(i.codccu), contaFinanceira: i.contaFinanceira, competencia: data(i.competencia), valor: i.valor, teamId: teamPorCcu.get(i.codccu) ?? null }));

  await db.$transaction(
    async (tx) => {
      for (let i = 0; i < remover.length; i += 2000) await tx.custoContaFinanceira.deleteMany({ where: { id: { in: remover.slice(i, i + 2000) } } });
      for (const u of atualizar) await tx.custoContaFinanceira.update({ where: { id: u.id }, data: { valor: u.valor, contrato: u.contrato, teamId: u.teamId } });
      for (let i = 0; i < criar.length; i += 2000) await tx.custoContaFinanceira.createMany({ data: criar.slice(i, i + 2000), skipDuplicates: true });
    },
    { timeout: 180_000, maxWait: 30_000 }
  );
  return { criadas: criar.length, atualizadas: atualizar.length, removidas: remover.length };
}

export async function gravarDetalhe(db: typeof prisma, detalhe: LinhaDetalheCusto[], info: Map<string, InfoTitulo>) {
  const linhas = detalhe.map((d) => {
    const i = info.get(`${d.numTit}|${d.codFor}`);
    return {
      codccu: d.codccu,
      contaFinanceira: d.contaFinanceira,
      competencia: data(d.competencia),
      numTit: d.numTit,
      codFor: d.codFor,
      fornecedorNome: i?.fornecedorNome ?? null,
      dataEntrada: i?.dataEntrada ? data(i.dataEntrada) : null,
      dataVencimento: i?.dataVencimento ? data(i.dataVencimento) : null,
      valorRateado: d.valorRateado,
    };
  });
  // substituicao total e atomica (mesma semantica do sync antigo: a fonte e' recalculada inteira)
  await db.$transaction(
    async (tx) => {
      await tx.custoFinanceiroDetalhe.deleteMany({});
      for (let i = 0; i < linhas.length; i += 2000) await tx.custoFinanceiroDetalhe.createMany({ data: linhas.slice(i, i + 2000) });
    },
    { timeout: 180_000, maxWait: 30_000 }
  );
}

/** True quando o Senior direto ja assumiu: os syncs antigos vindos do Rito passam a ser ignorados. */
export async function seniorDiretoAssumiu(): Promise<boolean> {
  return (await prisma.atualizacaoCusto.count({ where: { status: "OK" } })) > 0;
}
