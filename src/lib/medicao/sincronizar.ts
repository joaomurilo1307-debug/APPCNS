// Atualizacao da Medicao direto do Senior, em SEGUNDO PLANO (mesmo desenho da atualizacao do custo): le contratos de venda, linhas, itens de pedido,
// cabecalho e rateio dos pedidos e, a parte, o faturamento (NF e ND, faturamento.ts); monta tudo (montagem.ts) e regrava as tabelas inteiras. So' LE o Senior. Se a leitura falhar ou vier vazia/muito
// menor, NADA e' trocado. As consultas passam pela fila unica do app (consultarSenior): nunca em paralelo com a leitura do custo.

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { consultarSenior } from "@/lib/senior/getDbInfo";
import { montarMedicao, type EntradaMedicao, type Linha, type ResultadoMedicao } from "./montagem";
import { ccuDosContratosSemPedido, montarFaturamento, type DocFaturamento, type EntradaFaturamento } from "./faturamento";
import { reatribuirNotasPorValor } from "./reatribuicao";

export type EntradaCompleta = EntradaMedicao & { faturamento: EntradaFaturamento | null; faturamentoErro: string | null };

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
export async function lerMedicaoDoSenior(progresso: (etapa: string, pct: number) => void | Promise<void> = () => {}, c: Consulta = consultar): Promise<EntradaCompleta> {
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

  // ---- faturamento (NF e ND). Se esta parte falhar, a medicao segue e o faturamento ja gravado fica como estava (o erro vai no resumo).
  let faturamento: EntradaFaturamento | null = null, faturamentoErro: string | null = null;
  try {
    await progresso("Lendo as notas fiscais de serviço (E140NFV)", 82);
    const notas = await comRetentativa("notas fiscais (E140NFV)", () => c("SELECT CODFIL, CODSNF, NUMNFV, DATEMI, CODCLI, VLRBSE, VLRLIQ, SITNFV FROM E140NFV WHERE SITNFV IN ('1','2')", 5 * MINUTO));
    await progresso("Lendo os itens das notas (E140ISV)", 84);
    const itensNota = await comRetentativa("itens das notas (E140ISV)", () => c("SELECT CODFIL, CODSNF, NUMNFV, NUMPED, CODCCU, VLRBRU FROM E140ISV", 5 * MINUTO));
    await progresso("Lendo os títulos das notas e as notas de débito (E301TCR)", 86);
    const titulos = await comRetentativa("titulos a receber (E301TCR)", () => c("SELECT NUMTIT, CODFIL, CODTPT, CODCLI, SITTIT, DATEMI, VLRORI, CODCCU, FILNFV, CODSNF, NUMNFV FROM E301TCR WHERE NUMNFV<>0 OR CODTPT='ND'", 5 * MINUTO));
    const nums = [...new Set(titulos.map((t) => t.NUMTIT.trim()).filter(Boolean))];
    const rateiosFat: Linha[] = [];
    const gt = lotes(nums, 250);
    for (let i = 0; i < gt.length; i++) {
      await progresso(`Lendo o centro de custo das notas (${i + 1}/${gt.length})`, 87 + Math.round(((i + 1) / gt.length) * 3));
      rateiosFat.push(...(await comRetentativa("rateio dos titulos (E301RAT)", () => c(`SELECT NUMTIT, CODFIL, CODCCU, PERRAT, VLRRAT FROM E301RAT WHERE NUMTIT IN (${gt[i].map((t) => `'${t.replace(/'/g, "''")}'`).join(",")})`, 3 * MINUTO))));
    }
    if (notas.length === 0) throw new Error("O Senior não devolveu nenhuma nota fiscal de serviço");
    faturamento = { notas, itensNota, titulos, rateios: rateiosFat };
  } catch (e) {
    faturamentoErro = e instanceof Error ? e.message : String(e);
  }
  return { contratos, linhas, itens, pedidos, rateios, faturamento, faturamentoErro };
}

/** Regrava as tres tabelas (substituicao total e atomica). Nao grava se o resultado vier vazio ou muito menor que o ja gravado. */
export async function gravarMedicao(db: typeof prisma, r: ResultadoMedicao, docs: DocFaturamento[] | null = null) {
  if (r.contratos.length === 0) throw new Error("A montagem não gerou nenhum contrato — nada foi alterado.");
  const antes = await db.medicaoContrato.count();
  if (antes > 5 && r.contratos.length < antes * 0.5) throw new Error(`A leitura gerou ${r.contratos.length} contratos contra ${antes} já gravados (menos da metade) — suspeita de leitura incompleta, nada foi alterado.`);
  const itensAntes = await db.medicaoItem.count();
  if (itensAntes > 200 && r.itens.length < itensAntes * 0.5) throw new Error(`A leitura gerou ${r.itens.length} itens contra ${itensAntes} já gravados (menos da metade) — nada foi alterado.`);
  const d = (s: string | null) => (s ? new Date(`${s}T00:00:00.000Z`) : null);
  // o faturamento so' substitui o ja gravado se vier completo (nao vazio e nao menos da metade)
  const docsAntes = docs ? await db.faturamentoMedicao.count() : 0;
  const trocarDocs = !!docs && docs.length > 0 && (docsAntes <= 20 || docs.length >= docsAntes * 0.5);
  await db.$transaction(
    async (tx) => {
      if (trocarDocs && docs) {
        await tx.faturamentoMedicao.deleteMany({});
        for (let i = 0; i < docs.length; i += 1000) await tx.faturamentoMedicao.createMany({ data: docs.slice(i, i + 1000).map((x) => ({ ...x, dataEmissao: new Date(`${x.dataEmissao}T00:00:00.000Z`) })), skipDuplicates: true });
      }
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
    const base = entrada.faturamento ? montarFaturamento(entrada.faturamento, r.itens, r.contratos) : null;
    const semPedido = base ? ccuDosContratosSemPedido(r.contratos, base) : []; // contrato sem pedido: centro de custo pelo codigo do cliente das notas
    const reat = base ? reatribuirNotasPorValor(base, r.itens, r.contratos) : null;
    const docs = reat ? reat.docs : null;
    await marcar(id, "Gravando", 92);
    await gravarMedicao(prisma, r, docs);
    const faturamento = docs ? { documentos: docs.length, notas: docs.filter((x) => x.tipo === "NF").length, notasDebito: docs.filter((x) => x.tipo === "ND").length, semCentroDeCusto: docs.filter((x) => !x.codccu).length, mesDoPedido: docs.filter((x) => x.origem === "PEDIDO").length, mesPelaEmissao: docs.filter((x) => x.origem === "EMISSAO").length, acumulados: docs.filter((x) => x.origem === "ACUMULADO").length, notasLevadasParaOContratoDoPedido: reat ? reat.reatribuidas.length : 0, contratosSemPedidoComCentroDeCusto: semPedido, exemplosLevadas: reat ? reat.reatribuidas.slice(0, 12).map((x) => `${x.tipo} ${x.numero} R$ ${x.valor}: CC ${x.deCcu} -> ${x.paraCcu} (pedido ${x.pedido})`) : [] } : null;
    const resumo = { ...r.resumo, contratos: r.contratos.length, faturamento, faturamentoErro: entrada.faturamentoErro, duracaoSegundos: Math.round((Date.now() - inicio) / 1000) };
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
