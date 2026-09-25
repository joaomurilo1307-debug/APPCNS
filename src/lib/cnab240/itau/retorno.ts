// Leitor do arquivo de retorno CNAB240 SISPAG (Itau). So' extrai o que a
// integracao precisa pra fechar o ciclo de um pagamento: status (ocorrencia),
// "Nosso Numero" atribuido pelo banco, data/valor efetivo, e o "Seu Numero"
// que devolve a linha pro RemessaItemPagamento correspondente (ver Nota 43
// do manual -- e' o unico campo que a empresa controla e que volta identico
// no retorno).

import { descricaoOcorrencia } from "./constantes";
import { fatia, fatiaCrua, fatiaData, fatiaValor } from "./campos";
import type { ArquivoRetornoLido, ItemRetorno, OcorrenciaRetorno } from "./tipos";

function lerOcorrencias(linha: string): OcorrenciaRetorno[] {
  // Posicoes 231-240 (10 digitos/letras), ate 5 pares de 2 caracteres cada
  // (Nota 8). Pares em branco ou "00000000..." nao contam.
  const bruto = fatiaCrua(linha, 231, 240);
  const codigos: OcorrenciaRetorno[] = [];
  for (let i = 0; i < 10; i += 2) {
    const par = bruto.slice(i, i + 2).trim();
    if (!par) continue; // slot nao usado (brancos)
    codigos.push({ codigo: par, descricao: descricaoOcorrencia(par) });
  }
  return codigos;
}

function lerSegmentoA(linha: string): ItemRetorno {
  return {
    segmento: "A",
    referenciaEmpresa: fatia(linha, 74, 93),
    nossoNumero: fatia(linha, 135, 149) || null,
    dataEfetiva: fatiaData(linha, 155, 162),
    valorEfetivo: fatiaValor(linha, 163, 177, 2) || null,
    ocorrencias: lerOcorrencias(linha),
  };
}

function lerSegmentoJ(linha: string): ItemRetorno {
  return {
    segmento: "J",
    referenciaEmpresa: fatia(linha, 183, 202),
    nossoNumero: fatia(linha, 216, 230) || null,
    dataEfetiva: fatiaData(linha, 145, 152), // "DATA PAGAMENTO" no segmento J faz esse papel
    valorEfetivo: fatiaValor(linha, 153, 167, 2) || null,
    ocorrencias: lerOcorrencias(linha),
  };
}

/**
 * Le um arquivo de retorno inteiro. Ignora registros que nao sejam
 * Segmento A/J de detalhe (header/trailer de arquivo e de lote, e outros
 * segmentos fora do escopo desta integracao -- ver docs/integracao-itau.md).
 */
export function lerArquivoRetorno(conteudo: string): ArquivoRetornoLido {
  const linhas = conteudo.split(/\r\n|\r|\n/).filter((l) => l.trim().length > 0);
  if (linhas.length === 0) throw new Error("Arquivo de retorno vazio.");

  const header = linhas[0];
  if (fatia(header, 8, 8) !== "0") {
    throw new Error("Arquivo nao comeca com um Header de Arquivo (posicao 8 deveria ser '0').");
  }
  const codigoBanco = fatia(header, 1, 3);
  const dataGeracao = fatiaData(header, 144, 151);

  const itens: ItemRetorno[] = [];
  for (const linha of linhas) {
    if (linha.length < 240) continue; // linhas curtas/corrompidas sao ignoradas, nao derrubam o parse inteiro
    const tipoRegistro = fatia(linha, 8, 8);
    if (tipoRegistro !== "3") continue; // so' registros de detalhe
    const segmento = fatia(linha, 14, 14);
    if (segmento === "A") itens.push(lerSegmentoA(linha));
    else if (segmento === "J") itens.push(lerSegmentoJ(linha));
    // demais segmentos (B, C, J-52, N, O, W, Z...) ficam fora do escopo.
  }

  return { codigoBanco, dataGeracao, itens, totalRegistrosLote: itens.length };
}
