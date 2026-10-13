// Leitura do PIX "copia e cola" (BR Code, padrao EMV-MPM do Banco Central --
// Manual de Padroes para Iniciacao do Pix) pro Segmento J-52 PIX (forma 47).
// O manual SISPAG (Nota 41) pede: QR dinamico -> URL sem "https://"; QR
// estatico -> a chave Pix. Nota 38: TXID opcional. O CRC16 (tag 63) e'
// conferido pra recusar codigo colado pela metade.

export type PixQrCodeLido = {
  chaveOuUrl: string; // ate 77 posicoes (J-52 PIX 132-208)
  txid: string; // ate 32 posicoes (J-52 PIX 209-240)
  valor: number | null; // tag 54, quando o QR traz valor
  nomeRecebedor: string; // tag 59
  dinamico: boolean;
};

function lerTlv(texto: string): Map<string, string> {
  const campos = new Map<string, string>();
  let i = 0;
  while (i < texto.length) {
    const id = texto.slice(i, i + 2);
    const tamanho = Number(texto.slice(i + 2, i + 4));
    if (!/^\d{2}$/.test(id) || !Number.isInteger(tamanho) || i + 4 + tamanho > texto.length) throw new Error("PIX copia e cola mal formado.");
    campos.set(id, texto.slice(i + 4, i + 4 + tamanho));
    i += 4 + tamanho;
  }
  return campos;
}

// CRC16-CCITT (polinomio 0x1021, inicial 0xFFFF), sobre o texto ate "6304" inclusive.
function crc16(texto: string): string {
  let crc = 0xffff;
  for (const byte of new TextEncoder().encode(texto)) {
    crc ^= byte << 8;
    for (let b = 0; b < 8; b++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

export function lerPixCopiaECola(codigo: string): PixQrCodeLido {
  const texto = (codigo ?? "").trim();
  if (!texto.startsWith("000201")) throw new Error("PIX copia e cola invalido: deve comecar com 000201.");
  if (!/6304[0-9A-Fa-f]{4}$/.test(texto) || crc16(texto.slice(0, -4)) !== texto.slice(-4).toUpperCase()) {
    throw new Error("PIX copia e cola com CRC invalido (codigo incompleto ou alterado). Copie de novo do QR Code.");
  }
  const raiz = lerTlv(texto);
  const conta = raiz.get("26");
  if (!conta) throw new Error("PIX copia e cola sem os dados do recebedor (campo 26).");
  const dadosConta = lerTlv(conta);
  if ((dadosConta.get("00") ?? "").toLowerCase() !== "br.gov.bcb.pix") throw new Error("QR Code nao e' de PIX (GUI diferente de br.gov.bcb.pix).");
  const url = dadosConta.get("25");
  const chave = dadosConta.get("01");
  const chaveOuUrl = url ? url.replace(/^https?:\/\//i, "") : chave ?? "";
  if (!chaveOuUrl) throw new Error("PIX copia e cola sem chave nem URL de pagamento.");
  if (chaveOuUrl.length > 77) throw new Error("Chave/URL do PIX passa de 77 caracteres -- nao cabe no Segmento J-52 PIX.");
  const adicionais = raiz.get("62");
  const txidBruto = adicionais ? lerTlv(adicionais).get("05") ?? "" : "";
  const valor = raiz.get("54");
  return {
    chaveOuUrl,
    txid: txidBruto === "***" ? "" : txidBruto.slice(0, 32),
    valor: valor ? Number(valor) : null,
    nomeRecebedor: raiz.get("59") ?? "",
    dinamico: !!url,
  };
}
