import { linhaDigitavelParaCodigoBarras } from "../cnab240/itau/codigoBarras";

// A confirmacao pertence a este documento e a este boleto. Uma alteracao em
// qualquer um deles invalida a conferencia, inclusive em rascunhos restaurados.
export function identificacaoBeneficiarioBoleto(documento?: string | null, codigo?: string | null): string | null {
  const doc = (documento ?? "").replace(/\D/g, "");
  if (![11, 14].includes(doc.length)) return null;
  try { return JSON.stringify([doc, linhaDigitavelParaCodigoBarras(codigo ?? "")]); }
  catch { return null; }
}
