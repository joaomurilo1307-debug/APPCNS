// @ts-nocheck
// No Code do workflow n8n "Preparar Histórico Fornecedor" (Dossie OC SeniorX v6.4), codigo original sem alteracoes.
// Globais do n8n: $input, $ (como $('Outro no')), $json e items (= $input.all()).
export default async function ($input, $, $json) {
// ============================================================
// PREPARAR HISTÓRICO DO FORNECEDOR
// Origem: Normalizar Cabeçalho OC
// ============================================================

const d =
  $json;

const oc =
  d?.ordemCompra || {};

const codEmp =
  Number(oc?.empresa);

const codFil =
  Number(oc?.filial);

const numOcpAtual =
  Number(oc?.numero);

const codFor =
  Number(
    oc?.fornecedor?.codigo
  );


// ============================================================
// VALIDAÇÕES
// ============================================================

if (
  !Number.isFinite(codEmp) ||
  codEmp <= 0
) {
  throw new Error(
    'Empresa da OC não identificada.'
  );
}

if (
  !Number.isFinite(codFil) ||
  codFil <= 0
) {
  throw new Error(
    'Filial da OC não identificada.'
  );
}

if (
  !Number.isFinite(numOcpAtual) ||
  numOcpAtual <= 0
) {
  throw new Error(
    'Número da OC atual não identificado.'
  );
}

if (
  !Number.isFinite(codFor) ||
  codFor <= 0
) {
  throw new Error(
    'Fornecedor da OC não identificado.'
  );
}


// ============================================================
// SAÍDA
// ============================================================

return [
  {
    json: {

      codEmp,

      codFil,

      numOcpAtual,

      codFor,

      ocAtual: {

        empresa:
          codEmp,

        filial:
          codFil,

        numero:
          numOcpAtual,

        fornecedor:
          codFor,

        emissao:
          oc?.emissao || null,

        vencimento:
          oc
            ?.camposCustomizados
            ?.vencimento || null
      },

      historico: {

        quantidadeDesejada:
          3,

        considerarOutrasFiliais:
          true,

        somenteAnteriores:
          true
      },

      meta: {

        etapa:
          'PREPARAR_HISTORICO_FORNECEDOR',

        fonte:
          'Normalizar Cabeçalho OC'
      }
    }
  }
];
}
