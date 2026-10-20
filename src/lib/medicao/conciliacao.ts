// Medicao (pedidos) x Faturamento (NF e ND) de UM centro de custo, mes a mes -- so' calculo. Tudo vem do Senior; nada e' digitado ou ajustado a mao.
//   Medido    = itens dos pedidos do centro de custo, no mes da medicao (boletim; ver competencia.ts).
//   RECEITA   = pedidos de medicao + notas de debito. A ND que nao e' (nem faz parte de) nenhum pedido -- "ND avulsa" -- soma por cima do pedido; a ND que
//               ja e' um pedido (ex.: ND 31/2026 = pedido 482 do MRN 3687) NAO soma de novo.
//   Faturado  = NF + ND do centro de custo, no mes da medicao a que pertencem.
//   Diferenca = receita - faturado. Saldo a faturar = diferenca somada a partir do INICIO DO PERIODO escolhido (comeca em zero); o saldo desde o primeiro mes
//   medido no Senior vai a parte, porque as primeiras cargas do Senior (pedidos de novembro/2024 com o historico acumulado) nao tem nota do mesmo mes.
//   Positivo = receita que ainda nao virou nota.
//   O que nao e' mes (carga acumulada, "ACUMULADOS", "BM01 A BM32") e as notas de antes de o Senior passar a medir ficam fora do saldo e aparecem a parte.
//
// Cada nota e' ligada ao(s) seu(s) pedido(s), em quatro passos, do mais firme ao menos firme, e a forma do vinculo fica marcada para ninguem confundir:
//   1. NOTA   : o Senior liga a nota ao pedido (item da nota com o numero do pedido). O mes da nota e' o do pedido.
//   2. VALOR  : sem vinculo no Senior, uma nota e um pedido do mesmo centro de custo com o MESMO valor ao centavo (o mais proximo em mes, ate 12 meses).
//   3. SOMA   : a nota e' a soma de 2 a 4 pedidos (ou o pedido e' a soma de 2 a 3 notas) de meses vizinhos, ao centavo.
//   4. DIVIDIDO: a nota tem o valor do pedido INTEIRO, mas o pedido esta rateado entre dois ou mais centros de custo (ex.: pedido 308 = R$ 682.345,50 no CC 230 +
//      R$ 10.088,24 no CC 240; a NF 227 de R$ 692.433,74 saiu toda no CC 230). A diferenca fica a mostra: o Senior tem o pedido e a nota rateados de forma diferente.
//   5. OUTRO CC: pedido que ficou sem nota mas tem, em OUTRO centro de custo, uma nota do mesmo valor ao centavo (do pedido ou do pedido inteiro) -- aviso de
//      possivel rateio trocado no Senior (nunca corrigido aqui).
// Nota ligada por VALOR ou SOMA passa para o mes do pedido (a nota de uma medicao atrasada nao pode cair no mes da emissao); o mes original fica visivel.

import { COMPETENCIA_ACUMULADO, somaMes } from "./competencia";
import type { DocFaturamento } from "./faturamento";

export type ItemConc = { numPed: string; competencia: string; origem: string; boletim: string | null; situacao: string | null; qtd: number; valor: number; codccu: string | null; dataEmissao: string };
export type DocConc = Pick<DocFaturamento, "chave" | "tipo" | "numero" | "filial" | "serie" | "dataEmissao" | "valor" | "valorDoc" | "codccu" | "competencia" | "origem" | "pedidos" | "situacao">;

export type Vinculo = "NOTA" | "VALOR" | "SOMA" | "PEDIDO_DIVIDIDO";
export type MesConc = { mes: string; medido: number; ndAvulsa: number; receita: number; nf: number; nd: number; faturado: number; dif: number; saldoAcum: number; saldoDesdeInicio: number; pedidos: number; docs: number };
export type DocLigado = { chave: string; tipo: "NF" | "ND"; numero: string; valor: number; competencia: string; como: Vinculo };
export type OutroCc = { codccu: string; tipo: "NF" | "ND"; numero: string; valor: number; competencia: string };
export type PedidoConc = { numPed: string; competencia: string; boletins: string[]; situacoes: string[]; itens: number; valor: number; emissao: string; documentos: DocLigado[]; possivelOutroCc: OutroCc | null; divisao: { codccu: string; valor: number }[] | null };
export type DocResultado = DocConc & { competenciaOriginal: string; vinculo: Vinculo | null; pedidosLigados: string[] };
export type Conciliacao = {
  inicio: string | null; // primeiro mes medido neste centro de custo
  meses: MesConc[];
  antes: { medido: number; receita: number; faturado: number; saldoAcum: number }; // dos meses desde o inicio ate o mes anterior ao periodo
  acumulados: { medido: number; faturado: number }; // cargas acumuladas (fora dos meses)
  notasAntesDoInicio: { qtd: number; valor: number }; // notas de meses anteriores ao primeiro mes medido no Senior
  totais: { medido: number; ndAvulsa: number; receita: number; faturado: number; saldoAcum: number; saldoDesdeInicio: number; mesesComDiferenca: number; pedidosSemNota: number; notasSemPedido: number };
  pedidos: PedidoConc[];
  docs: DocResultado[];
};

const arred = (v: number) => Math.round(v * 100) / 100 || 0; // "|| 0" evita o -0
const indice = (m: string) => Number(m.slice(0, 4)) * 12 + Number(m.slice(5, 7));
const TOL = 0.05;

function combinacoes<T>(l: T[], k: number): T[][] {
  const r: T[][] = [];
  const f = (ini: number, atual: T[]) => {
    if (atual.length === k) { r.push([...atual]); return; }
    for (let i = ini; i < l.length; i++) { atual.push(l[i]); f(i + 1, atual); atual.pop(); }
  };
  f(0, []);
  return r;
}
const vizinhos = (comps: string[]) => Math.max(...comps.map(indice)) - Math.min(...comps.map(indice)) <= 3;

export function conciliar(itensTodos: ItemConc[], docsTodos: DocConc[], ccu: string, de: string, ate: string): Conciliacao {
  const itens = itensTodos.filter((i) => i.codccu === ccu);
  // valor de cada pedido em todos os centros de custo (o pedido pode estar rateado entre varios)
  const totalPorPedido = new Map<string, { total: number; ccus: Map<string, number> }>();
  for (const i of itensTodos) {
    if (i.competencia === COMPETENCIA_ACUMULADO || !i.codccu) continue;
    const t = totalPorPedido.get(i.numPed) ?? { total: 0, ccus: new Map<string, number>() };
    t.total += i.valor; t.ccus.set(i.codccu, (t.ccus.get(i.codccu) ?? 0) + i.valor);
    totalPorPedido.set(i.numPed, t);
  }
  const docsCcu = docsTodos.filter((d) => d.codccu === ccu);
  const outrosCc = docsTodos.filter((d) => d.codccu && d.codccu !== ccu && d.competencia !== COMPETENCIA_ACUMULADO);

  // ---- pedidos do centro de custo (um por numero de pedido)
  const porPedido = new Map<string, { comp: Map<string, number>; boletins: Set<string>; sit: Set<string>; itens: number; valor: number; emissao: string }>();
  for (const i of itens) {
    const p = porPedido.get(i.numPed) ?? { comp: new Map<string, number>(), boletins: new Set<string>(), sit: new Set<string>(), itens: 0, valor: 0, emissao: i.dataEmissao };
    p.comp.set(i.competencia, (p.comp.get(i.competencia) ?? 0) + Math.abs(i.valor) + 0.01);
    if (i.boletim) p.boletins.add(i.boletim);
    if (i.situacao) p.sit.add(i.situacao);
    p.itens += 1; p.valor += i.valor;
    porPedido.set(i.numPed, p);
  }
  const pedidos: PedidoConc[] = [...porPedido.entries()].map(([numPed, p]) => ({
    numPed, competencia: [...p.comp.entries()].sort((a, b) => b[1] - a[1])[0][0], boletins: [...p.boletins].sort((a, b) => Number(a.slice(2)) - Number(b.slice(2))), situacoes: [...p.sit], itens: p.itens, valor: arred(p.valor), emissao: p.emissao, documentos: [], possivelOutroCc: null,
    divisao: (() => { const t = totalPorPedido.get(numPed); return t && t.ccus.size > 1 ? [...t.ccus.entries()].map(([codccu, valor]) => ({ codccu, valor: arred(valor) })).sort((a, b) => b.valor - a.valor) : null; })(),
  }));
  const pedidoPorNum = new Map(pedidos.map((p) => [p.numPed, p]));

  // ---- 1. vinculo do Senior
  const docs: DocResultado[] = docsCcu.map((d) => ({ ...d, competenciaOriginal: d.competencia, vinculo: null, pedidosLigados: [] }));
  const ligar = (d: DocResultado, ps: PedidoConc[], como: Vinculo) => {
    d.vinculo = como; d.pedidosLigados = ps.map((p) => p.numPed);
    for (const p of ps) p.documentos.push({ chave: d.chave, tipo: d.tipo, numero: d.numero, valor: d.valor, competencia: d.competencia, como });
  };
  for (const d of docs) {
    const ps = (d.pedidos ?? "").split(",").map((x) => pedidoPorNum.get(x)).filter((p): p is PedidoConc => !!p);
    if (ps.length) ligar(d, ps, "NOTA");
  }

  const pedLivres = () => pedidos.filter((p) => p.documentos.length === 0 && p.valor > 0.05 && p.competencia !== COMPETENCIA_ACUMULADO);
  const docLivres = () => docs.filter((d) => !d.vinculo && !(d.pedidos ?? "") && d.competencia !== COMPETENCIA_ACUMULADO);

  // ---- 2. mesmo valor
  for (const p of pedLivres().sort((a, b) => a.competencia.localeCompare(b.competencia))) {
    const d = docLivres().filter((x) => Math.abs(x.valor - p.valor) < TOL && Math.abs(indice(x.competencia) - indice(p.competencia)) <= 12)
      .sort((a, b) => Math.abs(indice(a.competencia) - indice(p.competencia)) - Math.abs(indice(b.competencia) - indice(p.competencia)))[0];
    if (d) { d.competencia = p.competencia; ligar(d, [p], "VALOR"); }
  }
  // ---- 3. soma: nota = soma de pedidos; pedido = soma de notas
  for (const d of docLivres().sort((a, b) => b.valor - a.valor)) {
    const pool = pedLivres().filter((p) => Math.abs(indice(p.competencia) - indice(d.competencia)) <= 12).sort((a, b) => a.competencia.localeCompare(b.competencia)).slice(0, 28);
    let achou: PedidoConc[] | null = null;
    for (const r of [2, 3, 4]) { achou = combinacoes(pool, r).find((c) => Math.abs(c.reduce((s, p) => s + p.valor, 0) - d.valor) < TOL && vizinhos(c.map((p) => p.competencia))) ?? null; if (achou) break; }
    if (achou) { d.competencia = achou.map((p) => p.competencia).sort().pop()!; ligar(d, achou, "SOMA"); }
  }
  for (const p of pedLivres().sort((a, b) => b.valor - a.valor)) {
    const pool = docLivres().filter((d) => Math.abs(indice(d.competencia) - indice(p.competencia)) <= 12).sort((a, b) => a.competencia.localeCompare(b.competencia)).slice(0, 28);
    let achou: DocResultado[] | null = null;
    for (const r of [2, 3]) { achou = combinacoes(pool, r).find((c) => Math.abs(c.reduce((s, d) => s + d.valor, 0) - p.valor) < TOL && vizinhos(c.map((d) => d.competencia))) ?? null; if (achou) break; }
    if (achou) for (const d of achou) { d.competencia = p.competencia; ligar(d, [p], "SOMA"); }
  }
  // ---- 4. nota com o valor do pedido inteiro, e o pedido rateado entre centros de custo
  for (const p of pedLivres()) {
    const t = totalPorPedido.get(p.numPed);
    if (!p.divisao || !t) continue;
    const d = docLivres().filter((x) => Math.abs(x.valor - arred(t.total)) < TOL && Math.abs(indice(x.competencia) - indice(p.competencia)) <= 12)
      .sort((a, b) => Math.abs(indice(a.competencia) - indice(p.competencia)) - Math.abs(indice(b.competencia) - indice(p.competencia)))[0];
    if (d) { d.competencia = p.competencia; ligar(d, [p], "PEDIDO_DIVIDIDO"); }
  }
  // ---- 5. pedido sem nota que tem nota do mesmo valor (do pedido ou do pedido inteiro) em outro centro de custo
  for (const p of pedLivres()) {
    if (p.valor < 1000) continue;
    const alvo = [p.valor, ...(p.divisao ? [arred(totalPorPedido.get(p.numPed)!.total)] : [])];
    const o = outrosCc.filter((d) => alvo.some((v) => Math.abs(d.valor - v) < TOL) && Math.abs(indice(d.competencia) - indice(p.competencia)) <= 12).sort((a, b) => Math.abs(indice(a.competencia) - indice(p.competencia)) - Math.abs(indice(b.competencia) - indice(p.competencia)))[0];
    if (o) p.possivelOutroCc = { codccu: o.codccu!, tipo: o.tipo, numero: o.numero, valor: o.valor, competencia: o.competencia };
  }

  // ---- tabela mes a mes (com o mes efetivo de cada nota)
  const normais = itens.filter((i) => i.competencia !== COMPETENCIA_ACUMULADO);
  const inicio = normais.length ? normais.map((i) => i.competencia).sort()[0] : null;
  const medidoPorMes = new Map<string, number>(), nfPorMes = new Map<string, number>(), ndPorMes = new Map<string, number>(), ndAvulsaPorMes = new Map<string, number>();
  const pedidosPorMes = new Map<string, Set<string>>(), docsPorMes = new Map<string, number>();
  for (const i of normais) { medidoPorMes.set(i.competencia, (medidoPorMes.get(i.competencia) ?? 0) + i.valor); (pedidosPorMes.get(i.competencia) ?? pedidosPorMes.set(i.competencia, new Set()).get(i.competencia)!).add(i.numPed); }
  const acumMedido = itens.filter((i) => i.competencia === COMPETENCIA_ACUMULADO).reduce((s, i) => s + i.valor, 0);
  let acumFaturado = 0, antesInicioQtd = 0, antesInicioValor = 0;
  for (const d of docs) {
    if (d.competencia === COMPETENCIA_ACUMULADO) { acumFaturado += d.valor; continue; }
    if (inicio && d.competencia < inicio) { antesInicioQtd += 1; antesInicioValor += d.valor; continue; }
    const mapa = d.tipo === "NF" ? nfPorMes : ndPorMes;
    mapa.set(d.competencia, (mapa.get(d.competencia) ?? 0) + d.valor);
    if (d.tipo === "ND" && !d.vinculo) ndAvulsaPorMes.set(d.competencia, (ndAvulsaPorMes.get(d.competencia) ?? 0) + d.valor); // ND que nao e' pedido: soma na receita
    docsPorMes.set(d.competencia, (docsPorMes.get(d.competencia) ?? 0) + 1);
  }

  const meses: MesConc[] = [];
  const antes = { medido: 0, receita: 0, faturado: 0, saldoAcum: 0 };
  let saldo = 0, saldoPeriodo = 0, comDif = 0;
  const ultimo = [...medidoPorMes.keys(), ...nfPorMes.keys(), ...ndPorMes.keys(), ate].sort().pop()!;
  for (let m = inicio ?? de; indice(m) <= indice(ultimo); m = somaMes(m, 1)) {
    const med = arred(medidoPorMes.get(m) ?? 0), nf = arred(nfPorMes.get(m) ?? 0), nd = arred(ndPorMes.get(m) ?? 0), avulsa = arred(ndAvulsaPorMes.get(m) ?? 0);
    const receita = arred(med + avulsa);
    saldo = arred(saldo + receita - nf - nd);
    if (m < de) { antes.medido = arred(antes.medido + med); antes.receita = arred(antes.receita + receita); antes.faturado = arred(antes.faturado + nf + nd); antes.saldoAcum = saldo; continue; }
    if (m > ate) continue;
    const dif = arred(receita - nf - nd);
    saldoPeriodo = arred(saldoPeriodo + dif);
    if (Math.abs(dif) >= TOL) comDif += 1;
    meses.push({ mes: m, medido: med, ndAvulsa: avulsa, receita, nf, nd, faturado: arred(nf + nd), dif, saldoAcum: saldoPeriodo, saldoDesdeInicio: saldo, pedidos: pedidosPorMes.get(m)?.size ?? 0, docs: docsPorMes.get(m) ?? 0 });
  }

  const docsPeriodo = docs.filter((d) => (d.competencia >= de && d.competencia <= ate) || d.competencia === COMPETENCIA_ACUMULADO);
  const pedidosPeriodo = pedidos.filter((p) => (p.competencia >= de && p.competencia <= ate) || p.competencia === COMPETENCIA_ACUMULADO);
  const totais = {
    medido: arred(meses.reduce((s, m) => s + m.medido, 0)), ndAvulsa: arred(meses.reduce((s, m) => s + m.ndAvulsa, 0)), receita: arred(meses.reduce((s, m) => s + m.receita, 0)), faturado: arred(meses.reduce((s, m) => s + m.faturado, 0)), saldoAcum: saldoPeriodo, saldoDesdeInicio: meses.length ? meses[meses.length - 1].saldoDesdeInicio : antes.saldoAcum, mesesComDiferenca: comDif,
    pedidosSemNota: pedidosPeriodo.filter((p) => p.documentos.length === 0 && p.valor > 0.05 && p.competencia !== COMPETENCIA_ACUMULADO).length,
    notasSemPedido: docsPeriodo.filter((d) => !d.vinculo && d.competencia !== COMPETENCIA_ACUMULADO && (!inicio || d.competencia >= inicio)).length,
  };
  return {
    inicio, meses, antes, acumulados: { medido: arred(acumMedido), faturado: arred(acumFaturado) }, notasAntesDoInicio: { qtd: antesInicioQtd, valor: arred(antesInicioValor) }, totais,
    pedidos: pedidosPeriodo.sort((a, b) => b.competencia.localeCompare(a.competencia) || Number(b.numPed) - Number(a.numPed)),
    docs: docsPeriodo.sort((a, b) => b.competencia.localeCompare(a.competencia) || b.dataEmissao.localeCompare(a.dataEmissao)),
  };
}
