// @ts-nocheck
// No Code do workflow n8n "Normalizar Notas Fiscais" (Dossie OC SeniorX v6.4), codigo original sem alteracoes.
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

function descricaoReembolsavel(codigo) {
  if (codigo === 'S') return 'SIM';
  if (codigo === 'N') return 'NAO';
  return 'NAO_INFORMADO';
}

function descricaoSituacao(codigo) {
  const situacoes = {
    '2': 'FECHADA'
  };

  return situacoes[String(codigo)] || null;
}

const notasFiscais = [];

for (const item of items) {

  const xml = item.json.notaFiscalXml || '';

  const linhas = [
    ...xml.matchAll(/<line>([\s\S]*?)<\/line>/gi)
  ].map(match => match[1]);

  for (const linha of linhas) {

    const transacaoProduto =
      getTag(linha, 'TNSPRO');

    const transacaoServico =
      getTag(linha, 'TNSSER');

    const valorProdutos =
      getNumber(linha, 'VLRLPR') || 0;

    const valorServicos =
      getNumber(linha, 'VLRLSE') || 0;

    let natureza = 'NAO_IDENTIFICADA';

    if (
      valorProdutos > 0 &&
      valorServicos > 0
    ) {
      natureza = 'MISTA';
    } else if (
      valorProdutos > 0 ||
      transacaoProduto
    ) {
      natureza = 'PRODUTO';
    } else if (
      valorServicos > 0 ||
      transacaoServico
    ) {
      natureza = 'SERVICO';
    }

    const chaveEletronica =
      getTag(linha, 'CHVNEL');

    const situacaoCodigo =
      getTag(linha, 'SITNFC');

    const numeroOcp =
      getNumber(linha, 'NUMOCP');

    const reembolsavelCodigo =
      getTag(linha, 'USU_REEMB');

    notasFiscais.push({

      empresa:
        getNumber(linha, 'CODEMP'),

      filial:
        getNumber(linha, 'CODFIL'),

      fornecedor:
        getNumber(linha, 'CODFOR'),

      numero:
        getNumber(linha, 'NUMNFC'),

      serie:
        getTag(linha, 'CODSNF'),

      documento: {
        tipoNfe:
          getNumber(linha, 'TIPNFE'),

        especie:
          getNumber(linha, 'CODEDC'),

        natureza
      },

      datas: {
        emissao:
          getDateISO(linha, 'DATEMI'),

        entrada:
          getDateISO(linha, 'DATENT')
      },

      fiscal: {
        uf:
          getTag(linha, 'UFSCIC'),

        transacaoProduto,
        transacaoServico,

        naturezaOperacaoProduto:
          getTag(linha, 'NOPPRO'),

        naturezaOperacaoServico:
          getTag(linha, 'NOPSER'),

        chaveEletronica,

        possuiChaveEletronica:
          !!chaveEletronica
      },

      valores: {

        produtos:
          valorProdutos,

        servicos:
          valorServicos,

        liquido:
          getNumber(linha, 'VLRLIQ'),

        informado:
          getNumber(linha, 'VLRINF'),

        financeiro:
          getNumber(linha, 'VLRFIN'),

        frete:
          getNumber(linha, 'VLRFRE'),

        seguro:
          getNumber(linha, 'VLRSEG'),

        embalagem:
          getNumber(linha, 'VLREMB'),

        encargos:
          getNumber(linha, 'VLRENC'),

        outros:
          getNumber(linha, 'VLROUT')
      },

      impostos: {

        icms: {
          base:
            getNumber(linha, 'VLRBIC'),

          valor:
            getNumber(linha, 'VLRICM')
        },

        ipi: {
          base:
            getNumber(linha, 'VLRBIP'),

          valor:
            getNumber(linha, 'VLRIPI')
        },

        iss: {
          base:
            getNumber(linha, 'VLRBIS'),

          valor:
            getNumber(linha, 'VLRISS')
        },

        irrf: {
          base:
            getNumber(linha, 'VLRBIR'),

          valor:
            getNumber(linha, 'VLRIRF')
        },

        inss: {
          base:
            getNumber(linha, 'VLRBIN'),

          valor:
            getNumber(linha, 'VLRINS')
        },

        pis: {
          base:
            getNumber(linha, 'VLRBPI'),

          valor:
            getNumber(linha, 'VLRPIS')
        },

        cofins: {
          base:
            getNumber(linha, 'VLRBCR'),

          valor:
            getNumber(linha, 'VLRCOR')
        }
      },

      situacao: {
        codigo:
          situacaoCodigo,

        descricao:
          descricaoSituacao(situacaoCodigo)
      },

      ordemCompraDireta: {
        possuiVinculo:
          numeroOcp !== null &&
          numeroOcp > 0,

        filial:
          getNumber(linha, 'FILOCP'),

        numero:
          numeroOcp
      },

      fechamento: {
        usuario:
          getNumber(linha, 'USUFEC'),

        data:
          getDateISO(linha, 'DATFEC'),

        hora:
          getSeniorTime(linha, 'HORFEC')
      },

      auditoria: {
        usuarioGerador:
          getNumber(linha, 'USUGER'),

        dataGeracao:
          getDateISO(linha, 'DATGER'),

        horaGeracao:
          getSeniorTime(linha, 'HORGER')
      },

      camposCustomizados: {
        reembolsavelCodigo,

        reembolsavel:
          descricaoReembolsavel(
            reembolsavelCodigo
          )
      },

      integracaoDocumental: {
        possuiChaveNfe:
          !!chaveEletronica,

        elegivelBuscaEdocsPorChave:
          !!chaveEletronica
      }

    });

  }

}

const totalProdutos = notasFiscais.reduce(
  (total, nf) =>
    total + (nf.valores.produtos || 0),
  0
);

const totalServicos = notasFiscais.reduce(
  (total, nf) =>
    total + (nf.valores.servicos || 0),
  0
);

const totalLiquido = notasFiscais.reduce(
  (total, nf) =>
    total + (nf.valores.liquido || 0),
  0
);

const totalFinanceiro = notasFiscais.reduce(
  (total, nf) =>
    total + (nf.valores.financeiro || 0),
  0
);

const comChaveEletronica = notasFiscais.filter(
  nf =>
    nf.integracaoDocumental
      .possuiChaveNfe
).length;

const semChaveEletronica =
  notasFiscais.length -
  comChaveEletronica;

return [
  {
    json: {

      notasFiscais,

      resumoNotasFiscais: {

        quantidade:
          notasFiscais.length,

        quantidadeProdutos:
          notasFiscais.filter(
            nf =>
              nf.documento.natureza ===
              'PRODUTO'
          ).length,

        quantidadeServicos:
          notasFiscais.filter(
            nf =>
              nf.documento.natureza ===
              'SERVICO'
          ).length,

        totalProdutos:
          Number(totalProdutos.toFixed(2)),

        totalServicos:
          Number(totalServicos.toFixed(2)),

        totalLiquido:
          Number(totalLiquido.toFixed(2)),

        totalFinanceiro:
          Number(totalFinanceiro.toFixed(2)),

        comChaveEletronica,

        semChaveEletronica,

        quantidadeVinculoDiretoOc:
          notasFiscais.filter(
            nf =>
              nf.ordemCompraDireta
                .possuiVinculo
          ).length
      },

      meta: {
        fonte: 'E440NFC',
        origem: 'Senior ERP',
        metodo: 'GetDBInfo'
      }

    }
  }
];
}
