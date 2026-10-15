// @ts-nocheck
// No Code do workflow n8n "Consolidar Histórico Pagamento Fornecedor" (Dossie OC SeniorX v6.4), codigo original sem alteracoes.
// Globais do n8n: $input, $ (como $('Outro no')), $json e items (= $input.all()).
export default async function ($input, $, $json, items) {
// ============================================================
// CONSOLIDAR HISTÓRICO PAGAMENTO FORNECEDOR — v2
// Senior ERP | E420OCP + E501TCP
//
// PROBLEMA CORRIGIDO NESTA VERSÃO
// -------------------------------
// A v1 lia "financeiro.titulosMovimentacao" do item de entrada —
// que é a saída da Conciliação Geral OC, ou seja, os títulos DA
// PRÓPRIA OC em análise. O resultado era um "histórico" que
// espelhava a compra atual e um indicador de liquidação que sempre
// dava 100% / BOM PAGADOR, sem valor de auditoria.
//
// A v2 consome a cadeia que já existia no fluxo e nunca era usada:
//   Normalizar Últimas 3 Compras          -> OCs anteriores
//   Normalizar Referências Financeiras    -> NF/título de cada OC
//   Normalizar Títulos Histórico E501TCP  -> estado financeiro real
//
// A OC atual é explicitamente excluída.
// ============================================================

const arr = (v) => (Array.isArray(v) ? v : []);
const obj = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});

function doNo(nome) {
  try {
    return obj($(nome).first().json);
  } catch (e) {
    return {};
  }
}

// ============================================================
// IDENTIFICAÇÃO
// ============================================================

const dadosEntrada = obj(items[0]?.json);
const preparacao = doNo('Preparar Histórico Fornecedor');
const ultimasCompras = doNo('Normalizar Últimas 3 Compras');

const identificacao = {
  empresa:
    dadosEntrada.ordemCompra?.empresa ??
    preparacao.codEmp ??
    ultimasCompras.identificacao?.empresa ??
    null,
  filial: dadosEntrada.ordemCompra?.filial ?? preparacao.codFil ?? null,
  fornecedor:
    dadosEntrada.ordemCompra?.fornecedor?.codigo ??
    dadosEntrada.ordemCompra?.fornecedor ??
    preparacao.codFor ??
    null,
  ordemCompraAtual:
    dadosEntrada.ordemCompra?.numero ?? preparacao.numOcpAtual ?? null,
};

const ordemCompraAtual = Number(identificacao.ordemCompraAtual);

// ============================================================
// FONTES DO HISTÓRICO
// ============================================================

const comprasAnteriores = arr(ultimasCompras.comprasAnteriores);
const referencias = doNo('Normalizar Referências Financeiras Histórico');
const comprasComReferencia = arr(referencias.compras);
const titulosHistorico = arr(doNo('Normalizar Títulos Histórico E501TCP').titulos);

/** Índice: número da OC histórica -> compra com referências de NF/título. */
const referenciaPorOc = new Map(
  comprasComReferencia.map((c) => [Number(c.numero ?? c.ordemCompra), c]),
);

/** Índice: número da OC histórica -> títulos E501TCP daquela OC. */
const titulosPorOc = new Map();
for (const titulo of titulosHistorico) {
  const oc = Number(titulo.contextoHistorico?.ordemCompra);
  if (!Number.isFinite(oc)) continue;
  if (!titulosPorOc.has(oc)) titulosPorOc.set(oc, []);
  titulosPorOc.get(oc).push(titulo);
}

// ============================================================
// UTILITÁRIOS DE DATA
// ============================================================

/**
 * O Senior grava data nula como sentinela — 31/12/1900 e 30/12/1899
 * são os valores que aparecem em ULTPGT quando não houve pagamento.
 * Tratá-las como data real produzia "prazo médio de -22939 dias".
 */
function dataValida(iso) {
  if (!iso) return false;
  const ano = Number(String(iso).substring(0, 4));
  return Number.isFinite(ano) && ano >= 1950 && ano <= 2100;
}

function paraData(iso) {
  if (!dataValida(iso)) return null;
  const m = String(iso).substring(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
}

/** Dias entre duas datas; descarta resultados impossíveis para uma compra. */
function diasEntre(inicioIso, fimIso) {
  const inicio = paraData(inicioIso);
  const fim = paraData(fimIso);
  if (!inicio || !fim) return null;
  const dias = Math.round((fim - inicio) / 86400000);
  if (dias < 0 || dias > 3650) return null;
  return dias;
}

function maiorData(datas) {
  const validas = datas.filter(dataValida).sort();
  return validas.length ? validas[validas.length - 1] : null;
}

// ============================================================
// MONTAGEM DO HISTÓRICO — UMA LINHA POR COMPRA ANTERIOR
// ============================================================

const historicoPagamentoFornecedor = [];

for (const compra of comprasAnteriores) {
  const numeroOc = Number(compra.numero);

  // Trava de segurança: a OC em análise nunca entra no próprio histórico.
  if (!Number.isFinite(numeroOc) || numeroOc === ordemCompraAtual) continue;

  const referencia = obj(referenciaPorOc.get(numeroOc));
  const titulosDaCompra = titulosPorOc.get(numeroOc) || [];

  const emissaoBruta =
    compra.emissao ||
    referencia.emissao ||
    titulosDaCompra[0]?.contextoHistorico?.emissaoCompra ||
    null;

  const emissao = dataValida(emissaoBruta) ? emissaoBruta : null;

  const valor = Number(
    compra.valores?.liquido ??
      referencia.valores?.liquido ??
      titulosDaCompra.reduce((s, t) => s + Number(t.financeiro?.valorOriginal || 0), 0),
  );

  const dataPagamento = maiorData(
    titulosDaCompra.map((t) => t.pagamento?.ultimoPagamento),
  );

  const totalTitulos = titulosDaCompra.length;
  const liquidados = titulosDaCompra.filter(
    (t) => t.financeiro?.situacaoCodigo === 'LQ',
  ).length;

  const saldoAberto = titulosDaCompra.reduce(
    (s, t) => s + Number(t.financeiro?.saldoAberto || 0),
    0,
  );

  const situacao =
    totalTitulos === 0
      ? 'SEM_TITULO'
      : liquidados === totalTitulos
        ? 'LIQUIDADO'
        : liquidados > 0
          ? 'PARCIALMENTE_LIQUIDADO'
          : 'EM_ABERTO';

  const primeiro = titulosDaCompra[0];

  historicoPagamentoFornecedor.push({
    ordemHistorico: compra.ordemHistorico ?? null,
    ordemCompra: numeroOc,
    emissao,
    notaFiscal: {
      numero:
        referencia.notaFiscalInformada ??
        primeiro?.documento?.numeroNF ??
        primeiro?.contextoHistorico?.notaFiscalInformada ??
        null,
      serie: primeiro?.documento?.serieNF ?? null,
    },
    titulo: {
      numero: primeiro?.identificacao?.numero ?? null,
      tipo: primeiro?.identificacao?.tipo ?? null,
      quantidade: totalTitulos,
    },
    valor: Number(valor.toFixed(2)),
    vencimento:
      primeiro?.vencimentos?.prorrogado ?? primeiro?.vencimentos?.original ?? null,
    dataPagamento,
    ultimoPagamento: dataPagamento,
    possuiPagamento: !!dataPagamento,
    prazoPagamentoDias: diasEntre(emissao, dataPagamento),
    saldoAberto: Number(saldoAberto.toFixed(2)),
    situacao,
  });
}

// ============================================================
// INDICADORES
// ============================================================

const quantidadeAnalisada = historicoPagamentoFornecedor.length;

const liquidadas = historicoPagamentoFornecedor.filter(
  (c) => c.situacao === 'LIQUIDADO',
).length;

const percentualLiquidacao = quantidadeAnalisada
  ? Math.round((liquidadas / quantidadeAnalisada) * 100)
  : 0;

const prazos = historicoPagamentoFornecedor
  .map((c) => c.prazoPagamentoDias)
  .filter((p) => Number.isFinite(p));

const prazoMedioPagamentoDias = prazos.length
  ? Math.round(prazos.reduce((s, p) => s + p, 0) / prazos.length)
  : null;

const valorHistorico = historicoPagamentoFornecedor.reduce((s, c) => s + c.valor, 0);

function classificar() {
  if (quantidadeAnalisada === 0) return 'SEM HISTÓRICO';
  if (percentualLiquidacao === 100) return 'BOM PAGADOR';
  if (percentualLiquidacao >= 50) return 'ATENÇÃO';
  return 'CRÍTICO';
}

// ============================================================
// ALERTAS
// ============================================================

const alertasPagamento = [];

if (quantidadeAnalisada === 0) {
  alertasPagamento.push({
    codigo: 'SEM_HISTORICO_ANTERIOR',
    mensagem:
      'Não foram localizadas compras anteriores aprovadas para este fornecedor.',
  });
}

if (quantidadeAnalisada > 0 && percentualLiquidacao < 100) {
  alertasPagamento.push({
    codigo: 'TITULOS_NAO_LIQUIDADOS',
    mensagem: 'Existem compras anteriores com títulos ainda não liquidados.',
  });
}

for (const compra of historicoPagamentoFornecedor) {
  if (compra.situacao === 'SEM_TITULO') {
    alertasPagamento.push({
      codigo: 'OC_HISTORICA_SEM_TITULO',
      ordemCompra: compra.ordemCompra,
      mensagem: 'A OC histórica não possui título financeiro localizado na E501TCP.',
    });
  }
}

// ============================================================
// RETORNO
// (mantém as chaves na raiz para não quebrar o
//  "Montar Modelo Dossiê OC", que já as consome)
// ============================================================

return [
  {
    json: {
      identificacao,
      historicoPagamentoFornecedor,
      indicadoresFornecedor: {
        quantidadeComprasAnalisadas: quantidadeAnalisada,
        quantidadePagamentosAnalisados: quantidadeAnalisada,
        comprasLiquidadas: liquidadas,
        percentualLiquidacao,
        prazoMedioPagamentoDias,
        classificacao: classificar(),
      },
      resumo: {
        quantidadeCompras: quantidadeAnalisada,
        quantidadeTitulos: historicoPagamentoFornecedor.reduce(
          (s, c) => s + (c.titulo?.quantidade || 0),
          0,
        ),
        valorHistorico: Number(valorHistorico.toFixed(2)),
        ordemCompraAtualExcluida: ordemCompraAtual || null,
      },
      alertasPagamento,
      meta: {
        etapa: 'CONSOLIDAR_HISTORICO_PAGAMENTO_ANALITICO',
        origem: 'Senior ERP',
        fontes: ['E420OCP', 'E501TCP'],
        versao: '2.0',
        regra:
          'Somente OCs cronologicamente anteriores, aprovadas (SITAPR=APR) e com SITOCP=1. A OC em análise é excluída.',
      },
    },
  },
];
}
