// @ts-nocheck
// No Code do workflow n8n "Montar SQL Histórico Fornecedor" (Dossie OC SeniorX v6.4), codigo original sem alteracoes.
// Globais do n8n: $input, $ (como $('Outro no')), $json e items (= $input.all()).
export default async function ($input, $, $json) {
// ============================================================
// MONTAR SQL - HISTÓRICO DO FORNECEDOR
// ============================================================

const codEmp = Number($json.codEmp);
const codFor = Number($json.codFor);

if (!Number.isInteger(codEmp) || codEmp <= 0) {
  throw new Error('CODEMP inválido para consulta do histórico.');
}

if (!Number.isInteger(codFor) || codFor <= 0) {
  throw new Error('CODFOR inválido para consulta do histórico.');
}

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
    SITAPR,
    SITOCP
FROM E420OCP
WHERE CODEMP = ${codEmp}
  AND CODFOR = ${codFor}
ORDER BY DATGER DESC, HORGER DESC, NUMOCP DESC
`.trim();

return [
  {
    json: {
      ...$json,

      sqlHistoricoFornecedor: sql,

      metaSql: {
        etapa: 'SQL_HISTORICO_FORNECEDOR',
        tabela: 'E420OCP',
        empresa: codEmp,
        fornecedor: codFor,
        dinamico: true
      }
    }
  }
];
}
