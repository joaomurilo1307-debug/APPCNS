// Receita de UM contrato, mes a mes, e conferencia com os pedidos -- so' calculo. Tudo vem do Senior; nada e' digitado ou ajustado a mao.
//   O contrato vale pelos SEUS pedidos (item do pedido -> contrato, E120ISP.CTRCVS), nunca pelo centro de custo do rateio do item: o Senior tem itens de um
//   contrato rateados para o CC de outro (20 itens, R$ 174 mil nos contratos ativos) e isso nao faz o pedido ser do outro contrato.
//   O faturamento (NF e ND) vale pelo centro de custo principal do contrato (rateio do titulo da nota).
//   RECEITA do mes = medicao faturada em nota fiscal + notas de debito (reembolsaveis) + MEDIDO AINDA SEM NOTA. O pedido sem nota conta na receita (foi medido) e vem
//   marcado "sem nota"; a nota sem pedido, ou acima do pedido, tambem conta. Bruta (valor da nota) e liquida (depois das retencoes da nota; so' das notas emitidas).
//   A medicao esta nas LINHAS DOS PEDIDOS; a conferencia compara a soma das linhas dos pedidos do mes com a receita:
//   pedido faturado em NF ou em ND entra uma vez so'; a ND que nao e' pedido ("ND avulsa") soma por cima do pedido.
//   Diferenca = (linhas dos pedidos + ND avulsa) - (NF + ND). Positivo = medido que ainda nao virou nota.
//
// Cada nota e' ligada ao(s) seu(s) pedido(s), do mais firme ao menos firme, e a forma do vinculo fica marcada para ninguem confundir:
//   1. NOTA   : o Senior liga a nota ao pedido (item da nota com o numero do pedido). O mes da nota e' o do pedido.
//   2. VALOR  : sem vinculo no Senior, uma nota e um pedido com o MESMO valor ao centavo (o mais proximo em mes, ate 12 meses).
//   3. SOMA   : a nota e' a soma de 2 a 4 pedidos (ou o pedido e' a soma de 2 a 3 notas) de meses vizinhos, ao centavo.
//   3b. APROXIMADO: pedido e nota NF de valores quase iguais (ate 1% de diferenca, R$ 1.000 ou mais), ate 2 meses de distancia, um para um: e' a mesma medicao
//      (ex.: AMG 26063, pedido de R$ 170.773,59 em agosto e NF de R$ 170.483,63 emitida em outubro). Evita contar a medicao duas vezes (uma como pedido sem nota
//      e outra como nota sem pedido); a diferenca continua a mostra (nota menor: a sobra do pedido fica "sem nota"; nota maior: a nota conta).
//   4. OUTRO CC: pedido sem nota que tem, em OUTRO centro de custo, uma nota do mesmo valor ao centavo -- aviso de possivel rateio trocado no Senior (nunca corrigido aqui).
// Nota ligada por VALOR ou SOMA passa para o mes do pedido (a nota de uma medicao atrasada nao pode cair no mes da emissao); o mes original fica visivel.
// O saldo a faturar do periodo comeca em zero no inicio do periodo escolhido; o saldo desde o primeiro mes medido no Senior vai a parte, porque as primeiras
// cargas do Senior (pedidos de novembro/2024 com o historico acumulado) nao tem nota do mesmo mes. Carga acumulada ("ACUMULADOS") fica fora dos meses.

import { COMPETENCIA_ACUMULADO, somaMes } from "./competencia";
import type { DocFaturamento } from "./faturamento";

export type ItemConc = { numPed: string; competencia: string; origem: string; boletim: string | null; situacao: string | null; qtd: number; valor: number; dataEmissao: string };
export type DocConc = Pick<DocFaturamento, "chave" | "tipo" | "numero" | "filial" | "serie" | "dataEmissao" | "valor" | "valorLiquido" | "valorDoc" | "codccu" | "competencia" | "origem" | "pedidos" | "situacao" | "duplicadaDe" | "vencimento" | "dataPagamento" | "valorAberto">;

/** Recebimento das notas de um mes (titulos no Senior). So' informacao: NAO entra na receita; cada nota conta uma vez, no mes do trabalho, mesmo que o pagamento caia em outro mes. */
export type Recebimento = {
  notas: number; // notas e notas de debito do mes (sem as duplicadas)
  pagas: number; abertas: number; atrasadas: number; semTitulo: number;
  valorAberto: number; // LIQUIDO que o cliente ainda nao pagou (soma dos titulos em aberto)
  valorAtrasado: number; // parte do valorAberto com vencimento antes de hoje
  vencimento: string | null; // o vencimento mais proximo entre as notas em aberto (aaaa-mm-dd)
  ultimoPagamento: string | null; // data do ultimo pagamento das notas do mes (aaaa-mm-dd)
};
const recebimentoVazio = (): Recebimento => ({ notas: 0, pagas: 0, abertas: 0, atrasadas: 0, semTitulo: 0, valorAberto: 0, valorAtrasado: 0, vencimento: null, ultimoPagamento: null });

export type Vinculo = "NOTA" | "VALOR" | "SOMA" | "APROX";
export type MesConc = {
  mes: string;
  medido: number; // soma das linhas dos pedidos do mes
  ndAvulsa: number; // nota de debito sem pedido (ja esta em nd)
  semNota: number; // medido nos pedidos e ainda sem nota (conta na receita, marcado)
  notaAcima: number; // nota sem pedido, ou acima do pedido do mes (ja esta em nf; o pedido fica como esta no Senior)
  receita: number; // receita bruta = nf + nd + semNota
  recebimento: Recebimento; // situacao de pagamento das notas do mes (informativo, fora da receita)
  nf: number; nd: number; faturado: number; // bruto: medicao faturada em NF, notas de debito, soma das notas emitidas
  nfLiquido: number; liquido: number; retencoes: number; // liquido = NF liquida + ND ; retencoes = faturado - liquido
  dif: number; // semNota - notaAcima: positivo = medido sem nota; negativo = nota acima do medido
  saldoAcum: number; saldoDesdeInicio: number; pedidos: number; docs: number;
};
export type DocLigado = { chave: string; tipo: "NF" | "ND"; numero: string; valor: number; competencia: string; como: Vinculo };
export type OutroCc = { chave: string; codccu: string; tipo: "NF" | "ND"; numero: string; valor: number; competencia: string };
export type PedidoConc = { numPed: string; competencia: string; boletins: string[]; situacoes: string[]; itens: number; valor: number; emissao: string; documentos: DocLigado[]; possivelOutroCc: OutroCc | null; diferencaAprox?: number };
export type DocResultado = DocConc & { competenciaOriginal: string; vinculo: Vinculo | null; pedidosLigados: string[] };
export type Conciliacao = {
  inicio: string | null; // primeiro mes medido
  meses: MesConc[];
  antes: { medido: number; receita: number; faturado: number; saldoAcum: number }; // dos meses desde o inicio ate o mes anterior ao periodo
  acumulados: { medido: number; faturado: number }; // cargas acumuladas (fora dos meses)
  notasAntesDoInicio: { qtd: number; valor: number }; // notas de meses anteriores ao primeiro mes medido
  totais: { medido: number; ndAvulsa: number; semNota: number; notaAcima: number; receita: number; nf: number; nd: number; faturado: number; nfLiquido: number; liquido: number; retencoes: number; saldoAcum: number; saldoDesdeInicio: number; mesesComDiferenca: number; pedidosSemNota: number; notasSemPedido: number };
  pedidos: PedidoConc[];
  docs: DocResultado[];
  explicacoes: { mes: string; dif: number; texto: string }[]; // por que cada mes que nao fecha nao fecha, em linguagem de negocio
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

/** itens = itens dos pedidos do contrato; docsDoCc = NF e ND do centro de custo principal; docsOutrosCc = as dos demais centros de custo (so' para o aviso de rateio trocado). */
function acumulaRecebimento(m: Map<string, Recebimento>, d: DocConc, hoje: string) {
  const r = m.get(d.competencia) ?? recebimentoVazio();
  r.notas += 1;
  if (d.valorAberto == null) r.semTitulo += 1;
  else if (d.valorAberto <= TOL) r.pagas += 1;
  else {
    r.abertas += 1; r.valorAberto = arred(r.valorAberto + d.valorAberto);
    if (d.vencimento && d.vencimento < hoje) { r.atrasadas += 1; r.valorAtrasado = arred(r.valorAtrasado + d.valorAberto); }
    if (d.vencimento && (!r.vencimento || d.vencimento < r.vencimento)) r.vencimento = d.vencimento;
  }
  if (d.dataPagamento && (!r.ultimoPagamento || d.dataPagamento > r.ultimoPagamento)) r.ultimoPagamento = d.dataPagamento;
  m.set(d.competencia, r);
}

/** hoje (aaaa-mm-dd) so' serve para marcar o titulo em aberto como vencido. */
export function conciliar(itens: ItemConc[], docsDoCc: DocConc[], docsOutrosCc: DocConc[], de: string, ate: string, hoje: string = new Date().toISOString().slice(0, 10)): Conciliacao {
  const outrosCc = docsOutrosCc.filter((d) => d.codccu && !d.duplicadaDe && d.competencia !== COMPETENCIA_ACUMULADO);

  // ---- pedidos do contrato (um por numero de pedido)
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
  }));
  const pedidoPorNum = new Map(pedidos.map((p) => [p.numPed, p]));

  // ---- 1. vinculo do Senior
  const todos: DocResultado[] = docsDoCc.map((d) => ({ ...d, competenciaOriginal: d.competencia, vinculo: null, pedidosLigados: [] }));
  const docs = todos.filter((d) => !d.duplicadaDe); // nota duplicada nao entra em nenhuma conta (fica so' na lista, marcada)
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
  const maisPerto = (c: string) => (a: { competencia: string }, b: { competencia: string }) => Math.abs(indice(a.competencia) - indice(c)) - Math.abs(indice(b.competencia) - indice(c));

  // ---- 2. mesmo valor
  for (const p of pedLivres().sort((a, b) => a.competencia.localeCompare(b.competencia))) {
    const d = docLivres().filter((x) => Math.abs(x.valor - p.valor) < TOL && Math.abs(indice(x.competencia) - indice(p.competencia)) <= 12).sort(maisPerto(p.competencia))[0];
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
  // ---- 3b. aproximado: a mesma medicao com a nota de valor ligeiramente diferente
  for (const p of pedLivres().sort((a, b) => a.competencia.localeCompare(b.competencia))) {
    if (p.valor < 1000) continue;
    const d = docLivres().filter((x) => x.tipo === "NF" && Math.abs(indice(x.competencia) - indice(p.competencia)) <= 2 && Math.abs(x.valor - p.valor) <= p.valor * 0.01)
      .sort((a, b) => Math.abs(a.valor - p.valor) - Math.abs(b.valor - p.valor) || Math.abs(indice(a.competencia) - indice(p.competencia)) - Math.abs(indice(b.competencia) - indice(p.competencia)))[0];
    if (d) { d.competencia = p.competencia; ligar(d, [p], "APROX"); p.diferencaAprox = arred(p.valor - d.valor); }
  }
  // ---- 4. pedido sem nota que tem nota do mesmo valor em outro centro de custo
  for (const p of pedLivres()) {
    if (p.valor < 1000) continue;
    const o = outrosCc.filter((d) => Math.abs(d.valor - p.valor) < TOL && Math.abs(indice(d.competencia) - indice(p.competencia)) <= 12).sort(maisPerto(p.competencia))[0];
    if (o) p.possivelOutroCc = { chave: o.chave, codccu: o.codccu!, tipo: o.tipo, numero: o.numero, valor: o.valor, competencia: o.competencia };
  }

  // ---- receita mes a mes (com o mes efetivo de cada nota)
  const normais = itens.filter((i) => i.competencia !== COMPETENCIA_ACUMULADO);
  const inicio = normais.length ? normais.map((i) => i.competencia).sort()[0] : null;
  const soma = () => new Map<string, number>();
  const medidoPorMes = soma(), nfPorMes = soma(), nfLiqPorMes = soma(), ndPorMes = soma(), ndAvulsaPorMes = soma(), semNotaPorMes = soma(), nfSemPedidoPorMes = soma();
  const pedidosPorMes = new Map<string, Set<string>>(), docsPorMes = new Map<string, number>();
  const mais = (m: Map<string, number>, k: string, v: number) => m.set(k, (m.get(k) ?? 0) + v);
  for (const i of normais) { mais(medidoPorMes, i.competencia, i.valor); (pedidosPorMes.get(i.competencia) ?? pedidosPorMes.set(i.competencia, new Set()).get(i.competencia)!).add(i.numPed); }
  for (const ped of pedidos) {
    if (ped.documentos.length === 0 && ped.valor > TOL && ped.competencia !== COMPETENCIA_ACUMULADO) mais(semNotaPorMes, ped.competencia, ped.valor); // medido sem nota
    if (ped.diferencaAprox && ped.diferencaAprox > TOL) mais(semNotaPorMes, ped.competencia, ped.diferencaAprox); // sobra do pedido sobre a nota aproximada: medida e sem nota
    if (ped.diferencaAprox && ped.diferencaAprox < -TOL) mais(nfSemPedidoPorMes, ped.competencia, -ped.diferencaAprox); // nota acima do pedido aproximado
  }
  const acumMedido = itens.filter((i) => i.competencia === COMPETENCIA_ACUMULADO).reduce((s, i) => s + i.valor, 0);
  let acumFaturado = 0, antesInicioQtd = 0, antesInicioValor = 0;
  const recPorMes = new Map<string, Recebimento>();
  for (const d of docs) {
    if (d.competencia === COMPETENCIA_ACUMULADO) { acumFaturado += d.valor; continue; }
    if (inicio && d.competencia < inicio) { antesInicioQtd += 1; antesInicioValor += d.valor; continue; }
    if (d.tipo === "NF") { mais(nfPorMes, d.competencia, d.valor); mais(nfLiqPorMes, d.competencia, d.valorLiquido); if (!d.vinculo) mais(nfSemPedidoPorMes, d.competencia, d.valor); }
    else { mais(ndPorMes, d.competencia, d.valor); if (!d.vinculo) mais(ndAvulsaPorMes, d.competencia, d.valor); } // ND que nao e' pedido soma na receita
    docsPorMes.set(d.competencia, (docsPorMes.get(d.competencia) ?? 0) + 1);
    acumulaRecebimento(recPorMes, d, hoje);
  }

  const meses: MesConc[] = [];
  const antes = { medido: 0, receita: 0, faturado: 0, saldoAcum: 0 };
  let saldo = 0, saldoPeriodo = 0, comDif = 0;
  const ultimo = [...medidoPorMes.keys(), ...nfPorMes.keys(), ...ndPorMes.keys(), ate].sort().pop()!;
  for (let m = inicio ?? de; indice(m) <= indice(ultimo); m = somaMes(m, 1)) {
    const med = arred(medidoPorMes.get(m) ?? 0), nf = arred(nfPorMes.get(m) ?? 0), nd = arred(ndPorMes.get(m) ?? 0), avulsa = arred(ndAvulsaPorMes.get(m) ?? 0), nfLiq = arred(nfLiqPorMes.get(m) ?? 0);
    // pedido sem nota e nota sem pedido do mesmo mes cobrem a mesma medicao: o menor dos dois se anula e so' a sobra fica de aviso
    const pedSem = semNotaPorMes.get(m) ?? 0, nfSem = nfSemPedidoPorMes.get(m) ?? 0;
    const semNota = arred(Math.max(0, pedSem - nfSem)), notaAcima = arred(Math.max(0, nfSem - pedSem));
    const faturado = arred(nf + nd), receita = arred(faturado + semNota);
    saldo = arred(saldo + semNota - notaAcima);
    if (m < de) { antes.medido = arred(antes.medido + med); antes.receita = arred(antes.receita + receita); antes.faturado = arred(antes.faturado + faturado); antes.saldoAcum = saldo; continue; }
    if (m > ate) continue;
    const dif = arred(semNota - notaAcima);
    saldoPeriodo = arred(saldoPeriodo + dif);
    if (Math.abs(dif) >= TOL) comDif += 1;
    meses.push({ mes: m, medido: med, ndAvulsa: avulsa, semNota, notaAcima, receita, recebimento: recPorMes.get(m) ?? recebimentoVazio(), nf, nd, faturado, nfLiquido: nfLiq, liquido: arred(nfLiq + nd), retencoes: arred(faturado - nfLiq - nd), dif, saldoAcum: saldoPeriodo, saldoDesdeInicio: saldo, pedidos: pedidosPorMes.get(m)?.size ?? 0, docs: docsPorMes.get(m) ?? 0 });
  }

  const docsPeriodo = docs.filter((d) => (d.competencia >= de && d.competencia <= ate) || d.competencia === COMPETENCIA_ACUMULADO);
  const pedidosPeriodo = pedidos.filter((p) => (p.competencia >= de && p.competencia <= ate) || p.competencia === COMPETENCIA_ACUMULADO);
  const tot = (f: (m: MesConc) => number) => arred(meses.reduce((s, m) => s + f(m), 0));
  const totais = {
    medido: tot((m) => m.medido), ndAvulsa: tot((m) => m.ndAvulsa), semNota: tot((m) => m.semNota), notaAcima: tot((m) => m.notaAcima), receita: tot((m) => m.receita), nf: tot((m) => m.nf), nd: tot((m) => m.nd), faturado: tot((m) => m.faturado), nfLiquido: tot((m) => m.nfLiquido), liquido: tot((m) => m.liquido), retencoes: tot((m) => m.retencoes),
    saldoAcum: saldoPeriodo, saldoDesdeInicio: meses.length ? meses[meses.length - 1].saldoDesdeInicio : antes.saldoAcum, mesesComDiferenca: comDif,
    pedidosSemNota: pedidosPeriodo.filter((p) => p.documentos.length === 0 && p.valor > 0.05 && p.competencia !== COMPETENCIA_ACUMULADO).length,
    notasSemPedido: docsPeriodo.filter((d) => !d.vinculo && d.tipo === "NF" && d.competencia !== COMPETENCIA_ACUMULADO && (!inicio || d.competencia >= inicio)).length,
  };
  // ---- por que cada mes que nao fecha nao fecha (sem mexer em nada: a nota fica na receita e o pedido como esta)
  const moedaBr = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const rot = (d: { tipo: string; numero: string }) => (d.tipo === "ND" && /^ND/i.test(d.numero) ? d.numero : `${d.tipo} ${d.numero}`);
  const explicacoes: Conciliacao["explicacoes"] = [];
  for (const m of meses) {
    if (Math.abs(m.dif) < TOL) continue;
    const aprox = pedidosPeriodo.filter((p) => p.competencia === m.mes && p.diferencaAprox && Math.abs(p.diferencaAprox) > TOL);
    const peds = pedidosPeriodo.filter((p) => p.competencia === m.mes && p.documentos.length === 0 && p.valor > 0.05);
    const notas = docs.filter((d) => d.competencia === m.mes && !d.vinculo && d.tipo === "NF");
    const somaP = arred(peds.reduce((x, p) => x + p.valor, 0)), somaN = arred(notas.reduce((x, d) => x + d.valor, 0));
    const listaN = notas.map((d) => `${rot(d)} (${moedaBr(d.valor)})`).join(", ");
    const listaP = peds.map((p) => `${p.numPed} (${moedaBr(p.valor)})`).join(", ");
    let texto: string;
    const textoAprox = aprox.map((p) => {
      const k = p.documentos[0]; const dif = p.diferencaAprox!;
      return `O pedido ${p.numPed} (${moedaBr(p.valor)}) e a ${rot(k)} (${moedaBr(k.valor)}) são a mesma medição, com ${moedaBr(Math.abs(dif))} de diferença: a nota é ${dif > 0 ? "menor" : "maior"} que o pedido. ${dif > 0 ? "A parte do pedido sem nota conta na receita, marcada como sem nota." : "A nota conta na receita e o pedido fica como está no Senior."}`;
    }).join(" ");
    if (!notas.length && !peds.length && aprox.length) {
      texto = textoAprox;
    } else if (notas.length && peds.length) {
      if (somaP < somaN * 0.05) {
        texto = `A medição deste mês não está lançada nas linhas dos pedidos: as notas somam ${moedaBr(somaN)} e os pedidos só ${moedaBr(somaP)}. As notas contam na receita; falta lançar as linhas da medição no Senior.`;
      } else if (m.dif < 0) {
        const retencao = notas.length === 1 && notas[0].valorDoc > 0 ? Math.round((1 - notas[0].valorLiquido / notas[0].valorDoc) * 10000) / 100 : null;
        texto = `${listaN} ${notas.length > 1 ? "somam" : "é"} ${moedaBr(-m.dif)} a mais que ${peds.length > 1 ? "os pedidos" : "o pedido"} ${listaP}. A nota conta na receita e o pedido continua como está no Senior. ${m.nd > 0 ? "Há nota de débito no mês, já somada à receita. " : "Não há nota de débito no mês. "}${retencao !== null ? `A retenção da nota é de ${retencao.toLocaleString("pt-BR")}%, então a diferença não é imposto. ` : ""}O Senior não mostra de onde vem a diferença: confirme com o financeiro se é item reembolsável ou ajuste que ficou fora do pedido.`;
      } else {
        texto = `${peds.length > 1 ? "Os pedidos" : "O pedido"} ${listaP} ${peds.length > 1 ? "somam" : "é"} ${moedaBr(m.dif)} a mais que as notas do mês. Essa parte foi medida e está sem nota: conta na receita, marcada como sem nota.`;
      }
    } else if (notas.length) {
      texto = `${listaN} ${notas.length > 1 ? "não têm" : "não tem"} pedido de medição no Senior. ${notas.length > 1 ? "As notas contam" : "A nota conta"} na receita; falta lançar as linhas da medição.`;
    } else if (peds.length) {
      texto = `${peds.length > 1 ? "Pedidos" : "Pedido"} ${listaP} ${peds.length > 1 ? "medidos" : "medido"} e ainda sem nota fiscal: ${moedaBr(somaP)} contam na receita, marcados como sem nota.`;
    } else {
      texto = `As linhas dos pedidos (${moedaBr(m.medido)}) e as notas (${moedaBr(m.faturado)}) diferem em ${moedaBr(Math.abs(m.dif))}.`;
    }
    explicacoes.push({ mes: m.mes, dif: m.dif, texto });
  }
  return {
    inicio, meses, antes, acumulados: { medido: arred(acumMedido), faturado: arred(acumFaturado) }, notasAntesDoInicio: { qtd: antesInicioQtd, valor: arred(antesInicioValor) }, totais,
    pedidos: pedidosPeriodo.sort((a, b) => b.competencia.localeCompare(a.competencia) || Number(b.numPed) - Number(a.numPed)),
    docs: [...docsPeriodo, ...todos.filter((d) => d.duplicadaDe)].sort((a, b) => b.competencia.localeCompare(a.competencia) || b.dataEmissao.localeCompare(a.dataEmissao)),
    explicacoes,
  };
}
