// Versao do CONTEUDO do dossie. Mudou o que o PDF mostra (secao nova, fonte de dados diferente)? Troque a data: a geracao
// automatica (automatico.ts) refaz, aos poucos, os dossies da janela que foram gerados numa versao anterior.
//   2026-11-11: historico = 3 ultimos pagamentos; rateio como fatia do item; coluna Reembolsavel; fatura de locacao.
export const VERSAO_DOSSIE = "2026-11-11";

/** Assinatura gravada pela geracao manual (botao): nao tem o estado da OC, so' a versao do conteudo. */
export const assinaturaManual = () => `${VERSAO_DOSSIE}:manual`;

/** "2026-11-11:abc..." -> "2026-11-11". Assinatura antiga (sem versao) ou vazia -> null. */
export function versaoDaAssinatura(assinatura: string | null | undefined): string | null {
  const i = (assinatura ?? "").indexOf(":");
  return i > 0 ? assinatura!.slice(0, i) : null;
}
