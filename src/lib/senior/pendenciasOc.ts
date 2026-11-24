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

/** SITOCP 2 indica atendimento parcial e 4 indica liquidação. */
export function ocAtendida(sitOcp: string | null | undefined): boolean {
  const situacao = sitOcp?.trim();
  return situacao === "2" || situacao === "4";
}

/** Para reconstruir o rateio de uma OC atendida, usa seu valor original antes do saldo. */
export function valorDaOc(oc: { sitOcp: string | null; vlrLiq: number; vlrOri: number }, totalItens: number | null, totalRateio: number | null): number {
  if (ocAtendida(oc.sitOcp) && oc.vlrOri > 0) return oc.vlrOri;
  return valorTotalOc(oc.vlrLiq > 0 ? oc.vlrLiq : oc.vlrOri, totalItens, totalRateio);
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
