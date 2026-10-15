// @ts-nocheck
// No Code do workflow n8n "Montar SQL Referências Financeiras Histórico" (Dossie OC SeniorX v6.4), codigo original sem alteracoes.
// Globais do n8n: $input, $ (como $('Outro no')), $json e items (= $input.all()).
export default async function ($input, $, $json) {
// ============================================================
// MONTAR SQL - REFERÊNCIAS FINANCEIRAS DO HISTÓRICO
//
// Entrada:
//   Normalizar Últimas 3 Compras
//
// Objetivo:
//   Buscar na E420OCP os títulos e referências fiscais
//   das 3 compras anteriores selecionadas.
// ============================================================


// ============================================================
// 1. ENTRADA
// ============================================================

const dados = $json;

const codEmp =
  Number(
    dados?.identificacao?.empresa
  );

const codFor =
  Number(
    dados?.identificacao?.fornecedor
  );

const ocsSelecionadas =
  Array.isArray(dados?.ocsSelecionadas)
    ? dados.ocsSelecionadas
    : [];


// ============================================================
// 2. VALIDAÇÕES
// ============================================================

if (
  !Number.isInteger(codEmp) ||
  codEmp <= 0
) {
  throw new Error(
    'CODEMP inválido para montar consulta financeira histórica.'
  );
}

if (
  !Number.isInteger(codFor) ||
  codFor <= 0
) {
  throw new Error(
    'CODFOR inválido para montar consulta financeira histórica.'
  );
}

if (
  ocsSelecionadas.length === 0
) {
  throw new Error(
    'Nenhuma OC histórica foi selecionada.'
  );
}


// ============================================================
// 3. SANITIZA NÚMEROS DAS OCs
// ============================================================

const ocsValidas =
  ocsSelecionadas
    .map(Number)
    .filter(
      numero =>
        Number.isInteger(numero) &&
        numero > 0
    );

if (
  ocsValidas.length === 0
) {
  throw new Error(
    'Lista de OCs históricas não contém números válidos.'
  );
}


// remove eventual duplicidade
const ocsUnicas =
  [...new Set(ocsValidas)];

const listaOcsSql =
  ocsUnicas.join(',');


// ============================================================
// 4. MONTA SQL
// ============================================================

const sql = `
SELECT
    CODEMP,
    CODFIL,
    NUMOCP,
    CODFOR,
    DATEMI,
    DATGER,
    HORGER,
    VLRLIQ,
    VLRFIN,
    USU_NUMNFC,
    USU_NUMTIT
FROM E420OCP
WHERE CODEMP = ${codEmp}
  AND CODFOR = ${codFor}
  AND NUMOCP IN (${listaOcsSql})
ORDER BY DATGER DESC, HORGER DESC, NUMOCP DESC
`.trim();


// ============================================================
// 5. RETORNO
// ============================================================

return [
  {
    json: {

      ...dados,

      consultaReferenciasFinanceiras: {

        empresa:
          codEmp,

        fornecedor:
          codFor,

        ocs:
          ocsUnicas,

        listaOcsSql:
          listaOcsSql,

        sql:
          sql
      },

      metaSqlFinanceiroHistorico: {

        etapa:
          'SQL_REFERENCIAS_FINANCEIRAS_HISTORICO',

        tabela:
          'E420OCP',

        dinamico:
          true
      }
    }
  }
];
}
