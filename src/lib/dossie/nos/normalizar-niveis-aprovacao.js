// @ts-nocheck
// No Code do workflow n8n "Normalizar Níveis Aprovação" (Dossie OC SeniorX v6.4), codigo original sem alteracoes.
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

  const normalized = String(value)
    .replace(/\./g, '')
    .replace(',', '.');

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

function descricaoSituacao(codigo) {
  const situacoes = {
    APR: 'APROVADO'
  };

  return situacoes[codigo] || codigo || null;
}

return items.map(item => {

  const xml = item.json.aprovacaoNiveisXml || '';

  const linhas = [
    ...xml.matchAll(/<line>([\s\S]*?)<\/line>/gi)
  ].map(match => match[1]);

  const niveis = linhas.map(linha => {

    const situacaoCodigo = getTag(linha, 'SITAPR');

    return {

      sequenciaAprovacao:
        getNumber(linha, 'SEQAPR'),

      nivel:
        getNumber(linha, 'NIVAPR'),

      sequenciaNivel:
        getNumber(linha, 'SEQNIV'),

      aprovador: {
        codigoUsuario:
          getNumber(linha, 'USUAPR'),

        substituto:
          getNumber(linha, 'USUREP')
      },

      centroCusto:
        getTag(linha, 'CCUAPR'),

      aprovacao: {
        data:
          getDateISO(linha, 'DATAPR'),

        hora:
          getSeniorTime(linha, 'HORAPR'),

        situacaoCodigo,

        situacaoDescricao:
          descricaoSituacao(situacaoCodigo),

        observacao:
          getTag(linha, 'OBSAPR')
      },

      motivo: {
        codigo:
          getNumber(linha, 'CODMOT'),

        observacao:
          getTag(linha, 'OBSMOT')
      },

      atualizacao: {
        usuario:
          getNumber(linha, 'USUATU'),

        data:
          getDateISO(linha, 'DATATU'),

        hora:
          getSeniorTime(linha, 'HORATU')
      }

    };

  });

  const primeiro = linhas[0] || '';

  const todosAprovados = niveis.every(
    nivel => nivel.aprovacao.situacaoCodigo === 'APR'
  );

  const usuariosAprovadores = [
    ...new Set(
      niveis
        .map(nivel => nivel.aprovador.codigoUsuario)
        .filter(valor => valor !== null)
    )
  ];

  const centrosCusto = [
    ...new Set(
      niveis
        .map(nivel => nivel.centroCusto)
        .filter(valor => valor !== null)
    )
  ];

  return {
    json: {

      aprovacaoMultinivel: {

        empresa:
          getNumber(primeiro, 'CODEMP'),

        filial:
          getNumber(primeiro, 'CODFIL'),

        rota:
          getNumber(primeiro, 'ROTNAP'),

        numero:
          getNumber(primeiro, 'NUMAPR'),

        quantidadeNiveis:
          niveis.length,

        todosAprovados,

        situacaoGeral:
          todosAprovados
            ? 'APROVADO'
            : 'PENDENTE_OU_DIVERGENTE',

        usuariosAprovadores,

        centrosCusto,

        niveis
      },

      meta: {
        fonte: 'E614USU',
        origem: 'Senior ERP',
        metodo: 'GetDBInfo'
      }

    }
  };

});
}
