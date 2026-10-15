// @ts-nocheck
// No Code do workflow n8n "Normalizar Movimentações Financeiras" (Dossie OC SeniorX v6.4), codigo original sem alteracoes.
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

  if (
    normalized.includes('.') &&
    normalized.includes(',')
  ) {
    normalized = normalized
      .replace(/\./g, '')
      .replace(',', '.');
  } else if (normalized.includes(',')) {
    normalized =
      normalized.replace(',', '.');
  }

  const numero = Number(normalized);

  return Number.isFinite(numero)
    ? numero
    : null;
}

function getDateISO(xml, tagName) {
  const value = getTag(xml, tagName);

  if (
    !value ||
    value === '31/12/1900'
  ) {
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
  const value =
    getNumber(xml, tagName);

  if (
    value === null ||
    value === 0
  ) {
    return null;
  }

  const horas =
    Math.floor(value / 60);

  const minutos =
    value % 60;

  return (
    `${String(horas).padStart(2, '0')}:` +
    `${String(minutos).padStart(2, '0')}`
  );
}


// =====================================================
// NORMALIZA TODAS AS MOVIMENTAÇÕES
// =====================================================

const movimentacoes = [];

for (const item of items) {

  const xml =
    item.json.movimentacoesXml || '';

  const linhas = [
    ...xml.matchAll(
      /<line>([\s\S]*?)<\/line>/gi
    )
  ].map(match => match[1]);

  for (const linha of linhas) {

    const dataPagamento =
      getDateISO(
        linha,
        'DATPGT'
      );

    const tipoPagamento =
      getTag(
        linha,
        'TIPPGT'
      );

    const loteBaixa =
      getNumber(
        linha,
        'LOTBAI'
      );

    const numeroLote =
      getNumber(
        linha,
        'NUMLOT'
      );

    /*
      Importante:

      VLRMOV não significa pagamento por si só.
      A movimentação inicial do título também
      possui VLRMOV.

      Evidência de pagamento depende de
      informações próprias do movimento.
    */

    const possuiEvidenciaPagamento =
      dataPagamento !== null ||
      tipoPagamento !== null ||
      (
        loteBaixa !== null &&
        loteBaixa > 0
      ) ||
      (
        numeroLote !== null &&
        numeroLote > 0
      );

    movimentacoes.push({

      chaveTitulo: {

        empresa:
          getNumber(
            linha,
            'CODEMP'
          ),

        filial:
          getNumber(
            linha,
            'CODFIL'
          ),

        fornecedor:
          getNumber(
            linha,
            'CODFOR'
          ),

        numero:
          getTag(
            linha,
            'NUMTIT'
          ),

        tipo:
          getTag(
            linha,
            'CODTPT'
          )
      },

      sequencia:
        getNumber(
          linha,
          'SEQMOV'
        ),

      transacao:
        getTag(
          linha,
          'CODTNS'
        ),

      dataMovimento:
        getDateISO(
          linha,
          'DATMOV'
        ),

      documento:
        getTag(
          linha,
          'NUMDOC'
        ),

      observacao:
        getTag(
          linha,
          'OBSMCP'
        ),

      vencimento:
        getDateISO(
          linha,
          'VCTPRO'
        ),

      /*
        VLRABE da E501MCP é preservado
        como dado histórico do movimento.

        NÃO será interpretado como saldo
        corrente do título.
      */

      valores: {

        movimento:
          getNumber(
            linha,
            'VLRMOV'
          ),

        liquido:
          getNumber(
            linha,
            'VLRLIQ'
          ),

        saldoInformadoMovimento:
          getNumber(
            linha,
            'VLRABE'
          ),

        desconto:
          getNumber(
            linha,
            'VLRDSC'
          ),

        outrosDescontos:
          getNumber(
            linha,
            'VLRODE'
          ),

        juros:
          getNumber(
            linha,
            'VLRJRS'
          ),

        multa:
          getNumber(
            linha,
            'VLRMUL'
          ),

        encargos:
          getNumber(
            linha,
            'VLRENC'
          ),

        correcao:
          getNumber(
            linha,
            'VLRCOR'
          ),

        outrosAcrescimos:
          getNumber(
            linha,
            'VLROAC'
          )
      },

      retencoes: {

        irrf:
          getNumber(
            linha,
            'VLRIRF'
          ),

        iss:
          getNumber(
            linha,
            'VLRISS'
          ),

        inss:
          getNumber(
            linha,
            'VLRINS'
          ),

        pis:
          getNumber(
            linha,
            'VLRPIS'
          ),

        cofins:
          getNumber(
            linha,
            'VLRCOF'
          ),

        pisRetido:
          getNumber(
            linha,
            'VLRPIT'
          ),

        csrf:
          getNumber(
            linha,
            'VLRCRT'
          ),

        csll:
          getNumber(
            linha,
            'VLRCSL'
          ),

        outras:
          getNumber(
            linha,
            'VLROUR'
          )
      },

      pagamento: {

        possuiEvidencia:
          possuiEvidenciaPagamento,

        data:
          dataPagamento,

        tipo:
          tipoPagamento,

        loteBaixa,
        numeroLote,

        ultimaDataPagamento:
          getDateISO(
            linha,
            'ULTPGT'
          )
      },

      financeiro: {

        formaPagamento:
          getNumber(
            linha,
            'CODFPG'
          ),

        lancamentoFinanceiro:
          getTag(
            linha,
            'LCTFIN'
          )
      },

      auditoria: {

        usuarioGerador:
          getNumber(
            linha,
            'USUGER'
          ),

        dataGeracao:
          getDateISO(
            linha,
            'DATGER'
          ),

        horaGeracao:
          getSeniorTime(
            linha,
            'HORGER'
          )
      }

    });

  }

}


// =====================================================
// AGRUPA POR TÍTULO
// =====================================================

const mapaTitulos =
  new Map();

for (
  const movimento
  of movimentacoes
) {

  const chave = [
    movimento
      .chaveTitulo
      .empresa,

    movimento
      .chaveTitulo
      .filial,

    movimento
      .chaveTitulo
      .fornecedor,

    movimento
      .chaveTitulo
      .numero,

    movimento
      .chaveTitulo
      .tipo

  ].join('|');


  if (
    !mapaTitulos.has(chave)
  ) {

    mapaTitulos.set(
      chave,
      []
    );
  }

  mapaTitulos
    .get(chave)
    .push(movimento);
}


// =====================================================
// RESUMO POR TÍTULO
// =====================================================

const titulosMovimentacao = [];

for (
  const movimentosTitulo
  of mapaTitulos.values()
) {

  movimentosTitulo.sort(
    (a, b) =>
      (a.sequencia || 0) -
      (b.sequencia || 0)
  );

  const ultimo =
    movimentosTitulo[
      movimentosTitulo.length - 1
    ];

  const movimentosComPagamento =
    movimentosTitulo.filter(
      movimento =>
        movimento
          .pagamento
          .possuiEvidencia === true
    );

  const existeEvidenciaPagamento =
    movimentosComPagamento.length > 0;

  const datasPagamento =
    movimentosComPagamento
      .map(
        movimento =>
          movimento
            .pagamento
            .data
      )
      .filter(Boolean);

  const ultimaDataPagamento =
    datasPagamento.length > 0
      ? datasPagamento[
          datasPagamento.length - 1
        ]
      : null;

  /*
    O status corrente do título NÃO é
    definido pela E501MCP.

    A E501MCP informa somente o histórico.

    Situação atual e saldo atual virão
    da E501TCP na Conciliação Geral.
  */

  titulosMovimentacao.push({

    titulo:
      ultimo.chaveTitulo,

    quantidadeMovimentacoes:
      movimentosTitulo.length,

    existeEvidenciaPagamento,

    quantidadeMovimentosPagamento:
      movimentosComPagamento.length,

    ultimaDataPagamento,

    statusHistorico:
      existeEvidenciaPagamento
        ? 'COM_EVIDENCIA_PAGAMENTO'
        : 'SEM_EVIDENCIA_PAGAMENTO',

    movimentos:
      movimentosTitulo

  });

}


// =====================================================
// RESUMO GLOBAL DAS MOVIMENTAÇÕES
// =====================================================

const titulosComEvidenciaPagamento =
  titulosMovimentacao
    .filter(
      titulo =>
        titulo
          .existeEvidenciaPagamento === true
    )
    .length;

const movimentosComEvidenciaPagamento =
  movimentacoes
    .filter(
      movimento =>
        movimento
          .pagamento
          .possuiEvidencia === true
    )
    .length;

return [
  {
    json: {

      movimentacoes,

      titulosMovimentacao,

      resumoMovimentacoes: {

        quantidadeTitulos:
          titulosMovimentacao.length,

        quantidadeMovimentacoes:
          movimentacoes.length,

        titulosComEvidenciaPagamento,

        movimentosComEvidenciaPagamento
      },

      meta: {

        fonte:
          'E501MCP',

        origem:
          'Senior ERP',

        metodo:
          'GetDBInfo',

        regraSaldoAtual:
          'CONSULTAR_E501TCP',

        finalidade:
          'HISTORICO_MOVIMENTACOES'
      }

    }
  }
];
}
