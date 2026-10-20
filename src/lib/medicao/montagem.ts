// Monta, a partir das linhas cruas do Senior, o que o modulo de Medicao guarda e mostra. So' calculo (sem banco e sem Senior).
//   contratado  = E160CVS (QTDCVS, VLRTOT)            medido acumulado = soma dos itens dos pedidos (E120ISP) = E160CVS (QTDFAT, VLRFAT)
//   valor de cada item: ver valorDoItem (o Senior ZERA o valor do item depois que o pedido e' faturado)
//   saldo       = contratado - medido                  mes de cada medicao = boletim do PEDCLI, ou emissao menos 1 mes (ver competencia.ts)
//   centro de custo de cada item = rateio do pedido (E120RAT); o do contrato = o de maior valor entre os itens. Nunca por nome.

import { competenciaDoPedido } from "./competencia";

export type Linha = Record<string, string>;

export type EntradaMedicao = {
  contratos: Linha[]; // E160CTR: NUMCTR, NUMOFI, CODCLI, DATINI
  linhas: Linha[]; // E160CVS: NUMCTR, SEQCVS, CODSER, CPLCVS, UNIMED, QTDCVS, PREUNI, VLRTOT, QTDFAT, VLRFAT
  itens: Linha[]; // E120ISP: CODFIL, NUMPED, SEQISP, CTRCVS, SEQCTR, SITISP, QTDPED, QTDCAN, PREUNI, VLRBRU, PEDCLI
  pedidos: Linha[]; // E120PED: CODFIL, NUMPED, DATEMI, SITPED
  rateios: Linha[]; // E120RAT: CODFIL, NUMPED, SEQISP, CODCCU, VLRRAT
};

export const numero = (t: string | undefined | null): number => {
  const s = String(t ?? "").trim();
  if (!s) return 0;
  const n = Number(s.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
};
const texto = (t: string | undefined | null) => String(t ?? "").trim();
const arred = (v: number) => Math.round(v * 100) / 100;
const dataIso = (br: string | undefined): string | null => {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(texto(br));
  return m && m[3] !== "1900" ? `${m[3]}-${m[2]}-${m[1]}` : null;
};

export type ContratoMedicao = { numCtr: string; numOfi: string; codCli: string | null; inicio: string | null; codccu: string | null; codccusItens: string | null; valorContratado: number; valorMedido: number };
export type LinhaMedicao = { numCtr: string; seqCvs: number; codSer: string | null; descricao: string; unidade: string | null; qtdContratada: number; precoUnit: number; valorContratado: number; qtdFaturada: number; valorFaturado: number };
export type ItemMedicao = { numCtr: string; seqCvs: number; numPed: string; seqIsp: number; dataEmissao: string; competencia: string; origem: "BOLETIM" | "EMISSAO" | "ACUMULADO"; boletim: string | null; pedCli: string | null; situacao: string | null; qtd: number; valor: number; codccu: string | null };

export type ResultadoMedicao = {
  contratos: ContratoMedicao[];
  linhas: LinhaMedicao[];
  itens: ItemMedicao[];
  resumo: {
    contratosComLinhas: number; contratosSemPedido: number; contratosSemCentroDeCusto: number; linhas: number; itens: number;
    itensPorBoletim: number; itensPorEmissao: number; itensAcumulados: number; itensBoletimInconsistente: number; itensSemLinhaNoCatalogo: number; itensSemData: number;
    itensCancelados: number; itensComValorCalculado: number;
    contratosComMaisDeUmCcu: { numCtr: string; ccus: string }[];
    linhasQueNaoBatem: { numCtr: string; seqCvs: number; qtdSenior: number; qtdPedidos: number; valorSenior: number; valorPedidos: number }[];
    totalLinhasQueNaoBatem: number;
    pedCliSemMes: { numCtr: string; exemplos: string[] }[]; // para ajustar o leitor do boletim contrato a contrato
  };
};

/** Situacao do item do pedido (E120ISP.SITISP), lida dos dados reais do Senior em 19/10/2026 (4.877 itens dos contratos ativos). */
export const SITUACAO_ITEM: Readonly<Record<string, string>> = { "1": "ABERTO", "2": "FATURADO PARCIAL", "4": "FATURADO", "5": "CANCELADO", "8": "ESTORNADO", "9": "ENCERRADO" };

/**
 * Quantidade e valor medidos de um item de pedido. O Senior NAO mantem o VLRBRU em todo item:
 *   1 ABERTO e 9 ENCERRADO: VLRBRU vale (soma dos 3.561 itens fecha com quantidade x preco ao centavo).
 *   4 FATURADO (1.234 itens, todos com VLRBRU = 0), 2 FATURADO PARCIAL: o valor e' zerado ao faturar -> quantidade x preco unitario, que fecha com a
 *      nota ao centavo (pedido 237 = NF 123 = R$ 145.500,49; pedido 140 + 141 = NF 68 + 69 = R$ 182.765,39).
 *   8 ESTORNADO (NF cancelada e item reaberto): o VLRBRU vem em dobro (calculado sobre a quantidade em aberto, que soma a ja faturada) -> quantidade x preco.
 *   5 CANCELADO: nao e' medicao (QTDCAN = QTDPED, VLRBRU = 0).
 * Sem essa regra, 25% dos itens entravam com valor zero e contratos inteiros (SVPM, SUDECAP, AGA, PM Contagem) apareciam sem medicao mes a mes.
 */
export function valorDoItem(it: Linha): { cancelado: boolean; qtd: number; valor: number; calculado: boolean; situacao: string | null } {
  const sit = texto(it.SITISP);
  const situacao = SITUACAO_ITEM[sit] ?? null;
  if (sit === "5") return { cancelado: true, qtd: 0, valor: 0, calculado: false, situacao };
  const qtd = Math.max(0, numero(it.QTDPED) - numero(it.QTDCAN));
  const bruto = numero(it.VLRBRU);
  const porPreco = arred(qtd * numero(it.PREUNI));
  if (sit === "2" || sit === "4" || sit === "8") return { cancelado: false, qtd, valor: porPreco, calculado: true, situacao };
  if (bruto === 0 && porPreco > 0) return { cancelado: false, qtd, valor: porPreco, calculado: true, situacao };
  return { cancelado: false, qtd, valor: bruto, calculado: false, situacao };
}

const chavePedido = (filial: string | undefined, numPed: string | undefined) => `${texto(filial)}|${texto(numPed)}`;

export function montarMedicao(e: EntradaMedicao): ResultadoMedicao {
  // ---- linhas contratadas (so' contratos com alguma linha de valor: os aditivos/TACs sao contratos vazios no Senior)
  const linhasPorCtr = new Map<string, LinhaMedicao[]>();
  for (const l of e.linhas) {
    const numCtr = texto(l.NUMCTR);
    const valor = numero(l.VLRTOT);
    if (!numCtr || valor <= 0) continue; // linha zerada (placeholder de aditivo) nao e' linha de medicao
    const seq = Number(texto(l.SEQCVS));
    if (!Number.isFinite(seq)) continue;
    const lista = linhasPorCtr.get(numCtr) ?? [];
    lista.push({ numCtr, seqCvs: seq, codSer: texto(l.CODSER) || null, descricao: texto(l.CPLCVS) || `Serviço ${texto(l.CODSER)}`, unidade: texto(l.UNIMED) || null, qtdContratada: numero(l.QTDCVS), precoUnit: numero(l.PREUNI), valorContratado: arred(valor), qtdFaturada: numero(l.QTDFAT), valorFaturado: arred(numero(l.VLRFAT)) });
    linhasPorCtr.set(numCtr, lista);
  }
  const ctrPorNum = new Map(e.contratos.map((c) => [texto(c.NUMCTR), c]));
  const numCtrs = [...linhasPorCtr.keys()].filter((n) => ctrPorNum.has(n));

  // ---- centro de custo de cada item (rateio do pedido): o de maior valor
  const ccuDoItem = new Map<string, Map<string, number>>();
  for (const r of e.rateios) {
    const k = `${chavePedido(r.CODFIL, r.NUMPED)}|${texto(r.SEQISP)}`;
    const m = ccuDoItem.get(k) ?? new Map<string, number>();
    m.set(texto(r.CODCCU), (m.get(texto(r.CODCCU)) ?? 0) + numero(r.VLRRAT));
    ccuDoItem.set(k, m);
  }
  const ccuDominante = (k: string): string | null => {
    const m = ccuDoItem.get(k);
    if (!m) return null;
    let melhor: string | null = null, v = -Infinity;
    for (const [c, valor] of m) if (c && valor > v) { melhor = c; v = valor; }
    return melhor;
  };
  const pedidoPorChave = new Map(e.pedidos.map((p) => [chavePedido(p.CODFIL, p.NUMPED), p]));

  // ---- itens por contrato
  const itensPorCtr = new Map<string, Linha[]>();
  for (const it of e.itens) {
    const n = texto(it.CTRCVS);
    if (!linhasPorCtr.has(n)) continue;
    const l = itensPorCtr.get(n) ?? [];
    l.push(it);
    itensPorCtr.set(n, l);
  }

  // ---- centro de custo dominante do contrato (por valor dos itens)
  const ccuDoContrato = new Map<string, { principal: string | null; todos: string[] }>();
  for (const n of numCtrs) {
    const porCcu = new Map<string, number>();
    for (const it of itensPorCtr.get(n) ?? []) {
      const c = ccuDominante(`${chavePedido(it.CODFIL, it.NUMPED)}|${texto(it.SEQISP)}`);
      if (c) porCcu.set(c, (porCcu.get(c) ?? 0) + valorDoItem(it).valor);
    }
    const ordenados = [...porCcu.entries()].sort((a, b) => b[1] - a[1]);
    ccuDoContrato.set(n, { principal: ordenados[0]?.[0] ?? null, todos: ordenados.map(([c]) => c) });
  }

  const contratos: ContratoMedicao[] = [];
  const linhas: LinhaMedicao[] = [];
  const itens: ItemMedicao[] = [];
  const resumo: ResultadoMedicao["resumo"] = {
    contratosComLinhas: numCtrs.length, contratosSemPedido: 0, contratosSemCentroDeCusto: 0, linhas: 0, itens: 0, itensPorBoletim: 0, itensPorEmissao: 0, itensAcumulados: 0, itensBoletimInconsistente: 0, itensSemLinhaNoCatalogo: 0, itensSemData: 0,
    itensCancelados: 0, itensComValorCalculado: 0, contratosComMaisDeUmCcu: [], linhasQueNaoBatem: [], totalLinhasQueNaoBatem: 0, pedCliSemMes: [],
  };

  for (const n of numCtrs) {
    const c = ctrPorNum.get(n)!;
    const ls = linhasPorCtr.get(n)!.sort((a, b) => a.seqCvs - b.seqCvs);
    const cc = ccuDoContrato.get(n)!;
    const seqNoCatalogo = new Set(ls.map((l) => l.seqCvs));
    const somaQtd = new Map<number, number>(), somaVal = new Map<number, number>();
    const semMes = new Set<string>();
    let temItem = false;

    for (const it of itensPorCtr.get(n) ?? []) {
      const seq = Number(texto(it.SEQCTR));
      if (!seqNoCatalogo.has(seq)) { resumo.itensSemLinhaNoCatalogo += 1; continue; }
      const v = valorDoItem(it);
      if (v.cancelado) { resumo.itensCancelados += 1; continue; } // item cancelado nao e' medicao e nao entra no faturado do Senior
      if (v.calculado) resumo.itensComValorCalculado += 1;
      const ped = pedidoPorChave.get(chavePedido(it.CODFIL, it.NUMPED));
      const emissao = dataIso(ped?.DATEMI);
      const qtd = v.qtd, valor = v.valor;
      // o acumulado do Senior (QTDFAT/VLRFAT) conta todo item do pedido; a conferencia usa o mesmo criterio
      somaQtd.set(seq, (somaQtd.get(seq) ?? 0) + qtd);
      somaVal.set(seq, (somaVal.get(seq) ?? 0) + valor);
      if (!emissao) { resumo.itensSemData += 1; continue; }
      const comp = competenciaDoPedido({ pedCli: it.PEDCLI, dataEmissao: emissao, ccu: cc.principal });
      if (!comp) { resumo.itensSemData += 1; continue; }
      if (comp.origem === "BOLETIM") resumo.itensPorBoletim += 1; else if (comp.origem === "ACUMULADO") resumo.itensAcumulados += 1; else { resumo.itensPorEmissao += 1; if (texto(it.PEDCLI)) semMes.add(texto(it.PEDCLI)); }
      if (comp.inconsistente) resumo.itensBoletimInconsistente += 1;
      temItem = true;
      itens.push({ numCtr: n, seqCvs: seq, numPed: texto(it.NUMPED), seqIsp: Number(texto(it.SEQISP)) || 0, dataEmissao: emissao, competencia: comp.competencia, origem: comp.origem, boletim: comp.boletim, pedCli: texto(it.PEDCLI) || null, situacao: v.situacao ?? (texto(ped?.SITPED) || null), qtd, valor: arred(valor), codccu: ccuDominante(`${chavePedido(it.CODFIL, it.NUMPED)}|${texto(it.SEQISP)}`) });
    }

    let valorMedido = 0;
    for (const l of ls) {
      linhas.push(l);
      valorMedido += l.valorFaturado;
      const qp = somaQtd.get(l.seqCvs) ?? 0, vp = somaVal.get(l.seqCvs) ?? 0;
      if (Math.abs(qp - l.qtdFaturada) > 0.001 || Math.abs(vp - l.valorFaturado) > 0.05) {
        resumo.totalLinhasQueNaoBatem += 1;
        if (resumo.linhasQueNaoBatem.length < 25) resumo.linhasQueNaoBatem.push({ numCtr: n, seqCvs: l.seqCvs, qtdSenior: l.qtdFaturada, qtdPedidos: Math.round(qp * 1000) / 1000, valorSenior: l.valorFaturado, valorPedidos: arred(vp) });
      }
    }
    if (!temItem) resumo.contratosSemPedido += 1;
    if (!cc.principal) resumo.contratosSemCentroDeCusto += 1;
    if (cc.todos.length > 1) resumo.contratosComMaisDeUmCcu.push({ numCtr: n, ccus: cc.todos.join(",") });
    if (semMes.size) resumo.pedCliSemMes.push({ numCtr: n, exemplos: [...semMes].slice(0, 4) });

    contratos.push({ numCtr: n, numOfi: texto(c.NUMOFI), codCli: texto(c.CODCLI) || null, inicio: dataIso(c.DATINI), codccu: cc.principal, codccusItens: cc.todos.length ? cc.todos.join(",") : null, valorContratado: arred(ls.reduce((s, l) => s + l.valorContratado, 0)), valorMedido: arred(valorMedido) });
  }
  resumo.linhas = linhas.length;
  resumo.itens = itens.length;
  resumo.pedCliSemMes = resumo.pedCliSemMes.slice(0, 40);
  return { contratos, linhas, itens, resumo };
}
