// Desempate quando (numTit, codFor) tem mais de UM registro real em
// TituloContasAPagar -- achado real na auditoria sistêmica pedida pelo
// João 15/09/2026 ("não podemos ter contradições, não é corrigir
// pontual"): 2 de 4.311 títulos únicos no rateio têm 2 candidatos (ex.
// numTit "006627" existe como tipo COF de R$78.536,42 E como tipo IRF de
// R$2.505,10 -- um pegar o errado por acaso já é contradição o
// suficiente pra um diretor ver e desconfiar do sistema inteiro).
//
// Regra: o valor original do título verdadeiro nunca pode ser MENOR que
// a fatia rateada que estamos exibindo (rateio é sempre uma partição do
// total, nunca maior que ele) -- isso já elimina candidatos impossíveis
// sem ambiguidade. Entre os que sobram, o mais próximo do valor rateado
// é o mais provável. Só cai no fallback (mais recente) se nenhum
// candidato bater essa regra -- não deveria acontecer nos dados reais,
// mas não trava a tela se acontecer.
export type CandidatoTitulo<T> = T & { valorOriginal: number; dataEmissao: Date };

export function escolherTituloReal<T>(candidatos: CandidatoTitulo<T>[], valorRateadoDeReferencia: number): CandidatoTitulo<T> | null {
  if (candidatos.length === 0) return null;
  if (candidatos.length === 1) return candidatos[0];

  const compativeis = candidatos.filter((c) => c.valorOriginal >= valorRateadoDeReferencia - 0.02);
  const pool = compativeis.length > 0 ? compativeis : candidatos;

  return pool.reduce((melhor, atual) =>
    Math.abs(atual.valorOriginal - valorRateadoDeReferencia) < Math.abs(melhor.valorOriginal - valorRateadoDeReferencia) ? atual : melhor
  );
}
