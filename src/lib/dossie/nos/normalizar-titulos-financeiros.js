// @ts-nocheck
// No Code do workflow n8n "Normalizar Títulos Financeiros" (Dossie OC SeniorX v6.4), codigo original sem alteracoes.
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

  if (!value || value === '31/12/1900') {
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

  if (value === null || value === 0) {
    return null;
  }

  const horas = Math.floor(value / 60);
  const minutos = value % 60;

  return `${String(horas).padStart(2, '0')}:${String(minutos).padStart(2, '0')}`;
}

function getValorBrutoObservacao(observacao) {
  if (!observacao) {
    return null;
  }

  const match = observacao.match(
    /VALOR\s+BRUTO\s*:\s*R\$\s*([\d.,]+)/i
  );

  if (!match) {
    return null;
  }

  let valor = match[1].trim();

  if (valor.includes('.') && valor.includes(',')) {
    valor = valor
      .replace(/\./g, '')
      .replace(',', '.');
  } else {
    valor = valor.replace(',', '.');
  }

  const numero = Number(valor);

  return Number.isFinite(numero)
    ? numero
    : null;
}

function descricaoSituacao(codigo) {
  const situacoes = {
    AB: 'ABERTO'
  };

  return situacoes[codigo] || codigo || null;
}

const titulos = [];

for (const item of items) {

  const xml = item.json.tituloXml || '';

  const linhas = [
    ...xml.matchAll(/<line>([\s\S]*?)<\/line>/gi)
  ].map(match => match[1]);

  for (const linha of linhas) {

    const valorOriginal =
      getNumber(linha, 'VLRORI');

    const valorAberto =
      getNumber(linha, 'VLRABE');

    const observacao =
      getTag(linha, 'OBSTCP');

    const valorBrutoObservacao =
      getValorBrutoObservacao(observacao);

    const situacaoCodigo =
      getTag(linha, 'SITTIT');

    const filialNf =
      getNumber(linha, 'FILNFC');

    const fornecedorNf =
      getNumber(linha, 'FORNFC');

    const numeroNf =
      getNumber(linha, 'NUMNFC');

    const serieNf =
      getTag(linha, 'SNFNFC');

    const numeroOcp =
      getNumber(linha, 'NUMOCP');

    const possuiVinculoFiscal =
      filialNf !== null &&
      filialNf > 0 &&
      fornecedorNf !== null &&
      fornecedorNf > 0 &&
      numeroNf !== null &&
      numeroNf > 0 &&
      serieNf !== null;

    const possuiVinculoDiretoOc =
      numeroOcp !== null &&
      numeroOcp > 0;

    const observacaoValorConfere =
      valorBrutoObservacao !== null &&
      valorOriginal !== null
        ? Math.abs(valorBrutoObservacao - valorOriginal) < 0.01
        : null;

    titulos.push({

      empresa:
        getNumber(linha, 'CODEMP'),

      filial:
        getNumber(linha, 'CODFIL'),

      numero:
        getTag(linha, 'NUMTIT'),

      tipo:
        getTag(linha, 'CODTPT'),

      fornecedor:
        getNumber(linha, 'CODFOR'),

      transacao:
        getTag(linha, 'CODTNS'),

      situacao: {
        codigo:
          situacaoCodigo,

        descricao:
          descricaoSituacao(situacaoCodigo)
      },

      datas: {
        emissao:
          getDateISO(linha, 'DATEMI'),

        entrada:
          getDateISO(linha, 'DATENT'),

        vencimentoOriginal:
          getDateISO(linha, 'VCTORI'),

        vencimentoAtual:
          getDateISO(linha, 'VCTPRO')
      },

      valores: {
        original:
          valorOriginal,

        aberto:
          valorAberto,

        baixadoCalculado:
          valorOriginal !== null &&
          valorAberto !== null
            ? Number(
                Math.max(
                  0,
                  valorOriginal - valorAberto
                ).toFixed(2)
              )
            : null
      },

      formaPagamento:
        getNumber(linha, 'CODFPG'),

      observacao,

      notaFiscal: {
        possuiVinculo:
          possuiVinculoFiscal,

        filial:
          filialNf,

        fornecedor:
          fornecedorNf,

        numero:
          numeroNf,

        serie:
          serieNf
      },

      ordemCompraDireta: {
        possuiVinculo:
          possuiVinculoDiretoOc,

        filial:
          getNumber(linha, 'FILOCP'),

        numero:
          numeroOcp
      },

      camposCustomizados: {
        reembolsavel:
          getTag(linha, 'USU_REEMB'),

        competenciaCompra:
          getDateISO(linha, 'USU_CCOCPR'),

        competenciaFiscal:
          getDateISO(linha, 'USU_COMFIS'),

        competenciaPagamento:
          getDateISO(linha, 'USU_COMPAG')
      },

      auditoria: {
        usuarioGerador:
          getNumber(linha, 'USUGER'),

        dataGeracao:
          getDateISO(linha, 'DATGER'),

        horaGeracao:
          getSeniorTime(linha, 'HORGER')
      },

      validacao: {

        valorBrutoObservacao,

        observacaoValorConfere,

        possuiVinculoFiscal,

        possuiVinculoDiretoOc
      }

    });

  }
}

const valorOriginalTotal = titulos.reduce(
  (total, titulo) =>
    total + (titulo.valores.original || 0),
  0
);

const valorAbertoTotal = titulos.reduce(
  (total, titulo) =>
    total + (titulo.valores.aberto || 0),
  0
);

const valorBaixadoTotal = titulos.reduce(
  (total, titulo) =>
    total + (titulo.valores.baixadoCalculado || 0),
  0
);

const quantidadeVinculadosNota = titulos.filter(
  titulo => titulo.notaFiscal.possuiVinculo
).length;

const quantidadeDivergenciasObservacao = titulos.filter(
  titulo =>
    titulo.validacao.observacaoValorConfere === false
).length;

return [
  {
    json: {

      titulos,

      resumoTitulos: {

        quantidade:
          titulos.length,

        valorOriginal:
          Number(valorOriginalTotal.toFixed(2)),

        valorAberto:
          Number(valorAbertoTotal.toFixed(2)),

        valorBaixadoCalculado:
          Number(valorBaixadoTotal.toFixed(2)),

        quantidadeVinculadosNota,

        quantidadeVinculoDiretoOc:
          titulos.filter(
            titulo =>
              titulo.ordemCompraDireta.possuiVinculo
          ).length,

        divergenciasObservacao:
          quantidadeDivergenciasObservacao
      },

      meta: {
        fonte: 'E501TCP',
        origem: 'Senior ERP',
        metodo: 'GetDBInfo'
      }

    }
  }
];
}
