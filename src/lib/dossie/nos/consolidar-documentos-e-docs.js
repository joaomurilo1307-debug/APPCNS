// @ts-nocheck
// No Code do workflow n8n "Consolidar Documentos e-DOCS" (Dossie OC SeniorX v6.4), codigo original sem alteracoes.
// Globais do n8n: $input, $ (como $('Outro no')), $json e items (= $input.all()).
export default async function ($input, $, $json) {
// ============================================================
// CONSOLIDAR DOCUMENTOS e-DOCS
// Senior ERP + e-Docs X
// Versão 2.0
// Classificação fiscal inteligente
// ============================================================


const entradas = $input.all();


const documentos = [];

let ordemCompra = {};



// ============================================================
// PROCESSAMENTO
// ============================================================


for (const item of entradas) {


  const dados = item.json;


  if (
    dados.ordemCompra
  ) {

    ordemCompra =
      dados.ordemCompra;

  }



  const doc =
    dados.documento || {};



  const natureza =
    doc.natureza
    ||
    doc.identificacao?.natureza
    ||
    null;



  const chave =
    doc.chaveEletronica
    ||
    null;



  // ==========================================================
  // IDENTIFICA NFS-e PRIMEIRO
  // ==========================================================


  if (
    natureza === "SERVICO"
    ||
    !chave
  ) {


    documentos.push({

      tipo:
        "NFSE",


      identificacao:
        doc,


      estrategia:
        "EDOCS_NFSE_POR_REFERENCIA",


      buscaEdocs: {

        estrategia:
          "NFSE_POR_REFERENCIA",


        criterios: {

          empresa:
            doc.empresa,

          filial:
            doc.filial,

          fornecedor:
            doc.fornecedor,

          numero:
            doc.numero,

          serie:
            doc.serie,

          emissao:
            doc.emissao,

          valor:
            doc.valor

        }

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


      status:
        "PENDENTE_INTEGRACAO"

    });


    continue;

  }



  // ==========================================================
  // NF-e
  // ==========================================================


  documentos.push({

    tipo:
      "NFE",


    identificacao:
      doc,


    estrategia:
      "EDOCS_NFE_POR_CHAVE",


    requisicoesEdocs:
      dados.requisicoesEdocs,


    arquivosEsperados:[

      {

        tipo:
          "XML_NFE",

        status:
          "AGUARDANDO_EXECUCAO_EDOCS"

      },

      {

        tipo:
          "DANFE",

        status:
          "AGUARDANDO_EXECUCAO_EDOCS"

      }

    ],


    status:
      "PENDENTE_INTEGRACAO"

  });



}



// ============================================================
// RESUMO
// ============================================================


const resumo = {


 quantidadeDocumentos:
   documentos.length,


 quantidadeNFe:
   documentos.filter(
     d=>d.tipo==="NFE"
   ).length,


 quantidadeNFSe:
   documentos.filter(
     d=>d.tipo==="NFSE"
   ).length,


 quantidadeOutros:
   documentos.filter(
     d=>d.tipo==="OUTRO"
   ).length,


 quantidadeArquivosEsperados:
   documentos.reduce(
     (soma,d)=>
       soma +
       d.arquivosEsperados.length,
     0
   )


};



// ============================================================
// SAÍDA
// ============================================================


return [

{

json:{


ordemCompra,


documentosOriginais:
  documentos,


resumoDocumentosOriginais:
  resumo,


meta:{

 etapa:
 "CONSOLIDAR_DOCUMENTOS_EDOCS",

 origem:
 "Senior ERP + e-Docs X",

 versao:
 "2.0"

}


}

}

];
}
