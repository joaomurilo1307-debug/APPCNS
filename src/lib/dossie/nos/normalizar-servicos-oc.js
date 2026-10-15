// @ts-nocheck
// No Code do workflow n8n "Normalizar Serviços OC" (Dossie OC SeniorX v6.4), codigo original sem alteracoes.
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

  if (value === '' || value === null) {
    return null;
  }

  return value;
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

return items.map(item => {

  const xml = item.json.servicosXml || '';

  const linhas = [
    ...xml.matchAll(/<line>([\s\S]*?)<\/line>/gi)
  ].map(match => match[1]);

  const servicos = linhas.map(linha => {

    const quantidade = getNumber(linha, 'QTDPED');
    const valorUnitario = getNumber(linha, 'PREUNI');
    const valorLiquido = getNumber(linha, 'VLRLIQ');

    const valorCalculado =
      quantidade !== null && valorUnitario !== null
        ? Number((quantidade * valorUnitario).toFixed(2))
        : null;

    const valorConfere =
      valorCalculado !== null && valorLiquido !== null
        ? Math.abs(valorCalculado - valorLiquido) < 0.01
        : null;

    return {

      sequencia: getNumber(linha, 'SEQISO'),

      transacao: getTag(linha, 'TNSSER'),

      servico: {
        codigo: getTag(linha, 'CODSER'),
        descricao: getTag(linha, 'CPLISO'),
        familia: getTag(linha, 'CODFAM'),
        tributacaoServico: getTag(linha, 'CODTRI')
      },

      unidade: getTag(linha, 'UNIMED'),

      quantidades: {
        pedida: quantidade,
        recebida: getNumber(linha, 'QTDREC'),
        cancelada: getNumber(linha, 'QTDCAN'),
        aberta: getNumber(linha, 'QTDABE'),
        original: getNumber(linha, 'QTDORI')
      },

      valores: {
        unitario: valorUnitario,
        bruto: getNumber(linha, 'VLRBRU'),
        desconto: getNumber(linha, 'VLRDSC'),
        liquidoServico: getNumber(linha, 'VLRLSE'),
        liquido: valorLiquido,
        financeiro: getNumber(linha, 'VLRFIN'),
        original: getNumber(linha, 'VLRORI'),
        encargos: getNumber(linha, 'VLRENC'),
        outros: getNumber(linha, 'VLROUT')
      },

      impostos: {

        iss: {
          aliquota: getNumber(linha, 'PERISS'),
          base: getNumber(linha, 'VLRBIS'),
          valor: getNumber(linha, 'VLRISS')
        },

        irrf: {
          aliquota: getNumber(linha, 'PERIRF'),
          base: getNumber(linha, 'VLRBIR'),
          valor: getNumber(linha, 'VLRIRF')
        },

        inss: {
          aliquota: getNumber(linha, 'PERINS'),
          base: getNumber(linha, 'VLRBIN'),
          valor: getNumber(linha, 'VLRINS')
        },

        pis: {
          base: getNumber(linha, 'VLRBPI'),
          valor: getNumber(linha, 'VLRPIS'),
          cst: getTag(linha, 'CSTPIS')
        },

        cofins: {
          base: getNumber(linha, 'VLRBCR'),
          valor: getNumber(linha, 'VLRCOR'),
          cst: getTag(linha, 'CSTCOF')
        },

        ipi: {
          aliquota: getNumber(linha, 'PERIPI'),
          base: getNumber(linha, 'VLRBIP'),
          valor: getNumber(linha, 'VLRIPI'),
          cst: getTag(linha, 'CSTIPI')
        },

        icms: {
          aliquota: getNumber(linha, 'PERICM'),
          base: getNumber(linha, 'VLRBIC'),
          valor: getNumber(linha, 'VLRICM')
        }

      },

      classificacaoFiscal: {
        codigo: getTag(linha, 'CODCLF'),
        tributacao: getTag(linha, 'CODSTR')
      },

      entrega: getDateISO(linha, 'DATENT'),

      projeto: {
        numero: getNumber(linha, 'NUMPRJ'),
        fase: getNumber(linha, 'CODFPJ')
      },

      rateioOriginal: {
        contaFinanceira: getNumber(linha, 'CTAFIN'),
        contaReduzida: getNumber(linha, 'CTARED'),
        centroCusto: getTag(linha, 'CODCCU')
      },

      situacao: getTag(linha, 'SITISO'),

      observacao: getTag(linha, 'OBSISO'),

      auditoria: {
        usuarioGerador: getNumber(linha, 'USUGER'),
        dataGeracao: getDateISO(linha, 'DATGER'),
        horaGeracao: getSeniorTime(linha, 'HORGER')
      },

      validacao: {
        valorCalculado,
        valorRegistrado: valorLiquido,
        valorConfere
      }

    };

  });

  const totalBruto = servicos.reduce(
    (total, item) => total + (item.valores.bruto || 0),
    0
  );

  const totalLiquido = servicos.reduce(
    (total, item) => total + (item.valores.liquido || 0),
    0
  );

  const totalISS = servicos.reduce(
    (total, item) => total + (item.impostos.iss.valor || 0),
    0
  );

  const totalIRRF = servicos.reduce(
    (total, item) => total + (item.impostos.irrf.valor || 0),
    0
  );

  const totalINSS = servicos.reduce(
    (total, item) => total + (item.impostos.inss.valor || 0),
    0
  );

  const totalPIS = servicos.reduce(
    (total, item) => total + (item.impostos.pis.valor || 0),
    0
  );

  const totalCOFINS = servicos.reduce(
    (total, item) => total + (item.impostos.cofins.valor || 0),
    0
  );

  const todosValoresConferem = servicos.every(
    item => item.validacao.valorConfere !== false
  );

  return {
    json: {

      servicos,

      resumoServicos: {
        quantidadeItens: servicos.length,

        valorBruto:
          Number(totalBruto.toFixed(2)),

        valorLiquido:
          Number(totalLiquido.toFixed(2)),

        impostos: {
          iss: Number(totalISS.toFixed(2)),
          irrf: Number(totalIRRF.toFixed(2)),
          inss: Number(totalINSS.toFixed(2)),
          pis: Number(totalPIS.toFixed(2)),
          cofins: Number(totalCOFINS.toFixed(2))
        },

        valoresConferem:
          todosValoresConferem
      },

      meta: {
        fonte: 'E420ISO',
        origem: 'Senior ERP',
        metodo: 'GetDBInfo'
      }

    }
  };

});
}
