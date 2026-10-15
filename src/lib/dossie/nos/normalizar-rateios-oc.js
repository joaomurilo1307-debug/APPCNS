// @ts-nocheck
// No Code do workflow n8n "Normalizar Rateios OC" (Dossie OC SeniorX v6.4), codigo original sem alteracoes.
// Globais do n8n: $input, $ (como $('Outro no')), $json e items (= $input.all()).
export default async function ($input, $, $json) {
const items = $input.all();

function decodeXmlEntities(value) {
  if (value === null || value === undefined) {
    return null;
  }

  return String(value)
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .trim();
}

function getTag(xml, tagName) {
  const regex = new RegExp(
    `<${tagName}>([\\s\\S]*?)<\\/${tagName}>`,
    'i'
  );

  const match = xml.match(regex);

  if (!match) {
    return null;
  }

  const value = decodeXmlEntities(match[1]);

  return value === '' ? null : value;
}

function getNumber(xml, tagName) {
  const value = getTag(xml, tagName);

  if (value === null) {
    return null;
  }

  let normalized = String(value)
    .replace(/\s/g, '');

  if (normalized.includes('.') && normalized.includes(',')) {
    normalized = normalized
      .replace(/\./g, '')
      .replace(',', '.');
  } else if (normalized.includes(',')) {
    normalized = normalized.replace(',', '.');
  }

  const number = Number(normalized);

  return Number.isFinite(number)
    ? number
    : null;
}

function getDateISO(xml, tagName) {
  const value = getTag(xml, tagName);

  if (!value) {
    return null;
  }

  if (value === '31/12/1900') {
    return null;
  }

  const parts = value.split('/');

  if (parts.length !== 3) {
    return value;
  }

  const [dia, mes, ano] = parts;

  return `${ano}-${mes.padStart(2, '0')}-${dia.padStart(2, '0')}`;
}

function getSeniorTime(xml, tagName) {
  const value = getNumber(xml, tagName);

  if (value === null) {
    return null;
  }

  const horas = Math.floor(value / 60);
  const minutos = value % 60;

  return `${String(horas).padStart(2, '0')}:${String(minutos).padStart(2, '0')}`;
}


// ============================================================
// MONTA CAMPO EM FORMATO EXTENSO
// ============================================================

function montarExtenso(codigo, descricao) {

  const possuiCodigo =
    codigo !== null &&
    codigo !== undefined &&
    codigo !== '';

  const possuiDescricao =
    descricao !== null &&
    descricao !== undefined &&
    String(descricao).trim() !== '';

  if (possuiCodigo && possuiDescricao) {
    return `${codigo} - ${String(descricao).trim()}`;
  }

  if (possuiDescricao) {
    return String(descricao).trim();
  }

  if (possuiCodigo) {
    return String(codigo);
  }

  return null;
}


return items.map(item => {

  const xml = item.json.rateiosXml || '';

  const linhas = [
    ...xml.matchAll(/<line>([\s\S]*?)<\/line>/gi)
  ].map(match => match[1]);

  const rateios = linhas.map(linha => {

    const seqProduto =
      getNumber(linha, 'SEQIPO') || 0;

    const seqServico =
      getNumber(linha, 'SEQISO') || 0;

    let tipoItem = 'GERAL';
    let sequenciaItem = null;
    let transacao = null;

    if (seqProduto > 0) {

      tipoItem = 'PRODUTO';
      sequenciaItem = seqProduto;
      transacao = getTag(linha, 'TNSPRO');

    } else if (seqServico > 0) {

      tipoItem = 'SERVICO';
      sequenciaItem = seqServico;
      transacao = getTag(linha, 'TNSSER');

    }


    // ========================================================
    // VALORES DO RATEIO
    // ========================================================

    const percentualConta =
      getNumber(linha, 'PERCTA');

    const percentualRateio =
      getNumber(linha, 'PERRAT');

    const valorConta =
      getNumber(linha, 'VLRCTA');

    const valorRateio =
      getNumber(linha, 'VLRRAT');


    // ========================================================
    // CONTA FINANCEIRA
    // ========================================================

    const codigoContaFinanceira =
      getNumber(linha, 'CTAFIN');

    const descricaoContaFinanceira =
      getTag(linha, 'DESCTAFIN');


    // ========================================================
    // CENTRO DE CUSTO
    // ========================================================

    const codigoCentroCusto =
      getTag(linha, 'CODCCU');

    const descricaoCentroCusto =
      getTag(linha, 'DESCCU');


    return {

      sequencia:
        getNumber(linha, 'SEQRAT'),


      // ======================================================
      // ORIGEM DO ITEM
      // ======================================================

      origemItem: {

        tipo:
          tipoItem,

        sequencia:
          sequenciaItem,

        transacao
      },


      // ======================================================
      // PROJETO
      // ======================================================

      projeto: {

        numero:
          getNumber(linha, 'NUMPRJ'),

        fase:
          getNumber(linha, 'CODFPJ')
      },


      // ======================================================
      // CONTA FINANCEIRA
      // ======================================================

      contaFinanceira: {

        codigo:
          codigoContaFinanceira,

        descricao:
          descricaoContaFinanceira,

        extenso:
          montarExtenso(
            codigoContaFinanceira,
            descricaoContaFinanceira
          ),

        reduzida:
          getNumber(linha, 'CTARED')
      },


      // ======================================================
      // CENTRO DE CUSTO
      // ======================================================

      centroCusto: {

        codigo:
          codigoCentroCusto,

        descricao:
          descricaoCentroCusto,

        extenso:
          montarExtenso(
            codigoCentroCusto,
            descricaoCentroCusto
          )
      },


      // ======================================================
      // VALORES
      // ======================================================

      valores: {

        percentualConta,

        valorConta,

        percentualRateio,

        quantidadeRateio:
          getNumber(linha, 'QTDRAT'),

        valorRateado:
          valorRateio
      },


      observacao:
        getTag(linha, 'OBSRAT'),


      // ======================================================
      // DADOS TÉCNICOS
      // ======================================================

      dadosTecnicos: {

        criterioRateio:
          getNumber(linha, 'CRIRAT'),

        somaSubrateio:
          getNumber(linha, 'SOMSUB'),

        tipoOrigem:
          getTag(linha, 'TIPORI')
      },


      // ======================================================
      // AUDITORIA
      // ======================================================

      auditoria: {

        usuarioGerador:
          getNumber(linha, 'USUGER'),

        dataGeracao:
          getDateISO(linha, 'DATGER'),

        horaGeracao:
          getSeniorTime(linha, 'HORGER')
      },


      // ======================================================
      // VALIDAÇÃO
      // ======================================================

      validacao: {

        percentualContaValido:
          percentualConta !== null
            ? percentualConta >= 0 &&
              percentualConta <= 100
            : null,

        percentualRateioValido:
          percentualRateio !== null
            ? percentualRateio >= 0 &&
              percentualRateio <= 100
            : null,

        valoresConferem:
          valorConta !== null &&
          valorRateio !== null
            ? Math.abs(
                valorConta -
                valorRateio
              ) < 0.01
            : null
      }

    };

  });


  // ==========================================================
  // RESUMO DOS RATEIOS
  // ==========================================================

  const totalRateado =
    rateios.reduce(
      (total, rateio) =>
        total +
        (
          rateio
            ?.valores
            ?.valorRateado || 0
        ),
      0
    );

  const totalValorConta =
    rateios.reduce(
      (total, rateio) =>
        total +
        (
          rateio
            ?.valores
            ?.valorConta || 0
        ),
      0
    );


  const produtosRateados =
    rateios.filter(
      rateio =>
        rateio
          ?.origemItem
          ?.tipo === 'PRODUTO'
    );


  const servicosRateados =
    rateios.filter(
      rateio =>
        rateio
          ?.origemItem
          ?.tipo === 'SERVICO'
    );


  const totalProdutosRateados =
    produtosRateados.reduce(
      (total, rateio) =>
        total +
        (
          rateio
            ?.valores
            ?.valorRateado || 0
        ),
      0
    );


  const totalServicosRateados =
    servicosRateados.reduce(
      (total, rateio) =>
        total +
        (
          rateio
            ?.valores
            ?.valorRateado || 0
        ),
      0
    );


  const valoresConferem =
    rateios.every(
      rateio =>
        rateio
          ?.validacao
          ?.valoresConferem !== false
    );


  // ==========================================================
  // SAÍDA
  // ==========================================================

  return {

    json: {

      rateios,

      resumoRateios: {

        quantidadeRegistros:
          rateios.length,

        quantidadeProdutos:
          produtosRateados.length,

        quantidadeServicos:
          servicosRateados.length,

        totalProdutos:
          Number(
            totalProdutosRateados
              .toFixed(2)
          ),

        totalServicos:
          Number(
            totalServicosRateados
              .toFixed(2)
          ),

        valorConta:
          Number(
            totalValorConta
              .toFixed(2)
          ),

        valorRateado:
          Number(
            totalRateado
              .toFixed(2)
          ),

        valoresConferem
      },

      meta: {

        fonte:
          'E420RAT + E091PLF + E044CCU',

        origem:
          'Senior ERP',

        metodo:
          'GetDBInfo',

        enriquecimento: {

          contaFinanceira:
            'E091PLF.DESCTA',

          centroCusto:
            'E044CCU.DESCCU'
        }
      }

    }

  };

});
}
