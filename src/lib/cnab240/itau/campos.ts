// Helpers de formatacao de campo fixo do layout CNAB240 SISPAG (Itau, versao
// 086). Todo registro tem exatamente 240 bytes; cada campo e' alfanumerico
// (X, alinhado a esquerda, brancos a direita) ou numerico (9, alinhado a
// direita, zeros a esquerda) -- ver "Cap. 3 - Layout do arquivo" do manual.

/** Campo alfanumerico (picture X(n)): trunca/preenche pra caber, sem acento. */
export function alfa(valor: string | null | undefined, tamanho: number): string {
  const semAcento = (valor ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase();
  return semAcento.slice(0, tamanho).padEnd(tamanho, " ");
}

/** Campo numerico (picture 9(n)): zeros a esquerda. Rejeita numero negativo. */
export function numero(valor: number | string, tamanho: number): string {
  const texto = String(valor).replace(/\D/g, "");
  if (texto.length > tamanho) throw new Error(`Campo numerico estourou ${tamanho} posicoes: "${valor}"`);
  return texto.padStart(tamanho, "0");
}

/**
 * Campo numerico com virgula assumida (picture 9(intLen)V9(decLen)) -- ex.
 * "876,54" em 9(5)V9(2) vira "0087654" (Cap. 3, pag. 10 do manual).
 */
export function valorMonetario(valor: number, intLen: number, decLen: number): string {
  const centavos = Math.round(valor * 10 ** decLen);
  if (centavos < 0) throw new Error(`Valor monetario negativo nao suportado: ${valor}`);
  return numero(centavos, intLen + decLen);
}

/** Campo de brancos/zeros de preenchimento. */
export function brancos(tamanho: number): string {
  return "".padEnd(tamanho, " ");
}

export function zeros(tamanho: number): string {
  return "".padStart(tamanho, "0");
}

/** Data no formato DDMMAAAA usado em todo o layout. */
export function dataDDMMAAAA(data: Date): string {
  const dd = String(data.getUTCDate()).padStart(2, "0");
  const mm = String(data.getUTCMonth() + 1).padStart(2, "0");
  const aaaa = String(data.getUTCFullYear());
  return `${dd}${mm}${aaaa}`;
}

export function horaHHMMSS(data: Date): string {
  const hh = String(data.getUTCHours()).padStart(2, "0");
  const mm = String(data.getUTCMinutes()).padStart(2, "0");
  const ss = String(data.getUTCSeconds()).padStart(2, "0");
  return `${hh}${mm}${ss}`;
}

/** Monta um registro de 240 posicoes a partir de segmentos {texto, tamanho}, validando o total. */
export function montarRegistro(campos: string[]): string {
  const registro = campos.join("");
  if (registro.length !== 240) {
    throw new Error(`Registro CNAB240 com tamanho invalido: ${registro.length} (esperado 240)`);
  }
  return registro;
}

/** Le uma fatia fixa de uma linha (posicoes 1-based, inclusive, como no manual) e devolve sem os espacos. */
export function fatia(linha: string, deInclusive1based: number, ateInclusive1based: number): string {
  return linha.slice(deInclusive1based - 1, ateInclusive1based).trim();
}

export function fatiaCrua(linha: string, deInclusive1based: number, ateInclusive1based: number): string {
  return linha.slice(deInclusive1based - 1, ateInclusive1based);
}

/** Le um campo numerico com virgula assumida de dentro de uma linha do retorno. */
export function fatiaValor(linha: string, deInclusive1based: number, ateInclusive1based: number, decLen: number): number {
  const bruto = fatiaCrua(linha, deInclusive1based, ateInclusive1based).replace(/\D/g, "");
  const numeroInt = bruto === "" ? 0 : parseInt(bruto, 10);
  return numeroInt / 10 ** decLen;
}

/** Le uma data DDMMAAAA de dentro de uma linha do retorno; null se zerada/vazia. */
export function fatiaData(linha: string, deInclusive1based: number, ateInclusive1based: number): Date | null {
  const bruto = fatiaCrua(linha, deInclusive1based, ateInclusive1based);
  if (!/^\d{8}$/.test(bruto) || bruto === "00000000") return null;
  const dd = Number(bruto.slice(0, 2));
  const mm = Number(bruto.slice(2, 4));
  const aaaa = Number(bruto.slice(4, 8));
  if (dd === 0 || mm === 0) return null;
  return new Date(Date.UTC(aaaa, mm - 1, dd));
}
