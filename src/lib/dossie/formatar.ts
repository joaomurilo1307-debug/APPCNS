// Formatadores do HTML do dossie (so' o que complemento.ts e danfe.ts usam; o gerador do fluxo tem os seus).

export const esc = (v: unknown): string =>
  String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

export const moeda = (n: number): string => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
export const quantidade = (n: number): string => n.toLocaleString("pt-BR", { maximumFractionDigits: 4 });
export const percentual = (n: number): string => `${n.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`;

/** A Senior devolve o CNPJ/CPF como numero (sem zeros a esquerda): 12 a 14 digitos = CNPJ; ate 11 = CPF; vazio ou 0 = "-". */
export function cnpjCpf(v: string | undefined): string {
  const d = String(v ?? "").replace(/\D/g, "");
  if (!d || /^0+$/.test(d)) return "-";
  if (d.length > 11) {
    const c = d.padStart(14, "0");
    return `${c.slice(0, 2)}.${c.slice(2, 5)}.${c.slice(5, 8)}/${c.slice(8, 12)}-${c.slice(12)}`;
  }
  const c = d.padStart(11, "0");
  return `${c.slice(0, 3)}.${c.slice(3, 6)}.${c.slice(6, 9)}-${c.slice(9)}`;
}

/** "dd/mm/aaaa" da Senior; 31/12/1900 (vazio da Senior) -> "-". */
export function dataBr(v: string | undefined): string {
  const m = /^(\d{2}\/\d{2}\/)(\d{4})/.exec((v ?? "").trim());
  return !m || m[2] <= "1900" ? "-" : `${m[1]}${m[2]}`;
}

/** Chave de NF-e em blocos de 4 digitos. */
export const chaveEmBlocos = (v: string | undefined): string => String(v ?? "").replace(/\D/g, "").replace(/(\d{4})(?=\d)/g, "$1 ").trim();
