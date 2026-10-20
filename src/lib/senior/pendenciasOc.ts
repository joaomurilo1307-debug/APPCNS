// Regras da Conferencia de OC: valor exibido e pendencias (alerta vermelho). Funcoes puras.

/**
 * Valor da OC na grade. VLRLIQ do cabecalho e' o saldo em aberto: zera quando a OC e' recebida ou
 * cancelada. Nesse caso usa o total original dos itens (E420IPO.VLRORI) e, sem itens, a soma do rateio.
 */
export function valorTotalOc(vlrLiq: number, totalItens: number | null, totalRateio: number | null): number {
  if (vlrLiq > 0) return vlrLiq;
  if (totalItens && totalItens > 0) return totalItens;
  if (totalRateio && totalRateio > 0) return totalRateio;
  return 0;
}

export type DadosPendencia = {
  sitApr: string;
  numTit: string | null;
  nfs: string[];
  rateioTotal: number | null; // null = nao deu para conferir na Senior (nao acusa)
};

/** OC cancelada nao tem o que pendurar; as demais acusam cada pendencia. */
export function pendenciasOc(o: DadosPendencia): string[] {
  if (o.sitApr === "CAN") return [];
  const p: string[] = [];
  if (o.sitApr !== "APR") p.push("não aprovada");
  if (!o.numTit) p.push("sem título");
  if (!o.nfs.length) p.push("sem NF");
  if (o.rateioTotal !== null && o.rateioTotal <= 0) p.push("rateio zerado");
  return p;
}
