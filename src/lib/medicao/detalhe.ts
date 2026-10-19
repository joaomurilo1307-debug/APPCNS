// Visao de um contrato (so' calculo): cada linha com o contratado, o medido mes a mes, o medido acumulado e o saldo -- em valor e em quantidade.
// O "antes do periodo" fecha a conta: contratado - antes - meses do periodo - depois = saldo.

import { somaMes } from "./competencia";

export type LinhaDoContrato = { seqCvs: number; descricao: string; unidade: string | null; qtdContratada: number; precoUnit: number; valorContratado: number; qtdFaturada: number; valorFaturado: number };
export type ItemDoContrato = { seqCvs: number; numPed: string; seqIsp: number; dataEmissao: string; competencia: string; origem: string; boletim: string | null; pedCli: string | null; situacao: string | null; qtd: number; valor: number; codccu: string | null };

export type Celula = { qtd: number; valor: number };
export type LinhaDetalhe = LinhaDoContrato & {
  saldoQtd: number; saldoValor: number; pctValor: number; // consumido (0 a 1+)
  antes: Celula; depois: Celula; porMes: Record<string, Celula>;
  medidoQtd: number; medidoValor: number; // medido acumulado segundo os pedidos (= Senior quando confere)
};
export type MesTotal = { mes: string; qtd: number; valor: number; acumuladoValor: number; acumuladoPct: number; variacaoPct: number | null; boletins: string[] };

export type Detalhe = {
  meses: string[];
  linhas: LinhaDetalhe[];
  totais: { contratado: number; medido: number; saldo: number; pct: number; antes: number; depois: number; porMes: MesTotal[] };
  alertas: { mes: string; valor: number; mediaAnterior: number }[];
  drill: { itens: (ItemDoContrato & { linha: string })[]; total: Celula; qtdItens: number; pagina: number; paginas: number } | null;
  semCompetenciaConfiavel: number; // itens cuja competencia veio da emissao e nao do boletim
};

const arred = (v: number) => Math.round(v * 100) / 100;
const arred3 = (v: number) => Math.round(v * 1000) / 1000;
const zero = (): Celula => ({ qtd: 0, valor: 0 });
export function mesesDe(de: string, ate: string, maximo = 48): string[] {
  const l: string[] = [];
  for (let m = de; m <= ate && l.length < maximo; m = somaMes(m, 1)) l.push(m);
  return l;
}

export type FiltroDrill = { seqCvs?: number | null; mes?: string | null; pagina?: number; tamanho?: number };

export function montarDetalhe(linhas: LinhaDoContrato[], itens: ItemDoContrato[], de: string, ate: string, mesAtual: string, drill?: FiltroDrill | null): Detalhe {
  const meses = mesesDe(de, ate);
  const porLinha = new Map<number, LinhaDetalhe>();
  for (const l of linhas) {
    porLinha.set(l.seqCvs, { ...l, saldoQtd: 0, saldoValor: 0, pctValor: 0, antes: zero(), depois: zero(), porMes: {}, medidoQtd: 0, medidoValor: 0 });
  }
  const totalMes = new Map<string, Celula & { boletins: Set<string> }>(meses.map((m) => [m, { qtd: 0, valor: 0, boletins: new Set<string>() }]));
  let antesTot = 0, depoisTot = 0, semConf = 0;
  for (const i of itens) {
    const l = porLinha.get(i.seqCvs);
    if (!l) continue;
    l.medidoQtd += i.qtd;
    l.medidoValor += i.valor;
    if (i.origem !== "BOLETIM") semConf += 1;
    if (i.competencia < de) { l.antes.qtd += i.qtd; l.antes.valor += i.valor; antesTot += i.valor; continue; }
    if (i.competencia > ate) { l.depois.qtd += i.qtd; l.depois.valor += i.valor; depoisTot += i.valor; continue; }
    const c = l.porMes[i.competencia] ?? zero();
    c.qtd += i.qtd; c.valor += i.valor;
    l.porMes[i.competencia] = c;
    const t = totalMes.get(i.competencia)!;
    t.qtd += i.qtd; t.valor += i.valor;
    if (i.boletim) t.boletins.add(i.boletim);
  }
  const fechadas = [...porLinha.values()].map((l) => {
    // o saldo vale o que o Senior diz (contratado - faturado acumulado); os pedidos fecham com ele
    const medidoValor = arred(l.medidoValor), medidoQtd = arred3(l.medidoQtd);
    return {
      ...l, medidoQtd, medidoValor,
      saldoQtd: arred3(l.qtdContratada - l.qtdFaturada), saldoValor: arred(l.valorContratado - l.valorFaturado),
      pctValor: l.valorContratado > 0 ? l.valorFaturado / l.valorContratado : 0,
      antes: { qtd: arred3(l.antes.qtd), valor: arred(l.antes.valor) }, depois: { qtd: arred3(l.depois.qtd), valor: arred(l.depois.valor) },
      porMes: Object.fromEntries(Object.entries(l.porMes).map(([k, v]) => [k, { qtd: arred3(v.qtd), valor: arred(v.valor) }])),
    };
  }).sort((a, b) => a.seqCvs - b.seqCvs);

  const contratado = arred(fechadas.reduce((s, l) => s + l.valorContratado, 0));
  const medido = arred(fechadas.reduce((s, l) => s + l.valorFaturado, 0));
  let acum = arred(antesTot);
  const porMes: MesTotal[] = [];
  meses.forEach((m, k) => {
    const t = totalMes.get(m)!;
    acum = arred(acum + t.valor);
    const ant = k > 0 ? porMes[k - 1].valor : null;
    porMes.push({ mes: m, qtd: arred3(t.qtd), valor: arred(t.valor), acumuladoValor: acum, acumuladoPct: contratado > 0 ? acum / contratado : 0, variacaoPct: ant && ant > 0 ? (t.valor - ant) / ant : null, boletins: [...t.boletins].sort((a, b) => Number(a.slice(2)) - Number(b.slice(2))) });
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

  return { meses, linhas: fechadas, totais: { contratado, medido, saldo: arred(contratado - medido), pct: contratado > 0 ? medido / contratado : 0, antes: arred(antesTot), depois: arred(depoisTot), porMes }, alertas, drill: d, semCompetenciaConfiavel: semConf };
}
