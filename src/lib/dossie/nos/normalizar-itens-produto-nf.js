// @ts-nocheck
// No Code do workflow n8n "Normalizar Itens Produto NF" (Dossie OC SeniorX v6.4), codigo original sem alteracoes.
// Globais do n8n: $input, $ (como $('Outro no')), $json e items (= $input.all()).
export default async function ($input, $, $json) {
const items = $input.all();


// ============================================================
// FUNÇÕES AUXILIARES
// ============================================================

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

  const value =
    decodeXmlEntities(match[1]);

  return value === ''
    ? null
    : value;
}


function getNumber(xml, tagName) {

  const value =
    getTag(xml, tagName);

  if (value === null) {
    return null;
  }

  let normalized =
    String(value)
      .replace(/\s/g, '');

  if (
    normalized.includes('.') &&
    normalized.includes(',')
  ) {

    normalized =
      normalized
        .replace(/\./g, '')
        .replace(',', '.');

  } else if (
    normalized.includes(',')
  ) {

    normalized =
      normalized.replace(',', '.');
  }

  const number =
    Number(normalized);

  return Number.isFinite(number)
    ? number
    : null;
}


function getDateISO(xml, tagName) {

  const value =
    getTag(xml, tagName);

  if (
    !value ||
    value === '31/12/1900'
  ) {
    return null;
  }

  const parts =
    value.split('/');

  if (parts.length !== 3) {
    return value;
  }

  const [dia, mes, ano] =
    parts;

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

  return `${String(horas).padStart(2, '0')}:${String(minutos).padStart(2, '0')}`;
}


function criarChaveNota({
  empresa,
  filial,
  fornecedor,
  numero,
  serie
}) {

  return [
    empresa,
    filial,
    fornecedor,
    numero,
    serie || ''
  ].join('|');
}


// ============================================================
// MAPA DAS NOTAS DE PRODUTO
// ============================================================

const mapaNotas =
  new Map();


// ============================================================
// LEITURA DOS XMLs E440IPC
// ============================================================

for (const item of items) {

  // Este nó deve receber SOMENTE a saída do
  // "Decodificar Itens Produto NF"
  const xml =
    item.json.itensProdutoXml || '';

  if (!xml) {
    continue;
  }

  const linhas = [
    ...xml.matchAll(
      /<line>([\s\S]*?)<\/line>/gi
    )
  ].map(
    match => match[1]
  );


  for (const linha of linhas) {

    // ========================================================
    // IDENTIFICAÇÃO DA NOTA
    // ========================================================

    const identificacao = {

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
        getNumber(
          linha,
          'NUMNFC'
        ),

      serie:
        getTag(
          linha,
          'CODSNF'
        )
    };


    const chave =
      criarChaveNota(
        identificacao
      );


    // ========================================================
    // CRIA NOTA CASO AINDA NÃO EXISTA
    // ========================================================

    if (!mapaNotas.has(chave)) {

      mapaNotas.set(
        chave,
        {

          chave,

          ...identificacao,

          tipo:
            'PRODUTO',

          itens: []
        }
      );
    }


    // ========================================================
    // DADOS DO ITEM
    // ========================================================

    const quantidadeRecebida =
      getNumber(
        linha,
        'QTDREC'
      );

    const valorUnitario =
      getNumber(
        linha,
        'PREUNI'
      );

    const valorBruto =
      getNumber(
        linha,
        'VLRBRU'
      );

    const valorDesconto =
      getNumber(
        linha,
        'VLRDSC'
      );

    const valorLiquido =
      getNumber(
        linha,
        'VLRLIQ'
      );


    const itemProduto = {

      sequencia:
        getNumber(
          linha,
          'SEQIPC'
        ),


      // ======================================================
      // PRODUTO
      // ======================================================

      produto: {

        codigo:
          getTag(
            linha,
            'CODPRO'
          ),

        derivacao:
          getTag(
            linha,
            'CODDER'
          ),

        descricao:
          getTag(
            linha,
            'CPLIPC'
          ),

        familia:
          getTag(
            linha,
            'CODFAM'
          ),

        classificacaoFiscal:
          getTag(
            linha,
            'CODCLF'
          ),

        situacaoTributaria:
          getTag(
            linha,
            'CODSTR'
          )
      },


      // ======================================================
      // OPERAÇÃO FISCAL
      // ======================================================

      operacao: {

        transacao:
          getTag(
            linha,
            'TNSPRO'
          ),

        naturezaOperacao:
          getTag(
            linha,
            'NOPPRO'
          )
      },


      // ======================================================
      // QUANTIDADE / UNIDADE
      // ======================================================

      quantidade: {

        recebida:
          quantidadeRecebida,

        estoque:
          getNumber(
            linha,
            'QTDEST'
          ),

        unidadeNota:
          getTag(
            linha,
            'UNINFC'
          ),

        unidadeMedida:
          getTag(
            linha,
            'UNIMED'
          )
      },


      // ======================================================
      // ESTOQUE
      // ======================================================

      estoque: {

        deposito:
          getTag(
            linha,
            'CODDEP'
          ),

        lote:
          getTag(
            linha,
            'CODLOT'
          )
      },


      // ======================================================
      // VALORES
      // ======================================================

      valores: {

        unitario:
          valorUnitario,

        precoEstoque:
          getNumber(
            linha,
            'PREEST'
          ),

        precoBase:
          getNumber(
            linha,
            'PREBAS'
          ),

        bruto:
          valorBruto,

        desconto:
          valorDesconto,

        liquido:
          valorLiquido,

        financeiro:
          getNumber(
            linha,
            'VLRFIN'
          ),

        frete:
          getNumber(
            linha,
            'VLRFRE'
          ),

        seguro:
          getNumber(
            linha,
            'VLRSEG'
          ),

        embalagem:
          getNumber(
            linha,
            'VLREMB'
          ),

        encargos:
          getNumber(
            linha,
            'VLRENC'
          ),

        outros:
          getNumber(
            linha,
            'VLROUT'
          )
      },


      // ======================================================
      // TRIBUTAÇÃO
      // ======================================================

      tributacao: {

        icms: {

          percentual:
            getNumber(
              linha,
              'PERICM'
            ),

          base:
            getNumber(
              linha,
              'VLRBIC'
            ),

          valor:
            getNumber(
              linha,
              'VLRICM'
            )
        },


        ipi: {

          cst:
            getTag(
              linha,
              'CSTIPI'
            ),

          percentual:
            getNumber(
              linha,
              'PERIPI'
            ),

          base:
            getNumber(
              linha,
              'VLRBIP'
            ),

          valor:
            getNumber(
              linha,
              'VLRIPI'
            )
        },


        pis: {

          cst:
            getTag(
              linha,
              'CSTPIS'
            ),

          aliquota:
            getNumber(
              linha,
              'ALIPIS'
            ),

          base:
            getNumber(
              linha,
              'VLRBPI'
            ),

          valor:
            getNumber(
              linha,
              'VLRPIS'
            )
        },


        cofins: {

          cst:
            getTag(
              linha,
              'CSTCOF'
            ),

          aliquota:
            getNumber(
              linha,
              'ALICOF'
            ),

          base:
            getNumber(
              linha,
              'VLRBCF'
            ),

          valor:
            getNumber(
              linha,
              'VLRCFF'
            )
        }
      },


      // ======================================================
      // EVENTUAL VÍNCULO DIRETO COM OC
      // ======================================================

      ordemCompraDireta: {

        filial:
          getNumber(
            linha,
            'FILOCP'
          ),

        numero:
          getNumber(
            linha,
            'NUMOCP'
          ),

        sequencia:
          getNumber(
            linha,
            'SEQIPO'
          )
      },


      // ======================================================
      // AUDITORIA
      // ======================================================

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

    };


    mapaNotas
      .get(chave)
      .itens
      .push(
        itemProduto
      );
  }
}


// ============================================================
// MONTA RESUMO DE CADA NOTA
// ============================================================

const notasProdutos =
  [...mapaNotas.values()]
    .map(nota => {

      const totalBruto =
        nota.itens.reduce(
          (total, item) =>
            total +
            (
              item.valores.bruto ||
              0
            ),
          0
        );

      const totalDesconto =
        nota.itens.reduce(
          (total, item) =>
            total +
            (
              item.valores.desconto ||
              0
            ),
          0
        );

      const totalLiquido =
        nota.itens.reduce(
          (total, item) =>
            total +
            (
              item.valores.liquido ||
              0
            ),
          0
        );

      const totalFinanceiro =
        nota.itens.reduce(
          (total, item) =>
            total +
            (
              item.valores.financeiro ||
              0
            ),
          0
        );


      return {

        ...nota,

        resumo: {

          quantidadeItens:
            nota.itens.length,

          totalBruto:
            Number(
              totalBruto.toFixed(2)
            ),

          totalDesconto:
            Number(
              totalDesconto.toFixed(2)
            ),

          totalLiquido:
            Number(
              totalLiquido.toFixed(2)
            ),

          totalFinanceiro:
            Number(
              totalFinanceiro.toFixed(2)
            )
        }
      };
    });


// ============================================================
// RESUMO GERAL
// ============================================================

const quantidadeItens =
  notasProdutos.reduce(
    (total, nota) =>
      total +
      nota.itens.length,
    0
  );


const totalBrutoGeral =
  notasProdutos.reduce(
    (total, nota) =>
      total +
      (
        nota.resumo.totalBruto ||
        0
      ),
    0
  );


const totalLiquidoGeral =
  notasProdutos.reduce(
    (total, nota) =>
      total +
      (
        nota.resumo.totalLiquido ||
        0
      ),
    0
  );


// ============================================================
// SAÍDA
// ============================================================

return [
  {
    json: {

      notasProdutos,

      resumo: {

        quantidadeNotas:
          notasProdutos.length,

        quantidadeItens,

        totalBruto:
          Number(
            totalBrutoGeral.toFixed(2)
          ),

        totalLiquido:
          Number(
            totalLiquidoGeral.toFixed(2)
          )
      },

      meta: {

        fonte:
          'E440IPC',

        origem:
          'Senior ERP',

        metodo:
          'GetDBInfo'
      }

    }
  }
];
}
