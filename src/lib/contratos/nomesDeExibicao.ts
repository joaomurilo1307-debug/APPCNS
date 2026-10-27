// Nome que o sistema mostra para alguns centros de custo, no lugar da descricao do cadastro do Senior (E044CCU).
//   210: o 3686 e o 3687 sao analisados juntos, no mesmo centro de custo (no Senior ele se chama "MRN CT 3686/2023");
//   230: so' o 3687 LT (no Senior ele se chama "MRN CT 3687/2023").
// Tabela da Denise, confirmada pela diretoria em 28/10/2026. So' muda o rotulo: custo, medicao e P0 continuam por codigo de centro de custo.
// O Senior nao e' alterado; as telas que mostram o que esta no Senior (aprovacao de OC, programacao de pagamento) seguem com o nome de la.

export const NOMES_DE_EXIBICAO: Readonly<Record<string, string>> = {
  "210": "MRN CT 3686 + 3687",
  "230": "MRN CT 3687 LT",
};

/** Como o Senior chamava cada um desses centros: so' o nome ainda igual a este e' trocado no banco (um nome que o administrador ja mudou fica como esta). */
export const NOMES_ANTIGOS_DO_SENIOR: Readonly<Record<string, string>> = {
  "210": "MRN CT 3686/2023",
  "230": "MRN CT 3687/2023",
};

/** O nome a mostrar: o de exibicao, se o centro tiver um; senao o que veio do Senior/banco. */
export function nomeDeExibicao(codccu: string, nomeAtual?: string | null): string | null {
  return NOMES_DE_EXIBICAO[codccu] ?? nomeAtual ?? null;
}

/** Tira o "CCU - " do comeco, como o sistema ja faz com o nome gravado nos custos. */
export const semPrefixoCcu = (codccu: string, nome: string) => nome.replace(new RegExp(`^${codccu}\\s*-\\s*`), "").trim();

/** O nome gravado ainda e' o do Senior (com ou sem o "CCU - " na frente)? Entao pode ser trocado pelo de exibicao. */
export function podeTrocarNome(codccu: string, nomeGravado: string): boolean {
  const antigo = NOMES_ANTIGOS_DO_SENIOR[codccu];
  return !!antigo && semPrefixoCcu(codccu, nomeGravado) === antigo;
}

/** O mesmo formato do nome gravado (com ou sem o "CCU - " na frente), agora com o nome de exibicao. */
export function nomeGravadoNovo(codccu: string, nomeGravado: string): string {
  const novo = NOMES_DE_EXIBICAO[codccu];
  return new RegExp(`^${codccu}\\s*-\\s*`).test(nomeGravado) ? `${codccu} - ${novo}` : novo;
}
