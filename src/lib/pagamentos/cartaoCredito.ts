// Codigo 20 confirmado no catalogo E066FPG da empresa 1 deste tenant.
// As variantes Cielo/Redecard sao reconhecidas pela descricao, sem incluir debito/POS.
export function ehCartaoCredito(codFpg: string | null | undefined, descricao?: string | null): boolean {
  const texto = (descricao ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  if (texto.trim()) return /\bcartao\b/.test(texto) && /\bcredito\b/.test(texto);
  return Number(codFpg) === 20;
}
