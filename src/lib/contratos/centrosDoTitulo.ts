// A que centro(s) de custo e linha(s) de custo pertence um titulo do Senior. Sem estimar nada; ordem de confianca:
//   1. rateio do titulo no Senior (E501RAT: entrada ou previsao) -- diz o CC, a linha de custo e a proporcao entre eles
//   2. CC gravado no proprio titulo (E501TCP.CODCCU)
//   3. CC da ordem de compra vinculada (so' quando a OC tem UM centro de custo; OC rateada entre varios nao e' atribuida)
// Quando o rateio reparte o titulo entre varios CCs, o valor de cada um e' a proporcao do rateio do Senior aplicada ao valor do titulo.

export type OrigemCentro = "rateio" | "titulo" | "oc";
export type LinhaCentro = { ccu: string; ctaFin: string | null; proporcao: number; origem: OrigemCentro };
export type ResultadoCentros = { linhas: LinhaCentro[]; semCentro: "oc-rateada" | null };

export type EntradaCentros = {
  codccuTitulo: string | null;
  rateio: ReadonlyArray<{ codccu: string; ctaFin: string; valor: number }>;
  oc: { codccu: string | null; temRateio: boolean; ctaFin?: string | null } | null;
};

export function centrosDoTitulo(e: EntradaCentros): ResultadoCentros {
  // 1) rateio do Senior: soma por (CC, linha de custo) e vira proporcao
  const soma = new Map<string, { ccu: string; ctaFin: string; valor: number }>();
  for (const r of e.rateio) {
    if (!(r.valor > 0)) continue; // so' as linhas positivas descrevem a distribuicao; estornos nao entram na proporcao
    const k = `${r.codccu}|${r.ctaFin}`;
    const atual = soma.get(k);
    if (atual) atual.valor += r.valor;
    else soma.set(k, { ccu: r.codccu, ctaFin: r.ctaFin, valor: r.valor });
  }
  const total = [...soma.values()].reduce((s, x) => s + x.valor, 0);
  if (total > 0) {
    return { linhas: [...soma.values()].map((x) => ({ ccu: x.ccu, ctaFin: x.ctaFin || null, proporcao: x.valor / total, origem: "rateio" as const })), semCentro: null };
  }
  // 2) CC do proprio titulo
  if (e.codccuTitulo) return { linhas: [{ ccu: e.codccuTitulo, ctaFin: null, proporcao: 1, origem: "titulo" }], semCentro: null };
  // 3) CC da OC vinculada
  if (e.oc) {
    if (e.oc.temRateio) return { linhas: [], semCentro: "oc-rateada" };
    if (e.oc.codccu) return { linhas: [{ ccu: e.oc.codccu, ctaFin: e.oc.ctaFin ?? null, proporcao: 1, origem: "oc" }], semCentro: null };
  }
  return { linhas: [], semCentro: null };
}

/** Reparte um valor pelas proporcoes, em centavos, sem perder nem criar nenhum centavo (o resto vai para a maior fatia). */
export function repartirValor(valor: number, proporcoes: ReadonlyArray<number>): number[] {
  if (proporcoes.length === 0) return [];
  const centavos = Math.round(valor * 100);
  const partes = proporcoes.map((p) => Math.round(centavos * p));
  const resto = centavos - partes.reduce((s, x) => s + x, 0);
  if (resto !== 0) {
    let iMax = 0;
    proporcoes.forEach((p, i) => { if (p > proporcoes[iMax]) iMax = i; });
    partes[iMax] += resto;
  }
  return partes.map((c) => c / 100);
}
