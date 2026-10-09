// SISPAG v086: valida o arquivo inteiro antes de permitir qualquer gravacao.
import { CODIGO_BANCO_ITAU, descricaoOcorrencia, FORMA_PAGAMENTO } from "./constantes";
import { fatia, fatiaCrua, fatiaData, fatiaValor } from "./campos";
import type { ArquivoRetornoLido, ContaDebito, ItemRetorno, OcorrenciaRetorno } from "./tipos";

export function normalizarRetorno(conteudo: string): string {
  return conteudo.replace(/^\uFEFF/, "").replace(/\r\n|\r/g, "\n").replace(/\n+$/, "").split("\n").join("\r\n") + "\r\n";
}

export function lerOcorrencias(linha: string): OcorrenciaRetorno[] {
  const bruto = fatiaCrua(linha, 231, 240);
  const ocorrencias: OcorrenciaRetorno[] = [];
  for (let i = 0; i < 10; i += 2) {
    const par = bruto.slice(i, i + 2);
    if (!par.trim()) continue;
    if (!/^[A-Z0-9]{2}$/.test(par)) throw new Error("Codigo de ocorrencia invalido nas posicoes 231-240.");
    ocorrencias.push({ codigo: par, descricao: descricaoOcorrencia(par) });
  }
  return ocorrencias;
}

function inteiro(linha: string, de: number, ate: number): number {
  const campo = fatiaCrua(linha, de, ate);
  if (!/^\d+$/.test(campo)) throw new Error(`Totalizador/codigo invalido nas posicoes ${de}-${ate}.`);
  return Number(campo);
}

function contaDoHeader(linha: string): ContaDebito {
  return {
    cnpj: fatia(linha, 19, 32), agencia: fatia(linha, 53, 57),
    conta: fatia(linha, 59, 70), dac: fatia(linha, 72, 72), nomeEmpresa: fatia(linha, 73, 102),
  };
}

export function lerArquivoRetorno(conteudo: string): ArquivoRetornoLido {
  if (!conteudo.trim()) throw new Error("Arquivo de retorno vazio.");
  const linhas = normalizarRetorno(conteudo).split("\r\n").slice(0, -1);
  for (const [i, linha] of linhas.entries()) {
    if (linha.length !== 240 || /[^\x20-\x7E]/.test(linha)) {
      throw new Error(`Registro ${i + 1} invalido: esperado 240 bytes de texto CNAB, recebido ${linha.length} caracteres.`);
    }
    if (fatia(linha, 1, 3) !== CODIGO_BANCO_ITAU) throw new Error(`Registro ${i + 1}: banco diferente do Itau (341).`);
  }
  const header = linhas[0];
  if (fatia(header, 4, 8) !== "00000") throw new Error("Arquivo nao comeca com Header de Arquivo CNAB240.");
  if (fatia(header, 143, 143) !== "2") throw new Error("Arquivo informado e remessa; importe o retorno emitido pelo Itau (codigo 2).");
  const dataGeracao = fatiaData(header, 144, 151);
  if (!dataGeracao) throw new Error("Retorno sem data de geracao.");
  const trailer = linhas[linhas.length - 1];
  if (fatia(trailer, 4, 8) !== "99999") throw new Error("Retorno incompleto: Trailer de Arquivo ausente.");
  if (inteiro(trailer, 24, 29) !== linhas.length) throw new Error("Quantidade de registros do arquivo diverge do trailer.");

  const itens: ItemRetorno[] = [];
  const lotes = new Set<string>();
  let lote: { codigo: string; inicio: number; forma: string; conta: ContaDebito; itens: ItemRetorno[] } | null = null;
  const chavesDetalhe = new Set<string>();
  const porSequencia = new Map<string, ItemRetorno>();
  for (let i = 1; i < linhas.length - 1; i++) {
    const linha = linhas[i];
    const tipo = fatia(linha, 8, 8);
    const codigo = fatia(linha, 4, 7);
    if (tipo === "1") {
      if (lote || lotes.has(codigo) || inteiro(linha, 4, 7) === 0 || codigo === "9999") throw new Error(`Header de lote invalido no registro ${i + 1}.`);
      lotes.add(codigo);
      const forma = fatia(linha, 12, 13);
      if (forma !== "11" && !Object.values(FORMA_PAGAMENTO).includes(forma as any)) throw new Error(`Forma ${forma} fora do escopo desta integracao; conferir o retorno manualmente.`);
      lote = { codigo, inicio: i, forma, conta: contaDoHeader(linha), itens: [] };
    } else if (tipo === "3") {
      if (!lote || lote.codigo !== codigo) throw new Error(`Detalhe fora do lote no registro ${i + 1}.`);
      const segmento = fatia(linha, 14, 14);
      const seq = inteiro(linha, 9, 13);
      if (seq === 0) throw new Error(`Sequencia de detalhe zerada no registro ${i + 1}.`);
      if (segmento === "A" || (segmento === "J" && fatia(linha, 18, 19) !== "52")) {
        const chave = `${codigo}|${seq}|${segmento}`;
        if (chavesDetalhe.has(chave)) throw new Error(`Detalhe de pagamento repetido no registro ${i + 1}.`);
        chavesDetalhe.add(chave);
        const boleto = segmento === "J";
        const bancoFavorecido = fatia(linha, 21, 23);
        const itau = ["341", "409"].includes(bancoFavorecido);
        if (boleto !== ["30", "31"].includes(lote.forma)) throw new Error(`Segmento ${segmento} incompativel com a forma ${lote.forma}.`);
        const item: ItemRetorno = {
          segmento, formaPagamento: lote.forma, contaDebito: lote.conta,
          referenciaEmpresa: boleto ? fatia(linha, 183, 202) : fatia(linha, 74, 93),
          nossoNumero: (boleto ? fatia(linha, 216, 230) : fatia(linha, 135, 149)) || null,
          dataProgramada: boleto ? fatiaData(linha, 145, 152) : fatiaData(linha, 94, 101),
          valorProgramado: boleto ? fatiaValor(linha, 153, 167, 2) : fatiaValor(linha, 120, 134, 2),
          dataEfetiva: boleto ? fatiaData(linha, 145, 152) : fatiaData(linha, 155, 162),
          valorEfetivo: (boleto ? fatiaValor(linha, 153, 167, 2) : fatiaValor(linha, 163, 177, 2)) || null,
          codigoBarras: boleto ? fatia(linha, 18, 61) : undefined,
          favorecidoDocumento: boleto ? undefined : fatia(linha, 204, 217),
          contaFavorecido: boleto ? undefined : {
            banco: bancoFavorecido, agencia: fatia(linha, itau ? 25 : 24, 28),
            conta: fatia(linha, itau ? 36 : 30, 41), dac: fatia(linha, 43, 43),
          },
          ocorrencias: lerOcorrencias(linha),
        };
        if (!item.referenciaEmpresa) throw new Error(`Pagamento sem Seu Numero no registro ${i + 1}.`);
        if (!item.ocorrencias.length) throw new Error(`Pagamento sem ocorrencia no registro ${i + 1}.`);
        lote.itens.push(item);
        porSequencia.set(`${codigo}|${seq}`, item);
      } else if (segmento === "J" && fatia(linha, 18, 19) === "52") {
        const pagamento = porSequencia.get(`${codigo}|${seq}`);
        if (!pagamento || pagamento.segmento !== "J") throw new Error(`J-52 sem pagamento J correspondente no registro ${i + 1}.`);
        pagamento.favorecidoDocumento = fatia(linha, 77, 91);
      } else if (segmento === "B") {
        const pagamento = porSequencia.get(`${codigo}|${seq}`);
        if (!pagamento) throw new Error(`Segmento B sem pagamento correspondente no registro ${i + 1}.`);
        const doc = fatia(linha, 19, 32);
        if (doc && !/^0+$/.test(doc)) pagamento.favorecidoDocumento = doc;
        const complementares = lerOcorrencias(linha);
        pagamento.ocorrencias.push(...complementares.filter(o => !pagamento.ocorrencias.some(a => a.codigo === o.codigo)));
      } else if (!["B", "C", "D", "E", "F", "Z"].includes(segmento) && !(segmento === "J" && fatia(linha, 18, 19) === "52")) {
        throw new Error(`Segmento ${segmento} nao suportado no registro ${i + 1}.`);
      }
    } else if (tipo === "5") {
      if (!lote || lote.codigo !== codigo) throw new Error(`Trailer de lote sem header no registro ${i + 1}.`);
      if (inteiro(linha, 18, 23) !== i - lote.inicio + 1) throw new Error(`Quantidade de registros do lote ${codigo} diverge do trailer.`);
      const estruturais = [...lerOcorrencias(linhas[lote.inicio]), ...lerOcorrencias(linha)];
      if (estruturais.some(o => ["TA", "HJ", "HM", "RJ", "AG", "AH"].includes(o.codigo))) {
        throw new Error(`Lote ${codigo} rejeitado pelo banco: ${estruturais.map(o => `${o.codigo}: ${o.descricao}`).join("; ")}.`);
      }
      if (estruturais.some(o => o.codigo === "LC")) {
        lote.itens.forEach(item => item.ocorrencias.push({ codigo: "LC", descricao: "Lote de pagamentos cancelado" }));
      }
      itens.push(...lote.itens);
      lote = null;
    } else {
      throw new Error(`Tipo de registro ${tipo} inesperado no registro ${i + 1}.`);
    }
  }
  if (lote) throw new Error("Retorno incompleto: Trailer de Lote ausente.");
  if (inteiro(trailer, 18, 23) !== lotes.size) throw new Error("Quantidade de lotes diverge do Trailer de Arquivo.");
  if (!itens.length) throw new Error("Retorno sem pagamentos A/J reconheciveis.");
  return { codigoBanco: CODIGO_BANCO_ITAU, dataGeracao, itens, totalRegistrosLote: itens.length };
}
