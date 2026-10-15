// @ts-nocheck
// No Code do workflow n8n "Preparar Requisição NF-e e-Docs" (Dossie OC SeniorX v6.4), codigo original sem alteracoes.
// Globais do n8n: $input, $ (como $('Outro no')), $json e items (= $input.all()).
export default async function ($input, $, $json) {
// ============================================================
// PREPARAR REQUISIÇÃO NF-e e-DOCS
// Ajustado para receber array ou objeto
// ============================================================


// Recupera documento independente do formato

let documento = null;


if (
  Array.isArray(
    $json.documentosOriginais
  )
) {

  documento =
    $json.documentosOriginais[0];

} else {

  documento =
    $json.documentosOriginais;

}


// Validação inicial

if (!documento) {

  throw new Error(
    'Nenhum documento original encontrado.'
  );

}


// Busca chave eletrônica

const chave =
  documento
    ?.documentoFiscal
    ?.chaveEletronica
    ||
  documento
    ?.fiscal
    ?.chaveEletronica
    ||
  documento
    ?.identificacao
    ?.chaveEletronica
    ||
  null;



if (!chave) {

  throw new Error(
    'Documento NF-e sem chave eletrônica. Documento recebido: '
    +
    JSON.stringify(documento)
  );

}



// Validação tamanho chave NF-e

if (
  !/^\d{44}$/.test(chave)
) {

  throw new Error(
    `Chave NF-e inválida. Valor recebido: ${chave}`
  );

}



// ============================================================
// SAÍDA
// ============================================================


return {

  json: {


    ordemCompra:
      $json.ordemCompra,


    documento: {


      empresa:
        documento
          ?.identificacao
          ?.empresa,


      filial:
        documento
          ?.identificacao
          ?.filial,


      fornecedor:
        documento
          ?.identificacao
          ?.fornecedor,


      numero:
        documento
          ?.identificacao
          ?.numero,


      serie:
        documento
          ?.identificacao
          ?.serie,


      natureza:
        documento
          ?.identificacao
          ?.natureza,


      emissao:
        documento
          ?.documentoFiscal
          ?.emissao
          ||
          null,


      valor:
        documento
          ?.documentoFiscal
          ?.valor
          ||
          0,


      chaveEletronica:
        chave

    },


    requisicoesEdocs: {


      xml: {


        identificador:
          'DOWNLOAD_XML_NFE_ENTRADA',


        metodo:
          'POST',


        endpoint:
          '/t/senior.com.br/bridge/1.0/rest/edocsx_nfe/issuer/actions/downloadNfeIncoming',


        body: {

          accessKey:
            chave,


          xmlType:
            'AUTHORIZED'

        }

      },


      danfe: {


        identificador:
          'GERAR_DANFE_NFE_ENTRADA',


        metodo:
          'POST',


        endpoint:
          '/t/senior.com.br/bridge/1.0/rest/edocsx_nfe/report/signals/generateIncomingDanfe',


        body: {

          accessKey:
            chave,


          forceNew:
            true

        },


        comportamento:
          'ASSINCRONO'

      }


    },


    arquivosEsperados: [

      {

        tipo:
          'XML_NFE',

        status:
          'AGUARDANDO_EXECUCAO_EDOCS'

      },


      {

        tipo:
          'DANFE',

        status:
          'AGUARDANDO_EXECUCAO_EDOCS'

      }

    ],


    meta: {

      etapa:
        'PREPARAR_REQUISICOES_NFE_EDOCS',


      autenticacao:
        'PENDENTE_CLIENT_ID',


      executarChamadas:
        false

    }


  }

};
}
