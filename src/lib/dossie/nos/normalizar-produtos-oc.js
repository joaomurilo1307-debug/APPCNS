// @ts-nocheck
// No Code do workflow n8n "Normalizar Produtos OC" (Dossie OC SeniorX v6.4), codigo original sem alteracoes.
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

  // Ex.: 1.234,56
  if (normalized.includes('.') && normalized.includes(',')) {
    normalized = normalized
      .replace(/\./g, '')
      .replace(',', '.');
  }
  // Ex.: 21,6
  else if (normalized.includes(',')) {
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

  // Data técnica padrão do Senior
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

  // Senior armazena vários horários como minutos desde 00:00.
  const horas = Math.floor(value / 60);
  const minutos = value % 60;

  return `${String(horas).padStart(2, '0')}:${String(minutos).padStart(2, '0')}`;
}

return items.map(item => {

  const xml = item.json.produtosXml || '';

  const linhas = [
    ...xml.matchAll(/<line>([\s\S]*?)<\/line>/gi)
  ].map(match => match[1]);

  const produtos = linhas.map(linha => {

    const quantidade = getNumber(linha, 'QTDPED');
    const valorUnitario = getNumber(linha, 'PREUNI');
    const valorLiquido = getNumber(linha, 'VLRLIQ');

    return {

      sequencia: getNumber(linha, 'SEQIPO'),

      transacao: getTag(linha, 'TNSPRO'),

      produto: {
        codigo: getTag(linha, 'CODPRO'),
        derivacao: getTag(linha, 'CODDER'),
        descricao: getTag(linha, 'CPLIPO'),
        familia: getTag(linha, 'CODFAM')
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
        liquido: valorLiquido,
        financeiro: getNumber(linha, 'VLRFIN'),
        original: getNumber(linha, 'VLRORI'),
        frete: getNumber(linha, 'VLRFRE'),
        seguro: getNumber(linha, 'VLRSEG'),
        embalagem: getNumber(linha, 'VLREMB'),
        encargos: getNumber(linha, 'VLRENC'),
        outros: getNumber(linha, 'VLROUT')
      },

      impostos: {

        icms: {
          base: getNumber(linha, 'VLRBIC'),
          aliquota: getNumber(linha, 'PERICM'),
          valor: getNumber(linha, 'VLRICM')
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
          base: getNumber(linha, 'VLRBIP'),
          valor: getNumber(linha, 'VLRIPI'),
          cst: getTag(linha, 'CSTIPI')
        }

      },

      classificacaoFiscal: {
        codigo: getTag(linha, 'CODCLF'),
        tributacao: getTag(linha, 'CODSTR')
      },

      entrega: getDateISO(linha, 'DATENT'),

      situacao: getTag(linha, 'SITIPO'),

      observacao: getTag(linha, 'OBSIPO'),

      auditoria: {
        usuarioGerador: getNumber(linha, 'USUGER'),
        dataGeracao: getDateISO(linha, 'DATGER'),
        horaGeracao: getSeniorTime(linha, 'HORGER')
      },

      validacao: {
        valorCalculado:
          quantidade !== null && valorUnitario !== null
            ? Number((quantidade * valorUnitario).toFixed(2))
            : null,

        valorRegistrado: valorLiquido
      }

    };

  });

  // Validação individual de cada produto
  for (const produto of produtos) {

    const calculado = produto.validacao.valorCalculado;
    const registrado = produto.validacao.valorRegistrado;

    produto.validacao.valorConfere =
      calculado !== null &&
      registrado !== null
        ? Math.abs(calculado - registrado) < 0.01
        : null;
  }

  const totalProdutos = produtos.reduce(
    (soma, produto) =>
      soma + (produto.valores.liquido || 0),
    0
  );

  const totalBruto = produtos.reduce(
    (soma, produto) =>
      soma + (produto.valores.bruto || 0),
    0
  );

  const totalICMS = produtos.reduce(
    (soma, produto) =>
      soma + (produto.impostos.icms.valor || 0),
    0
  );

  const todosValoresConferem = produtos.every(
    produto =>
      produto.validacao.valorConfere !== false
  );

  return {
    json: {

      produtos,

      resumoProdutos: {
        quantidadeItens: produtos.length,
        valorBruto: Number(totalBruto.toFixed(2)),
        valorLiquido: Number(totalProdutos.toFixed(2)),
        valorICMS: Number(totalICMS.toFixed(2)),
        valoresConferem: todosValoresConferem
      },

      meta: {
        fonte: 'E420IPO',
        origem: 'Senior ERP',
        metodo: 'GetDBInfo'
      }

    }
  };

});
}
