// @ts-nocheck
// No Code do workflow n8n "Consolidar Dossiê Final" (Dossie OC SeniorX v6.4), codigo original sem alteracoes.
// Globais do n8n: $input, $ (como $('Outro no')), $json e items (= $input.all()).
export default async function ($input, $, $json) {
// ============================================================
// CONSOLIDAÇÃO FINAL DO DOSSIÊ — v4
// Senior ERP + e-Docs X
//
// v4 corrige duas origens de dados:
//   1) historicoFornecedor vinha de "Conciliação Geral OC", que roda
//      ANTES do histórico e por isso nunca tem a chave — o dossiê
//      caía sempre no default vazio. Agora lê do nó que realmente
//      consolida o histórico, com fallbacks.
//   2) passa a propagar o cadastro do fornecedor (código + razão
//      social), consumido pelo "Gerar HTML do Dossiê".
// ============================================================

const arr = (v) => (Array.isArray(v) ? v : []);
const obj = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});

/** Lê o json do primeiro item de um nó anterior sem quebrar se ele não existir. */
function doNo(nome) {
  try {
    return obj($(nome).first().json);
  } catch (e) {
    return {};
  }
}

// ============================================================
// BASE PRINCIPAL DA OC
// ============================================================

const dossieBase = doNo('Conciliação Geral OC');

// ============================================================
// FORNECEDOR (código + razão social)
// ============================================================

const cadastroFornecedor = (() => {
  const doNoFornecedor = obj(doNo('Normalizar Fornecedor').fornecedor);
  if (Object.keys(doNoFornecedor).length) return doNoFornecedor;

  const doModelo = obj(doNo('Montar Modelo Dossiê OC').dossieOC?.fornecedor);
  if (Object.keys(doModelo).length) return doModelo;

  const daOC = dossieBase.ordemCompra?.fornecedor;
  if (daOC && typeof daOC === 'object') return daOC;
  if (daOC !== undefined && daOC !== null) return { codigo: daOC };

  return {};
})();

// ============================================================
// ENTRADA DA EXECUÇÃO
//
// Guarda como o dossiê foi disparado. No modo 201 traz o número do
// título informado — é ele que nomeia o documento e aparece ao lado
// da OC no cabeçalho.
// ============================================================

const entradaExecucao = (() => {
  for (const nome of ['Entrada por Título', 'Entrada OC']) {
    const j = doNo(nome);
    if (Object.keys(j).length) {
      return {
        modo: j.numTit ? 'TITULO' : 'ORDEM_COMPRA',
        numeroTitulo: j.numTit ?? null,
        ordemCompra: j.numOcp ?? null,
        origem: j.origem ?? 'MANUAL',
      };
    }
  }
  return { modo: 'ORDEM_COMPRA', numeroTitulo: null, ordemCompra: null, origem: 'MANUAL' };
})();

// ============================================================
// HISTÓRICO DO FORNECEDOR
// ============================================================

const HISTORICO_VAZIO = {
  historicoPagamentoFornecedor: [],
  indicadoresFornecedor: {},
  resumo: {},
  alertasPagamento: [],
};

const historicoFornecedor = (() => {
  // 1) modelo consolidado (já traz o bloco montado)
  const doModelo = obj(doNo('Montar Modelo Dossiê OC').dossieOC?.historicoFornecedor);
  if (arr(doModelo.historicoPagamentoFornecedor).length) return doModelo;

  // 2) direto do nó de histórico (formato analítico, chaves na raiz)
  const doHistorico = doNo('Consolidar Histórico Pagamento Fornecedor');
  if (arr(doHistorico.historicoPagamentoFornecedor).length) {
    return {
      historicoPagamentoFornecedor: doHistorico.historicoPagamentoFornecedor,
      indicadoresFornecedor: obj(doHistorico.indicadoresFornecedor),
      resumo: obj(doHistorico.resumo),
      alertasPagamento: arr(doHistorico.alertasPagamento),
    };
  }

  // 3) fallbacks antigos
  if (obj(dossieBase.historicoFornecedor).historicoPagamentoFornecedor) {
    return dossieBase.historicoFornecedor;
  }

  return HISTORICO_VAZIO;
})();

// ============================================================
// ENTRADA DOCUMENTAL (e-Docs)
// ============================================================

const entradaDocumental = obj($input.first().json);
const documentosEntrada = arr(entradaDocumental.documentosOriginais);

const documentosOriginais = [];

for (const doc of documentosEntrada) {
  const identificacao = obj(doc.identificacao);
  const chaveEletronica = doc.chaveEletronica || identificacao.chaveEletronica || null;

  if (doc.tipo === 'NFE') {
    documentosOriginais.push({
      tipo: 'NFE',
      identificacao,
      estrategia: doc.estrategia || 'EDOCS_NFE_POR_CHAVE',
      chaveEletronica,
      emissao: doc.emissao || identificacao.emissao || null,
      valor: doc.valor || identificacao.valor || 0,
      arquivos: [
        { tipo: 'XML_NFE', status: 'PENDENTE_INTEGRACAO', disponivel: false },
        { tipo: 'DANFE', status: 'PENDENTE_INTEGRACAO', disponivel: false },
      ],
      statusDocumental: 'PENDENTE_INTEGRACAO',
    });
  }

  if (doc.tipo === 'NFSE') {
    documentosOriginais.push({
      tipo: 'NFSE',
      identificacao,
      estrategia: doc.estrategia || 'EDOCS_NFSE_POR_REFERENCIA',
      criteriosBusca: doc.buscaEdocs?.criterios || null,
      emissao: doc.emissao || identificacao.emissao || null,
      valor: doc.valor || identificacao.valor || 0,
      arquivos: [
        { tipo: 'PDF_NFSE', status: 'PENDENTE_INTEGRACAO', disponivel: false },
      ],
      statusDocumental: 'PENDENTE_INTEGRACAO',
    });
  }
}

// ============================================================
// RESUMO DOCUMENTAL
// ============================================================

const quantidadeDocumentos = documentosOriginais.length;
const quantidadeNFe = documentosOriginais.filter((d) => d.tipo === 'NFE').length;
const quantidadeNFSe = documentosOriginais.filter((d) => d.tipo === 'NFSE').length;

const quantidadeArquivosEsperados = documentosOriginais.reduce(
  (total, d) => total + arr(d.arquivos).length,
  0,
);

const quantidadeArquivosDisponiveis = documentosOriginais.reduce(
  (total, d) => total + arr(d.arquivos).filter((a) => a.disponivel === true).length,
  0,
);

const quantidadeArquivosPendentes =
  quantidadeArquivosEsperados - quantidadeArquivosDisponiveis;

// ============================================================
// STATUS E CHECKLIST
// ============================================================

const statusDossie =
  quantidadeArquivosPendentes > 0 ? 'PRONTO_COM_PENDENCIA_DOCUMENTAL' : 'PRONTO';

const checklist = {
  ordemCompra: !!dossieBase.ordemCompra,
  fornecedor: !!cadastroFornecedor.razaoSocial,
  produtos: arr(dossieBase.produtos).length > 0,
  servicos: arr(dossieBase.servicos).length > 0,
  rateios: arr(dossieBase.rateios).length > 0,
  aprovacao: arr(obj(dossieBase.aprovacao).controle?.niveis).length > 0,
  financeiro: arr(obj(dossieBase.financeiro).titulos).length > 0,
  historicoFornecedor: arr(historicoFornecedor.historicoPagamentoFornecedor).length > 0,
  documentosOriginais: quantidadeDocumentos > 0,
};

// ============================================================
// SAÍDA FINAL
// ============================================================

return [
  {
    json: {
      identificacao: {
        projeto: 'DOSSIE_OC',
        empresa: dossieBase?.ordemCompra?.empresa,
        filial: dossieBase?.ordemCompra?.filial,
        ordemCompra: dossieBase?.ordemCompra?.numero,
        fornecedor: cadastroFornecedor.codigo ?? null,
        titulo: entradaExecucao.numeroTitulo,
      },
      statusDossie,

      entrada: entradaExecucao,
      fornecedor: cadastroFornecedor,

      ordemCompra: dossieBase.ordemCompra || {},
      produtos: dossieBase.produtos || [],
      servicos: dossieBase.servicos || [],
      rateios: dossieBase.rateios || [],
      aprovacao: dossieBase.aprovacao || {},
      documentosFiscais: dossieBase.documentosFiscais || [],
      financeiro: dossieBase.financeiro || {},
      validacoes: dossieBase.validacoes || [],
      alertas: dossieBase.alertas || [],

      // statusConferencia / statusFinanceiro / statusDocumental e os
      // totalizadores vivem aqui — o cabeçalho do dossiê depende deles.
      resumo: dossieBase.resumo || {},

      historicoFornecedor,

      documentosOriginais,
      resumoDocumental: {
        documentosFiscais: quantidadeDocumentos,
        quantidadeDocumentos,
        quantidadeNFe,
        quantidadeNFSe,
        arquivosEsperados: quantidadeArquivosEsperados,
        arquivosDisponiveis: quantidadeArquivosDisponiveis,
        arquivosPendentes: quantidadeArquivosPendentes,
      },
      checklist,

      meta: {
        versaoDossie: '4.2',
        origemEstruturada: 'Senior ERP',
        origemDocumental: 'Senior e-Docs X',
        integracaoDocumental:
          quantidadeArquivosPendentes > 0 ? 'PENDENTE' : 'CONCLUIDA',
      },
    },
  },
];
}
