// Regras da Conferencia de OC: valor exibido e pendencias (alerta vermelho). Funcoes puras.

/** E420OCP.SITOCP 2 (aberto parcial) e 4 (liquidado): a OC ja' foi atendida, em parte ou no todo, por NF de compra. */
export const ocAtendida = (sitOcp: string | null | undefined) => ["2", "4"].includes((sitOcp ?? "").trim());

/**
 * Valor da OC na grade (23/11/2026). Na Senior, VLRLIQ do cabecalho e' o SALDO em aberto e VLRORI o valor original:
 *  - aberta (SITOCP 1): os dois iguais;
 *  - atendida em parte (2): VLRLIQ so' o que falta receber (OC 16337: 262,50 de 725,50);
 *  - liquidada (4): VLRLIQ zera e o valor fica so' em VLRORI (OC 16778: 0 e 435,60 -- a tela mostrava R$ 0,00);
 *  - nao fechada (9): VLRORI ainda zerado, o valor esta em VLRLIQ.
 * Por isso: atendida -> VLRORI; senao VLRLIQ, VLRORI, total dos itens (produtos E420IPO + servicos E420ISO) e, por ultimo, o rateio.
 */
export function valorDaOc(o: { sitOcp: string | null; vlrLiq: number; vlrOri: number }, totalItens: number | null, totalRateio: number | null): number {
  if (ocAtendida(o.sitOcp) && o.vlrOri > 0) return o.vlrOri;
  if (o.vlrLiq > 0) return o.vlrLiq;
  if (o.vlrOri > 0) return o.vlrOri;
  if (totalItens && totalItens > 0) return totalItens;
  if (totalRateio && totalRateio > 0) return totalRateio;
  return 0;
}

/**
 * Rateio da OC (E420RAT) resumido: quantas linhas, soma de VLRRAT e soma de PERRAT. Quando a OC e' atendida por NF a Senior
 * zera o VLRRAT das linhas e mantem os percentuais -- isso NAO e' rateio zerado (169 OCs com vencimento de out a dez/2026
 * apareciam assim em 23/11/2026, todas com percentual).
 */
export type ResumoRateio = { linhas: number; valor: number; percentual: number };

export function pendenciaRateio(r: ResumoRateio | null): string | null {
  if (!r) return null; // nao deu para conferir na Senior: nao acusa
  if (r.linhas === 0) return "sem rateio";
  if (r.valor <= 0 && r.percentual <= 0) return "rateio zerado";
  return null;
}

export type DadosPendencia = {
  sitApr: string;
  numTit: string | null;
  temTitulo?: boolean; // apurado na Senior (titulosDaOc); sem ele, vale o numero digitado
  nfs: string[];
  rateio: ResumoRateio | null; // null = nao deu para conferir na Senior (nao acusa)
};

/** OC cancelada nao tem o que pendurar; as demais acusam cada pendencia. */
export function pendenciasOc(o: DadosPendencia): string[] {
  if (o.sitApr === "CAN") return [];
  const p: string[] = [];
  if (o.sitApr !== "APR") p.push("não aprovada");
  if (!(o.temTitulo ?? !!o.numTit)) p.push("sem título");
  if (!o.nfs.length) p.push("sem NF");
  const rateio = pendenciaRateio(o.rateio);
  if (rateio) p.push(rateio);
  return p;
}
