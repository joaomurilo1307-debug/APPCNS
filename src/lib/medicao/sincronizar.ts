// Atualizacao da Medicao direto do Senior, em SEGUNDO PLANO (mesmo desenho da atualizacao do custo): le contratos de venda, linhas, itens de pedido,
// cabecalho e rateio dos pedidos; monta tudo (montagem.ts) e regrava as tabelas inteiras. So' LE o Senior. Se a leitura falhar ou vier vazia/muito
// menor, NADA e' trocado. As consultas passam pela fila unica do app (consultarSenior): nunca em paralelo com a leitura do custo.

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { consultarSenior } from "@/lib/senior/getDbInfo";
import { montarMedicao, type EntradaMedicao, type Linha, type ResultadoMedicao } from "./montagem";

const MINUTO = 60_000;
export const TEMPO_MAXIMO_MS = 25 * MINUTO; // execucao "EXECUTANDO" mais antiga que isso morreu (reinicio do container)
export const INTERVALO_MINIMO_MS = 3 * MINUTO;
export const DADOS_VELHOS_APOS_MS = 6 * 60 * MINUTO; // os pedidos mudam devagar (uma medicao por mes): ler de novo a cada 6 h basta

type Consulta = (sql: string, timeoutMs?: number) => Promise<Linha[]>;
const consultar: Consulta = (sql, timeoutMs) => consultarSenior(sql, timeoutMs ? { timeoutMs } : undefined) as Promise<Linha[]>;

let emExecucao: Promise<void> | null = null;

async function comRetentativa<T>(rotulo: string, fn: () => Promise<T>, tentativas = 3): Promise<T> {
  let ultimo: unknown;
  for (let i = 1; i <= tentativas; i++) {
    try { return await fn(); } catch (e) { ultimo = e; if (i < tentativas) await new Promise((r) => setTimeout(r, 4000 * i)); }
  }
  throw new Error(`${rotulo}: ${ultimo instanceof Error ? ultimo.message : String(ultimo)}`);
}
const lotes = <T,>(l: T[], n: number): T[][] => { const o: T[][] = []; for (let i = 0; i < l.length; i += n) o.push(l.slice(i, i + n)); return o; };
const soNumeros = (l: string[]) => l.filter((x) => /^\d+$/.test(x));

/** Le do Senior tudo que a Medicao precisa (somente SELECT). */
export async function lerMedicaoDoSenior(progresso: (etapa: string, pct: number) => void | Promise<void> = () => {}, c: Consulta = consultar): Promise<EntradaMedicao> {
  await progresso("Lendo os contratos de venda ativos", 3);
  const contratos = await comRetentativa("contratos (E160CTR)", () => c("SELECT NUMCTR, NUMOFI, CODCLI, DATINI FROM E160CTR WHERE SITCTR='A'", 3 * MINUTO));
  if (contratos.length === 0) throw new Error("O Senior não devolveu nenhum contrato de venda ativo (E160CTR) — atualização abortada, nada foi alterado.");
  const nums = soNumeros(contratos.map((x) => x.NUMCTR.trim()));

  const linhas: Linha[] = [];
  const grupos = lotes(nums, 40);
  for (let i = 0; i < grupos.length; i++) {
    await progresso(`Lendo as linhas contratadas (${i + 1}/${grupos.length})`, 6 + Math.round(((i + 1) / grupos.length) * 10));
    linhas.push(...(await comRetentativa("linhas do contrato (E160CVS)", () => c(`SELECT NUMCTR, SEQCVS, CODSER, CPLCVS, UNIMED, QTDCVS, PREUNI, VLRTOT, QTDFAT, VLRFAT FROM E160CVS WHERE NUMCTR IN (${grupos[i].join(",")})`, 3 * MINUTO))));
  }
  const comLinha = [...new Set(linhas.filter((l) => Number(String(l.VLRTOT).replace(/\./g, "").replace(",", ".")) > 0).map((l) => l.NUMCTR.trim()))];
  if (comLinha.length === 0) throw new Error("Nenhuma linha contratada com valor foi lida (E160CVS) — atualização abortada, nada foi alterado.");

  await progresso("Lendo os itens dos pedidos de venda (etapa mais demorada, ~1 a 3 min)", 18);
  const itens = await comRetentativa("itens dos pedidos (E120ISP)", () => c(`SELECT CODFIL, NUMPED, SEQISP, CTRCVS, SEQCTR, SITISP, QTDPED, QTDCAN, PREUNI, VLRBRU, PEDCLI FROM E120ISP WHERE CTRCVS IN (${comLinha.join(",")})`, 10 * MINUTO));

  const peds = soNumeros([...new Set(itens.map((i) => i.NUMPED.trim()))]);
  const pedidos: Linha[] = [], rateios: Linha[] = [];
  const gp = lotes(peds, 400);
  for (let i = 0; i < gp.length; i++) {
    await progresso(`Lendo as datas e o centro de custo dos pedidos (${i + 1}/${gp.length})`, 40 + Math.round(((i + 1) / gp.length) * 40));
    pedidos.push(...(await comRetentativa("pedidos (E120PED)", () => c(`SELECT CODFIL, NUMPED, DATEMI, SITPED FROM E120PED WHERE NUMPED IN (${gp[i].join(",")})`, 3 * MINUTO))));
    rateios.push(...(await comRetentativa("rateio dos pedidos (E120RAT)", () => c(`SELECT CODFIL, NUMPED, SEQISP, CODCCU, VLRRAT FROM E120RAT WHERE NUMPED IN (${gp[i].join(",")})`, 3 * MINUTO))));
  }
  return { contratos, linhas, itens, pedidos, rateios };
}

/** Regrava as tres tabelas (substituicao total e atomica). Nao grava se o resultado vier vazio ou muito menor que o ja gravado. */
export async function gravarMedicao(db: typeof prisma, r: ResultadoMedicao) {
  if (r.contratos.length === 0) throw new Error("A montagem não gerou nenhum contrato — nada foi alterado.");
  const antes = await db.medicaoContrato.count();
  if (antes > 5 && r.contratos.length < antes * 0.5) throw new Error(`A leitura gerou ${r.contratos.length} contratos contra ${antes} já gravados (menos da metade) — suspeita de leitura incompleta, nada foi alterado.`);
  const itensAntes = await db.medicaoItem.count();
  if (itensAntes > 200 && r.itens.length < itensAntes * 0.5) throw new Error(`A leitura gerou ${r.itens.length} itens contra ${itensAntes} já gravados (menos da metade) — nada foi alterado.`);
  const d = (s: string | null) => (s ? new Date(`${s}T00:00:00.000Z`) : null);
  await db.$transaction(
    async (tx) => {
      await tx.medicaoItem.deleteMany({});
      await tx.medicaoLinha.deleteMany({});
      await tx.medicaoContrato.deleteMany({});
      await tx.medicaoContrato.createMany({ data: r.contratos.map((c) => ({ numCtr: c.numCtr, numOfi: c.numOfi, codCli: c.codCli, inicio: d(c.inicio), codccu: c.codccu, codccusItens: c.codccusItens, valorContratado: c.valorContratado, valorMedido: c.valorMedido })) });
      for (let i = 0; i < r.linhas.length; i += 2000) await tx.medicaoLinha.createMany({ data: r.linhas.slice(i, i + 2000) });
      for (let i = 0; i < r.itens.length; i += 2000) await tx.medicaoItem.createMany({ data: r.itens.slice(i, i + 2000).map((x) => ({ ...x, dataEmissao: new Date(`${x.dataEmissao}T00:00:00.000Z`) })) });
    },
    { timeout: 180_000, maxWait: 30_000 }
  );
}

// ---------------------------------------------------------------- estado e disparo (mesmo desenho da atualizacao do custo)
export async function estadoMedicao() {
  const limite = new Date(Date.now() - TEMPO_MAXIMO_MS);
  const [emCurso, ultimaOk, ultimoErro] = await Promise.all([
    prisma.atualizacaoMedicao.findFirst({ where: { status: "EXECUTANDO", iniciadoEm: { gt: limite } }, orderBy: { iniciadoEm: "desc" } }),
    prisma.atualizacaoMedicao.findFirst({ where: { status: "OK" }, orderBy: { finalizadoEm: "desc" } }),
    prisma.atualizacaoMedicao.findFirst({ where: { status: "ERRO" }, orderBy: { finalizadoEm: "desc" } }),
  ]);
  const erroRecente = ultimoErro && (!ultimaOk || (ultimoErro.finalizadoEm ?? ultimoErro.iniciadoEm) > (ultimaOk.finalizadoEm ?? ultimaOk.iniciadoEm)) ? ultimoErro : null;
  return { emCurso, ultimaOk, ultimoErro: erroRecente, dadosVelhos: !ultimaOk || Date.now() - (ultimaOk.finalizadoEm ?? ultimaOk.iniciadoEm).getTime() > DADOS_VELHOS_APOS_MS };
}

async function marcar(id: string, etapa: string, pct: number) {
  await prisma.atualizacaoMedicao.update({ where: { id }, data: { etapa, progresso: Math.min(99, Math.max(1, Math.round(pct))) } }).catch(() => {});
}

async function executar(id: string) {
  const inicio = Date.now();
  try {
    const entrada = await lerMedicaoDoSenior((etapa, pct) => marcar(id, etapa, pct));
    await marcar(id, "Calculando a medição de cada contrato", 85);
    const r = montarMedicao(entrada);
    await marcar(id, "Gravando", 92);
    await gravarMedicao(prisma, r);
    const resumo = { ...r.resumo, contratos: r.contratos.length, duracaoSegundos: Math.round((Date.now() - inicio) / 1000) };
    await prisma.atualizacaoMedicao.update({ where: { id }, data: { status: "OK", etapa: "Concluído", progresso: 100, finalizadoEm: new Date(), resumo: resumo as unknown as Prisma.InputJsonValue } });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await prisma.atualizacaoMedicao.update({ where: { id }, data: { status: "ERRO", etapa: "Falhou", finalizadoEm: new Date(), erro: msg.slice(0, 1500) } }).catch(() => {});
  }
}

export async function dispararMedicao(disparadoPor: string, opcoes: { forcar?: boolean } = {}): Promise<{ iniciada: boolean; motivo: string }> {
  const estado = await estadoMedicao();
  if (emExecucao || estado.emCurso) return { iniciada: false, motivo: "Já existe uma atualização da medição em andamento." };
  if (!opcoes.forcar && estado.ultimaOk?.finalizadoEm && Date.now() - estado.ultimaOk.finalizadoEm.getTime() < INTERVALO_MINIMO_MS) return { iniciada: false, motivo: "Os dados acabaram de ser atualizados." };
  const criada = await prisma.atualizacaoMedicao.create({ data: { status: "EXECUTANDO", etapa: "Iniciando", progresso: 1, disparadoPor } });
  emExecucao = executar(criada.id).finally(() => { emExecucao = null; });
  return { iniciada: true, motivo: "Atualização da medição iniciada." };
}
