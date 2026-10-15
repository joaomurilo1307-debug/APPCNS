// @ts-nocheck
// No Code do workflow n8n "Preparar Títulos Histórico E501TCP" (Dossie OC SeniorX v6.4), codigo original sem alteracoes.
// Globais do n8n: $input, $ (como $('Outro no')), $json e items (= $input.all()).
export default async function ($input, $, $json) {
// ============================================================
// PREPARAR TÍTULOS HISTÓRICOS - E501TCP
//
// Entrada:
//   Normalizar Referências Financeiras Histórico
//
// Saída:
//   1 item do n8n por título financeiro.
//
// Finalidade:
//   Consultar o estado ATUAL de cada título na E501TCP.
//
// Regra:
//   E501TCP = situação financeira atual.
//   Não usar E501MCP.VLRABE como saldo atual.
// ============================================================


// ============================================================
// 1. ENTRADA
// ============================================================

const origem = $input.first().json;

const titulos =
  Array.isArray(origem?.titulosParaConsulta)
    ? origem.titulosParaConsulta
    : [];

if (titulos.length === 0) {
  throw new Error(
    'Nenhum título histórico disponível para consulta na E501TCP.'
  );
}


// ============================================================
// 2. FUNÇÕES AUXILIARES
// ============================================================

function inteiro(valor, campo) {

  const numero =
    Number(valor);

  if (
    !Number.isInteger(numero) ||
    numero <= 0
  ) {
    throw new Error(
      `${campo} inválido: ${valor}`
    );
  }

  return numero;
}


// ------------------------------------------------------------
// Escapa string para literal SQL.
// Mesmo que os títulos venham do ERP, fazemos a proteção.
// ------------------------------------------------------------

function sqlString(valor) {

  return String(valor ?? '')
    .replace(/'/g, "''");
}


// ============================================================
// 3. GERA UM ITEM PARA CADA TÍTULO
// ============================================================

return titulos.map(
  titulo => {

    const codEmp =
      inteiro(
        titulo.empresa,
        'CODEMP'
      );

    const codFil =
      inteiro(
        titulo.filial,
        'CODFIL'
      );

    const codFor =
      inteiro(
        titulo.fornecedor,
        'CODFOR'
      );

    const numOcp =
      inteiro(
        titulo.ordemCompra,
        'NUMOCP histórico'
      );

    const ordemHistorico =
      inteiro(
        titulo.ordemHistorico,
        'Ordem do histórico'
      );


    const numTit =
      String(
        titulo.numeroTitulo ?? ''
      ).trim();

    if (!numTit) {
      throw new Error(
        `Título não informado para a OC ${numOcp}.`
      );
    }


    const numTitSql =
      sqlString(numTit);


    // ========================================================
    // SQL E501TCP
    // ========================================================

    const sql = `
SELECT
    CODEMP,
    CODFIL,
    NUMTIT,
    CODTPT,
    CODFOR,
    SITTIT,
    DATEMI,
    VCTORI,
    VCTPRO,
    VLRORI,
    VLRABE,
    ULTPGT,
    FILNFC,
    FORNFC,
    NUMNFC,
    SNFNFC
FROM E501TCP
WHERE CODEMP = ${codEmp}
  AND CODFIL = ${codFil}
  AND CODFOR = ${codFor}
  AND NUMTIT = '${numTitSql}'
`.trim();


    // ========================================================
    // SAÍDA
    // ========================================================

    return {
      json: {

        contextoHistorico: {

          empresa:
            codEmp,

          filial:
            codFil,

          fornecedor:
            codFor,

          ordemCompra:
            numOcp,

          ordemHistorico:
            ordemHistorico,

          valorCompra:
            Number(
              titulo.valorCompra ?? 0
            ),

          emissaoCompra:
            titulo.emissaoCompra || null,

          notaFiscalInformada:
            titulo.notaFiscalInformada || null
        },


        tituloConsulta: {

          numero:
            numTit,

          sequenciaNaCompra:
            Number(
              titulo.sequenciaTituloNaCompra ?? 0
            ),

          chave:
            titulo.chaveConsulta || [
              codEmp,
              codFil,
              codFor,
              numTit
            ].join('|')
        },


        sqlTituloAtual:
          sql,


        meta: {

          etapa:
            'PREPARAR_TITULO_HISTORICO_E501TCP',

          fonte:
            'E501TCP',

          finalidade:
            'ESTADO_FINANCEIRO_ATUAL'
        }
      }
    };
  }
);
}
