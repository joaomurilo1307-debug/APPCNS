// Normalizacao de nome para exibicao (Title Case, conectivos minusculos)
// e para comparacao/match (sem acento, upper, espacos colapsados).

const CONECTIVOS = new Set(["de", "da", "do", "das", "dos", "e"]);
const DIACRITICOS = /[̀-ͯ]/g;

export function normalizarNome(bruto: string): string {
  const limpo = bruto.trim().replace(/\s+/g, " ").toLowerCase();
  if (!limpo) return "";
  return limpo
    .split(" ")
    .map((p, i) => (i > 0 && CONECTIVOS.has(p) ? p : p.charAt(0).toUpperCase() + p.slice(1)))
    .join(" ");
}

export function chaveNome(bruto: string): string {
  return bruto
    .normalize("NFD")
    .replace(DIACRITICOS, "")
    .toUpperCase()
    .replace(/[^A-Z\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
