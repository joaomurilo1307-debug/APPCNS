// @ts-nocheck
// No Code do workflow n8n "Code in JavaScript NFS-e" (Dossie OC SeniorX v6.4), codigo original sem alteracoes.
// Globais do n8n: $input, $ (como $('Outro no')), $json e items (= $input.all()).
export default async function ($input, $, $json) {
// ============================================================
// PREPARAR BUSCA NFS-e e-DOCS
// Senior ERP - e-Docs X
// Versão tolerante
// ============================================================


const documento =
  $json.documentosOriginais;



// ============================================================
// IGNORA DOCUMENTOS QUE NÃO SÃO NFS-e
// ============================================================

if (
  !documento ||
  documento.estrategiaIntegracao !==
  'EDOCS_NFSE_POR_REFERENCIA'
) {


  return [

    {

      json: {

        ignorado: true,

        motivo:
          "DOCUMENTO_NAO_E_NFSE",

        estrategiaRecebida:
          documento?.estrategiaIntegracao
          ||
          null,


        meta: {

          etapa:
          "PREPARAR_BUSCA_NFSE_EDOCS",

          status:
          "IGNORADO"

        }

      }

    }

  ];

}



// ============================================================
// DADOS NFS-e
// ============================================================


const identificacao =
  documento.identificacao || {};


const parametros =
  documento.parametrosBusca || {};



// ============================================================
// VALIDAÇÕES
// ============================================================


if (!identificacao.numero) {

  throw new Error(
    "NFS-e sem número identificado."
  );

}


if (!identificacao.fornecedor) {

  throw new Error(
    "NFS-e sem fornecedor identificado."
  );

}



// ============================================================
// SAÍDA
// ============================================================


return [

{

json:{


ordemCompra:

$json.ordemCompra,



documento:{


empresa:
identificacao.empresa,


filial:
identificacao.filial,


fornecedor:
identificacao.fornecedor,


numero:
identificacao.numero,


serie:
identificacao.serie,


natureza:
identificacao.natureza,


emissao:
documento.documentoFiscal?.emissao || null,


valor:
documento.documentoFiscal?.valor || 0,


chaveEletronica:
null



},



buscaEdocs:{


estrategia:
"NFSE_POR_REFERENCIA",



criterios:{


empresa:
identificacao.empresa,


filial:
identificacao.filial,


fornecedor:
parametros.fornecedor
||
identificacao.fornecedor,


numero:
parametros.numero
||
identificacao.numero,


serie:
parametros.serie
||
identificacao.serie,


emissao:
parametros.emissao
||
documento.documentoFiscal?.emissao
||
null,


valor:
parametros.valor
||
documento.documentoFiscal?.valor
||
0


},



endpointMapeado:
false,


motivo:

"REQUISICAO_NFSE_EDOCS_AINDA_NAO_MAPEADA"


},



arquivosEsperados:[

{

tipo:
"PDF_NFSE",

obrigatorio:
true,

status:
"AGUARDANDO_MAPEAMENTO_EDOCS"

}

],



meta:{


etapa:
"PREPARAR_BUSCA_NFSE_EDOCS",


executarChamadas:
false


}



}


}

];
}
