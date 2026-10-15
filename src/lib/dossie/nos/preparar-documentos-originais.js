// @ts-nocheck
// No Code do workflow n8n "Preparar Documentos Originais" (Dossie OC SeniorX v6.4), codigo original sem alteracoes.
// Globais do n8n: $input, $ (como $('Outro no')), $json e items (= $input.all()).
export default async function ($input, $, $json) {
const dossie =
  $('Conciliação Geral OC')
    .first()
    .json;

const notas =
  dossie.documentosFiscais || [];

const documentos = [];

for (const nf of notas) {

  const possuiChave =
    nf?.fiscal?.possuiChaveEletronica === true &&
    nf?.fiscal?.chaveEletronica;

  const natureza =
    nf?.documento?.natureza || null;

  // =====================================================
  // NF-e COM CHAVE
  // =====================================================

  if (possuiChave) {

    documentos.push({

      identificacao: {
        empresa: nf.empresa,
        filial: nf.filial,
        fornecedor: nf.fornecedor,
        numero: nf.numero,
        serie: nf.serie,
        natureza
      },

      documentoFiscal: {
        chaveEletronica:
          nf.fiscal.chaveEletronica,

        emissao:
          nf?.datas?.emissao || null,

        valor:
          nf?.valores?.liquido || 0
      },

      estrategiaIntegracao:
        'EDOCS_NFE_POR_CHAVE',

      arquivosEsperados: [
        {
          tipo: 'XML_NFE',
          obrigatorio: true,
          status: 'PENDENTE_INTEGRACAO'
        },
        {
          tipo: 'DANFE',
          obrigatorio: true,
          status: 'PENDENTE_INTEGRACAO'
        }
      ],

      status:
        'PENDENTE_INTEGRACAO_EDOCS'
    });

    continue;
  }


  // =====================================================
  // DOCUMENTO DE SERVIÇO SEM CHAVE
  // =====================================================

  if (natureza === 'SERVICO') {

    documentos.push({

      identificacao: {
        empresa: nf.empresa,
        filial: nf.filial,
        fornecedor: nf.fornecedor,
        numero: nf.numero,
        serie: nf.serie,
        natureza
      },

      documentoFiscal: {
        chaveEletronica: null,

        emissao:
          nf?.datas?.emissao || null,

        valor:
          nf?.valores?.liquido || 0
      },

      estrategiaIntegracao:
        'EDOCS_NFSE_POR_REFERENCIA',

      parametrosBusca: {
        fornecedor:
          nf.fornecedor,

        numero:
          nf.numero,

        serie:
          nf.serie,

        emissao:
          nf?.datas?.emissao || null,

        valor:
          nf?.valores?.liquido || 0
      },

      arquivosEsperados: [
        {
          tipo: 'PDF_NFSE',
          obrigatorio: true,
          status: 'PENDENTE_INTEGRACAO'
        }
      ],

      status:
        'PENDENTE_INTEGRACAO_EDOCS'
    });

    continue;
  }


  // =====================================================
  // OUTROS CASOS
  // =====================================================

  documentos.push({

    identificacao: {
      empresa: nf.empresa,
      filial: nf.filial,
      fornecedor: nf.fornecedor,
      numero: nf.numero,
      serie: nf.serie,
      natureza
    },

    estrategiaIntegracao:
      'PENDENTE_MAPEAMENTO',

    arquivosEsperados: [],

    status:
      'DOCUMENTO_SEM_ESTRATEGIA_DE_RECUPERACAO'
  });

}


// =====================================================
// RESUMO
// =====================================================

const porChave =
  documentos.filter(
    d =>
      d.estrategiaIntegracao ===
      'EDOCS_NFE_POR_CHAVE'
  ).length;

const porReferencia =
  documentos.filter(
    d =>
      d.estrategiaIntegracao ===
      'EDOCS_NFSE_POR_REFERENCIA'
  ).length;

const pendentesMapeamento =
  documentos.filter(
    d =>
      d.estrategiaIntegracao ===
      'PENDENTE_MAPEAMENTO'
  ).length;


// =====================================================
// SAÍDA
// =====================================================

return [
  {
    json: {

      ordemCompra: {
        empresa:
          dossie
            ?.ordemCompra
            ?.empresa,

        filial:
          dossie
            ?.ordemCompra
            ?.filial,

        numero:
          dossie
            ?.ordemCompra
            ?.numero
      },

      documentosOriginais:
        documentos,

      resumoDocumentosOriginais: {
        quantidade:
          documentos.length,

        nfePorChave:
          porChave,

        nfsePorReferencia:
          porReferencia,

        pendentesMapeamento
      },

      meta: {
        etapa:
          'PREPARACAO_DOCUMENTOS_ORIGINAIS',

        integracao:
          'Senior e-Docs X'
      }
    }
  }
];
}
