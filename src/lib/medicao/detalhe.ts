// Visao de um contrato (so' calculo): cada linha com o contratado, o medido mes a mes, o medido acumulado e o saldo -- em valor e em quantidade --,
// o CONSUMO fisico (quantidade) comparado ao financeiro (valor) e a conferencia de cada linha com o Senior.
//
//   Contratado e saldo = o que o Senior diz na linha do contrato (E160CVS): QTDCVS/VLRTOT e QTDFAT/VLRFAT.
//   Medido mes a mes   = itens dos pedidos (E120ISP). Em varias linhas a soma dos pedidos e' IGUAL ao faturado do Senior; em outras o Senior difere
//   (ajuste feito depois, preco do pedido diferente do contrato). Nada e' escondido: a diferenca aparece em cada linha ("confere" ou "difere").
//   Consumo financeiro = faturado / contratado (valor). Consumo fisico = media do consumo de quantidade de cada linha, ponderada pelo valor contratado
//   (cada linha conta no maximo 100%): mostra o avanco "de verdade" do servico, sem a distorcao de preco.

import { somaMes } from "./competencia";

export type LinhaDoContrato = { seqCvs: number; descricao: string; unidade: string | null; qtdContratada: number; precoUnit: number; valorContratado: number; qtdFaturada: number; valorFaturado: number };
export type ItemDoContrato = { seqCvs: number; numPed: string; seqIsp: number; dataEmissao: string; competencia: string; origem: string; boletim: string | null; pedCli: string | null; situacao: string | null; qtd: number; valor: number; codccu: string | null };

export type Celula = { qtd: number; valor: number };
export type LinhaDetalhe = LinhaDoContrato & {
  saldoQtd: number; saldoValor: number;
  pctValor: number; pctQtd: number; // consumido (0 a 1 ou mais)
  divergenciaPp: number | null; // pctQtd - pctValor em pontos percentuais (so' quando as duas visoes tem consumo)
  antes: Celula; depois: Celula; porMes: Record<string, Celula>;
  medidoQtd: number; medidoValor: number; // soma dos pedidos
  difQtd: number; difValor: number; confere: boolean; // Senior - pedidos
};
export type MesTotal = { mes: string; qtd: number; valor: number; acumuladoValor: number; acumuladoPct: number; acumuladoFisicoPct: number; variacaoPct: number | null; boletins: string[] };

export type Detalhe = {
  meses: string[];
  linhas: LinhaDetalhe[];
  totais: { contratado: number; medido: number; saldo: number; pct: number; antes: number; depois: number; porMes: MesTotal[] };
  consumo: { financeiroPct: number; fisicoPct: number; linhasEsgotadas: number; linhasAcima80: number; linhasSemMedicao: number; linhasAcima100: number; linhasComDivergencia: number };
  conferencia: { linhas: number; conferem: number; naoConferem: number; difValorAbsoluta: number };
  alertas: { mes: string; valor: number; mediaAnterior: number }[];
  drill: { itens: (ItemDoContrato & { linha: string })[]; total: Celula; qtdItens: number; pagina: number; paginas: number } | null;
  semCompetenciaConfiavel: number; // itens cuja competencia veio da emissao e nao do boletim
};

const arred = (v: number) => Math.round(v * 100) / 100;
const arred3 = (v: number) => Math.round(v * 1000) / 1000;
const zero = (): Celula => ({ qtd: 0, valor: 0 });
/** Limite da divergencia (pontos percentuais) entre o consumo por quantidade e por valor de uma linha para chamar atencao. */
export const LIMITE_DIVERGENCIA_PP = 10;

export function mesesDe(de: string, ate: string, maximo = 48): string[] {
  const l: string[] = [];
  for (let m = de; m <= ate && l.length < maximo; m = somaMes(m, 1)) l.push(m);
  return l;
}

export type FiltroDrill = { seqCvs?: number | null; mes?: string | null; pagina?: number; tamanho?: number };

export function montarDetalhe(linhas: LinhaDoContrato[], itens: ItemDoContrato[], de: string, ate: string, mesAtual: string, drill?: FiltroDrill | null): Detalhe {
  const meses = mesesDe(de, ate);
  const porLinha = new Map<number, { base: LinhaDoContrato; antes: Celula; depois: Celula; porMes: Record<string, Celula>; medidoQtd: number; medidoValor: number }>();
  for (const l of linhas) porLinha.set(l.seqCvs, { base: l, antes: zero(), depois: zero(), porMes: {}, medidoQtd: 0, medidoValor: 0 });
  const totalMes = new Map<string, Celula & { boletins: Set<string> }>(meses.map((m) => [m, { qtd: 0, valor: 0, boletins: new Set<string>() }]));
  const qtdPorLinhaMes = new Map<number, Map<string, number>>(); // quantidade medida por linha em cada mes do periodo (para o avanco fisico acumulado)
  let antesTot = 0, depoisTot = 0, semConf = 0;

  for (const i of itens) {
    const l = porLinha.get(i.seqCvs);
    if (!l) continue;
    l.medidoQtd += i.qtd;
    l.medidoValor += i.valor;
    if (i.origem === "EMISSAO") semConf += 1;
    if (i.competencia < de) { l.antes.qtd += i.qtd; l.antes.valor += i.valor; antesTot += i.valor; continue; }
    if (i.competencia > ate) { l.depois.qtd += i.qtd; l.depois.valor += i.valor; depoisTot += i.valor; continue; }
    const c = l.porMes[i.competencia] ?? zero();
    c.qtd += i.qtd; c.valor += i.valor;
    l.porMes[i.competencia] = c;
    const t = totalMes.get(i.competencia)!;
    t.qtd += i.qtd; t.valor += i.valor;
    if (i.boletim) t.boletins.add(i.boletim);
    const mm = qtdPorLinhaMes.get(i.seqCvs) ?? new Map<string, number>();
    mm.set(i.competencia, (mm.get(i.competencia) ?? 0) + i.qtd);
    qtdPorLinhaMes.set(i.seqCvs, mm);
  }

  const fechadas: LinhaDetalhe[] = [...porLinha.values()].map(({ base: l, antes, depois, porMes, medidoQtd, medidoValor }) => {
    const pctValor = l.valorContratado > 0 ? l.valorFaturado / l.valorContratado : 0;
    const pctQtd = l.qtdContratada > 0 ? l.qtdFaturada / l.qtdContratada : 0;
    const difQtd = arred3(l.qtdFaturada - medidoQtd), difValor = arred(l.valorFaturado - medidoValor);
    return {
      ...l,
      saldoQtd: arred3(l.qtdContratada - l.qtdFaturada), saldoValor: arred(l.valorContratado - l.valorFaturado),
      pctValor, pctQtd, divergenciaPp: pctValor > 0 && pctQtd > 0 ? (pctQtd - pctValor) * 100 : null,
      antes: { qtd: arred3(antes.qtd), valor: arred(antes.valor) }, depois: { qtd: arred3(depois.qtd), valor: arred(depois.valor) },
      porMes: Object.fromEntries(Object.entries(porMes).map(([k, v]) => [k, { qtd: arred3(v.qtd), valor: arred(v.valor) }])),
      medidoQtd: arred3(medidoQtd), medidoValor: arred(medidoValor), difQtd, difValor, confere: Math.abs(difQtd) < 0.001 && Math.abs(difValor) < 0.05,
    };
  }).sort((a, b) => a.seqCvs - b.seqCvs);

  const contratado = arred(fechadas.reduce((s, l) => s + l.valorContratado, 0));
  const medido = arred(fechadas.reduce((s, l) => s + l.valorFaturado, 0));

  // consumo fisico = media do consumo de quantidade das linhas, ponderada pelo valor contratado (cada linha conta no maximo 100%)
  const pesoFisico = fechadas.filter((l) => l.qtdContratada > 0 && l.valorContratado > 0);
  const somaPesos = pesoFisico.reduce((s, l) => s + l.valorContratado, 0);
  const fisicoPct = somaPesos > 0 ? pesoFisico.reduce((s, l) => s + Math.min(1, l.qtdFaturada / l.qtdContratada) * l.valorContratado, 0) / somaPesos : 0;

  let acum = arred(antesTot);
  const cumQtd = new Map<number, number>(fechadas.map((l) => [l.seqCvs, l.antes.qtd]));
  const porMes: MesTotal[] = [];
  meses.forEach((m, k) => {
    const t = totalMes.get(m)!;
    acum = arred(acum + t.valor);
    for (const l of fechadas) cumQtd.set(l.seqCvs, (cumQtd.get(l.seqCvs) ?? 0) + (qtdPorLinhaMes.get(l.seqCvs)?.get(m) ?? 0));
    const fisico = somaPesos > 0 ? pesoFisico.reduce((s, l) => s + Math.min(1, (cumQtd.get(l.seqCvs) ?? 0) / l.qtdContratada) * l.valorContratado, 0) / somaPesos : 0;
    const ant = k > 0 ? porMes[k - 1].valor : null;
    porMes.push({ mes: m, qtd: arred3(t.qtd), valor: arred(t.valor), acumuladoValor: acum, acumuladoPct: contratado > 0 ? acum / contratado : 0, acumuladoFisicoPct: fisico, variacaoPct: ant && ant > 0 ? (t.valor - ant) / ant : null, boletins: [...t.boletins].sort((a, b) => Number(a.slice(2)) - Number(b.slice(2))) });
  });

  // alerta: mes fechado (anterior ao atual) com medicao muito abaixo da media dos 3 meses anteriores -- provavel medicao nao lancada no Senior
  const alertas: Detalhe["alertas"] = [];
  porMes.forEach((m, k) => {
    if (m.mes >= mesAtual || k < 3) return;
    const media = (porMes[k - 1].valor + porMes[k - 2].valor + porMes[k - 3].valor) / 3;
    if (media > 1000 && m.valor < media * 0.1) alertas.push({ mes: m.mes, valor: m.valor, mediaAnterior: arred(media) });
  });

  let d: Detalhe["drill"] = null;
  if (drill && (drill.seqCvs != null || drill.mes)) {
    const nomeLinha = new Map(linhas.map((l) => [l.seqCvs, l.descricao]));
    const sel = itens.filter((i) => (drill.seqCvs == null || i.seqCvs === drill.seqCvs) && (!drill.mes || (drill.mes === "antes" ? i.competencia < de : drill.mes === "depois" ? i.competencia > ate : i.competencia === drill.mes)));
    sel.sort((a, b) => b.competencia.localeCompare(a.competencia) || Number(b.numPed) - Number(a.numPed) || a.seqIsp - b.seqIsp);
    const tamanho = drill.tamanho ?? 50;
    const paginas = Math.max(1, Math.ceil(sel.length / tamanho));
    const p = Math.min(Math.max(1, drill.pagina ?? 1), paginas);
    d = { itens: sel.slice((p - 1) * tamanho, p * tamanho).map((i) => ({ ...i, linha: nomeLinha.get(i.seqCvs) ?? `Linha ${i.seqCvs}` })), total: { qtd: arred3(sel.reduce((s, i) => s + i.qtd, 0)), valor: arred(sel.reduce((s, i) => s + i.valor, 0)) }, qtdItens: sel.length, pagina: p, paginas };
  }

  const naoConferem = fechadas.filter((l) => !l.confere);
  return {
    meses, linhas: fechadas,
    totais: { contratado, medido, saldo: arred(contratado - medido), pct: contratado > 0 ? medido / contratado : 0, antes: arred(antesTot), depois: arred(depoisTot), porMes },
    consumo: {
      financeiroPct: contratado > 0 ? medido / contratado : 0, fisicoPct,
      linhasEsgotadas: fechadas.filter((l) => l.qtdContratada > 0 && l.saldoQtd <= 0.0005).length,
      linhasAcima80: fechadas.filter((l) => l.qtdContratada > 0 && l.pctQtd >= 0.8 && l.saldoQtd > 0.0005).length,
      linhasSemMedicao: fechadas.filter((l) => l.qtdFaturada <= 0 && l.valorFaturado <= 0).length,
      linhasAcima100: fechadas.filter((l) => l.qtdContratada > 0 && l.pctQtd > 1.0005).length,
      linhasComDivergencia: fechadas.filter((l) => l.divergenciaPp !== null && Math.abs(l.divergenciaPp) >= LIMITE_DIVERGENCIA_PP).length,
    },
    conferencia: { linhas: fechadas.length, conferem: fechadas.length - naoConferem.length, naoConferem: naoConferem.length, difValorAbsoluta: arred(naoConferem.reduce((s, l) => s + Math.abs(l.difValor), 0)) },
    alertas, drill: d, semCompetenciaConfiavel: semConf,
  };
}
