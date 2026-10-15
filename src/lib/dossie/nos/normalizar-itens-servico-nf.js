// @ts-nocheck
// No Code do workflow n8n "Normalizar Itens Serviço NF" (Dossie OC SeniorX v6.4), codigo original sem alteracoes.
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

function chaveNota({
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
// AGRUPAMENTO
// ============================================================

const mapaNotas =
  new Map();

for (const item of items) {

  const xml =
    item.json.itensServicoXml ||
    item.json.notaFiscalXml ||
    '';

  const linhas = [
    ...xml.matchAll(
      /<line>([\s\S]*?)<\/line>/gi
    )
  ].map(
    match => match[1]
  );


  for (const linha of linhas) {

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
      chaveNota(
        identificacao
      );


    if (
      !mapaNotas.has(chave)
    ) {

      mapaNotas.set(
        chave,
        {

          chave,

          ...identificacao,

          tipo:
            'SERVICO',

          itens: []
        }
      );
    }


    mapaNotas
      .get(chave)
      .itens
      .push({

        sequencia:
          getNumber(
            linha,
            'SEQISC'
          ),

        servico: {

          codigo:
            getTag(
              linha,
              'CODSER'
            ),

          descricao:
            getTag(
              linha,
              'CPLISC'
            ),

          familia:
            getTag(
              linha,
              'CODFAM'
            )
        },

        operacao: {

          transacao:
            getTag(
              linha,
              'TNSSER'
            ),

          naturezaOperacao:
            getTag(
              linha,
              'NOPSER'
            )
        },

        quantidade: {

          recebida:
            getNumber(
              linha,
              'QTDREC'
            ),

          unidade:
            getTag(
              linha,
              'UNIMED'
            )
        },

        valores: {

          unitario:
            getNumber(
              linha,
              'PREUNI'
            ),

          bruto:
            getNumber(
              linha,
              'VLRBRU'
            ),

          desconto:
            getNumber(
              linha,
              'VLRDSC'
            ),

          liquido:
            getNumber(
              linha,
              'VLRLIQ'
            ),

          financeiro:
            getNumber(
              linha,
              'VLRFIN'
            )
        },

        tributacao: {

          iss: {

            percentual:
              getNumber(
                linha,
                'PERISS'
              ),

            base:
              getNumber(
                linha,
                'VLRBIS'
              ),

            valor:
              getNumber(
                linha,
                'VLRISS'
              )
          },

          irrf: {

            percentual:
              getNumber(
                linha,
                'PERIRF'
              ),

            base:
              getNumber(
                linha,
                'VLRBIR'
              ),

            valor:
              getNumber(
                linha,
                'VLRIRF'
              )
          },

          inss: {

            percentual:
              getNumber(
                linha,
                'PERINS'
              ),

            base:
              getNumber(
                linha,
                'VLRBIN'
              ),

            valor:
              getNumber(
                linha,
                'VLRINS'
              )
          },

          pis: {

            cst:
              getTag(
                linha,
                'CSTPIS'
              ),

            percentual:
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

            percentual:
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

        auditoria: {

          usuarioGerador:
            getNumber(
              linha,
              'USUGER'
            ),

          dataGeracao:
            getTag(
              linha,
              'DATGER'
            ),

          horaSenior:
            getNumber(
              linha,
              'HORGER'
            )
        }

      });
  }
}


// ============================================================
// RESUMO
// ============================================================

const notasServicos = [
  ...mapaNotas.values()
].map(nota => {

  const totalBruto =
    nota.itens.reduce(
      (soma, item) =>
        soma +
        (
          item
            .valores
            .bruto || 0
        ),
      0
    );

  const totalDesconto =
    nota.itens.reduce(
      (soma, item) =>
        soma +
        (
          item
            .valores
            .desconto || 0
        ),
      0
    );

  const totalLiquido =
    nota.itens.reduce(
      (soma, item) =>
        soma +
        (
          item
            .valores
            .liquido || 0
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
          totalBruto
            .toFixed(2)
        ),

      totalDesconto:
        Number(
          totalDesconto
            .toFixed(2)
        ),

      totalLiquido:
        Number(
          totalLiquido
            .toFixed(2)
        )
    }
  };
});


return [
  {
    json: {

      notasServicos,

      resumo: {

        quantidadeNotas:
          notasServicos.length,

        quantidadeItens:
          notasServicos.reduce(
            (soma, nota) =>
              soma +
              nota.itens.length,
            0
          )
      },

      meta: {

        fonte:
          'E440ISC',

        origem:
          'Senior ERP',

        metodo:
          'GetDBInfo'
      }
    }
  }
];
}
