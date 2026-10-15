// @ts-nocheck
// No Code do workflow n8n "Normalizar Cabeçalho OC" (Dossie OC SeniorX v6.4), codigo original sem alteracoes.
// Globais do n8n: $input, $ (como $('Outro no')), $json e items (= $input.all()).
export default async function ($input, $, $json) {
const items = $input.all();

function getTag(xml, tagName) {
  const regex = new RegExp(
    `<${tagName}>([\\s\\S]*?)<\\/${tagName}>`,
    'i'
  );

  const match = xml.match(regex);

  if (!match) {
    return null;
  }

  const value = match[1].trim();

  return value === '' ? null : value;
}

function getNumber(xml, tagName) {
  const value = getTag(xml, tagName);

  if (value === null) {
    return null;
  }

  const number = Number(
    String(value)
      .replace(/\./g, '')
      .replace(',', '.')
  );

  return Number.isFinite(number)
    ? number
    : null;
}

function getDateISO(xml, tagName) {
  const value = getTag(xml, tagName);

  if (!value) {
    return null;
  }

  const partes = value.split('/');

  if (partes.length !== 3) {
    return value;
  }

  const [dia, mes, ano] = partes;

  return `${ano}-${mes.padStart(2, '0')}-${dia.padStart(2, '0')}`;
}


// ============================================================
// SITUAÇÃO DA ORDEM DE COMPRA
// ============================================================

function descricaoSituacaoOC(codigo) {

  const situacoes = {
    '1': 'Aberto Total',
    '2': 'Aberto Parcial',
    '3': 'Suspenso',
    '4': 'Liquidado',
    '5': 'Cancelado',
    '6': 'Aguardando Integração WMS',
    '7': 'Em Transmissão',
    '8': 'Preparação Análise ou NF',
    '9': 'Não Fechado'
  };

  if (
    codigo === null ||
    codigo === undefined ||
    codigo === ''
  ) {
    return null;
  }

  return situacoes[String(codigo)] || null;
}


// ============================================================
// SITUAÇÃO DA APROVAÇÃO
// ============================================================

function descricaoSituacaoAprovacao(codigo) {

  const situacoes = {
    ANA: 'Em Análise',
    PAS: 'Repassado',
    APR: 'Aprovado',
    REP: 'Reprovado',
    CAN: 'Cancelado',
    PRE: 'Em Preparação',
    AGA: 'Aguardando Aprovação',
    BLO: 'Bloqueado'
  };

  if (!codigo) {
    return null;
  }

  return situacoes[String(codigo).trim()] || null;
}


// ============================================================
// MONTA CAMPO EXTENSO
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

  const xml = item.json.cabecalhoXml || '';

  const codigoSituacaoOC =
    getTag(xml, 'SITOCP');

  const descricaoOC =
    descricaoSituacaoOC(
      codigoSituacaoOC
    );

  const codigoSituacaoAprovacao =
    getTag(xml, 'SITAPR');

  const descricaoAprovacao =
    descricaoSituacaoAprovacao(
      codigoSituacaoAprovacao
    );


  const ordemCompra = {

    empresa:
      getNumber(xml, 'CODEMP'),

    filial:
      getNumber(xml, 'CODFIL'),

    numero:
      getNumber(xml, 'NUMOCP'),


    fornecedor: {

      codigo:
        getNumber(xml, 'CODFOR')
    },


    emissao:
      getDateISO(xml, 'DATEMI'),


    transacoes: {

      produto:
        getTag(xml, 'TNSPRO'),

      servico:
        getTag(xml, 'TNSSER')
    },


    valores: {

      liquido:
        getNumber(xml, 'VLRLIQ'),

      financeiro:
        getNumber(xml, 'VLRFIN'),

      original:
        getNumber(xml, 'VLRORI')
    },


    // ========================================================
    // SITUAÇÕES
    // Mantemos os campos antigos para compatibilidade.
    // ========================================================

    situacao: {

      oc:
        codigoSituacaoOC,

      ocDescricao:
        descricaoOC,

      ocExtenso:
        montarExtenso(
          codigoSituacaoOC,
          descricaoOC
        ),


      aprovacao:
        codigoSituacaoAprovacao,

      aprovacaoDescricao:
        descricaoAprovacao,

      aprovacaoExtenso:
        montarExtenso(
          codigoSituacaoAprovacao,
          descricaoAprovacao
        )
    },


    usuarioGerador:
      getNumber(xml, 'USUGER'),


    aprovacao: {

      filial:
        getNumber(xml, 'FILAPR'),

      rota:
        getNumber(xml, 'ROTNAP'),

      numero:
        getNumber(xml, 'NUMAPR')
    },


    camposCustomizados: {

      vencimento:
        getDateISO(
          xml,
          'USU_DATVECT'
        ),

      numeroNotaFiscal:
        getTag(
          xml,
          'USU_NUMNFC'
        ),

      titulosInformados:
        getTag(
          xml,
          'USU_NUMTIT'
        ),

      controleFrota:
        getTag(
          xml,
          'USU_CONFRO'
        ),

      reembolsavel:
        getTag(
          xml,
          'USU_REEMB'
        )
    }

  };


  return {

    json: {

      ordemCompra,

      meta: {

        fonte:
          'E420OCP',

        origem:
          'Senior ERP',

        metodo:
          'GetDBInfo',

        enriquecimento: {

          situacaoOC:
            'Tabela oficial SITOCP Senior ERP',

          situacaoAprovacao:
            'Tabela oficial SITAPR Senior ERP'
        }
      }

    }

  };

});
}
