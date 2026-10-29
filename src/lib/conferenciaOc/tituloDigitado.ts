// Conferencia de OC: a OC so' conta como "ja tem titulo" quando o numero que o comprador digitou na OC (USU_NUMTIT, texto livre) existe de verdade
// entre os titulos do mesmo fornecedor. Antes, qualquer texto digitado tirava a OC da tela: em 29/10/2026 a OC 16239 (R$ 8.000, vence 30/10)
// tinha "43=1" digitado, o titulo 43=1 nao existia no Senior e a OC sumiu da Conferencia, sem ninguem poder agir.
// Mesma leitura do motor de vinculo (variantesReferencia/prefixoParcela): varios numeros no mesmo campo, caixa, zeros a esquerda e parcela ("2072" casa "2072$01").

import { normalizarReferencia, prefixoParcela, variantesReferencia } from "../vinculoOcTitulo";

const semZerosAEsquerda = (v: string) => (/^\d+$/.test(v) ? v.replace(/^0+(?=\d)/, "") : v);

/** PURA: algum dos titulos do fornecedor (numeros de titulo) e' um dos numeros digitados na OC? Quem digitou varios numeros basta casar um. */
export function tituloDigitadoExiste(digitado: string | null | undefined, numerosDosTitulos: Iterable<string>): boolean {
  const alvos = new Set(variantesReferencia(digitado).map(semZerosAEsquerda));
  if (!alvos.size) return false;
  for (const numero of numerosDosTitulos) {
    const n = normalizarReferencia(numero);
    if (!n) continue;
    if (alvos.has(n) || alvos.has(semZerosAEsquerda(n))) return true;
    const base = prefixoParcela(n);
    if (base && (alvos.has(base) || alvos.has(semZerosAEsquerda(base)))) return true;
  }
  return false;
}
