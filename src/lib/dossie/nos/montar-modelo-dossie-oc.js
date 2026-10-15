// @ts-nocheck
// No Code do workflow n8n "Montar Modelo Dossiê OC" (Dossie OC SeniorX v6.4), codigo original sem alteracoes.
// Globais do n8n: $input, $ (como $('Outro no')), $json e items (= $input.all()).
export default async function ($input, $, $json) {
// ============================================================
// MONTAR MODELO DOSSIÊ OC — v6.1
// Senior ERP | Consolidação Geral
//
// CORREÇÃO DESTA VERSÃO
// ---------------------
// A função limpar() apagava qualquer chave cujo valor fosse um
// objeto sem chaves — e, em JavaScript, um array vazio satisfaz
// essa condição:
//
//   typeof []            === 'object'
//   Object.keys([]).length === 0        →  delete dossie.produtos
//
// Numa OC sem produtos, sem serviços ou sem rateios, a lista era
// removida em vez de ficar vazia, e o cálculo do resumo logo
// abaixo quebrava com "Cannot read properties of undefined".
//
// Lista vazia é uma resposta, não uma ausência: agora arrays são
// preservados, e o resumo lê tudo por acesso seguro.
// ============================================================

const entradas = $input.all();

const arr = (v) => (Array.isArray(v) ? v : []);
const obj = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});

const dossie = {
  identificacao: {
    empresa: null,
    filial: null,
    fornecedor: null,
    ordemCompraAtual: null,
  },
  ordemCompra: {},
  fornecedor: {},
  produtos: [],
  servicos: [],
  rateios: [],
  aprovacao: null,
  financeiro: null,
  historicoFornecedor: null,
  alertas: [],
  meta: {
    etapa: 'MONTAR_MODELO_DOSSIE_OC',
    origem: 'Senior ERP',
    versao: '6.1',
  },
};

// ============================================================
// PROCESSAMENTO DAS ENTRADAS
// ============================================================

for (const item of entradas) {
  const dados = obj(item.json);

  // ---------- IDENTIFICAÇÃO ----------
  if (dados.identificacao) {
    const id = obj(dados.identificacao);
    dossie.identificacao.empresa ??= id.empresa || null;
    dossie.identificacao.filial ??= id.filial || null;
    dossie.identificacao.fornecedor ??=
      typeof id.fornecedor === 'object' ? id.fornecedor?.codigo : id.fornecedor || null;
    dossie.identificacao.ordemCompraAtual ??= id.ordemCompraAtual || null;
  }

  // ---------- ORDEM DE COMPRA ----------
  let oc = dados.ordemCompra || dados.ocAtual || dados.ordemCompraAtual;
  if (oc) {
    if (oc.ordemCompra && typeof oc.ordemCompra === 'object') oc = oc.ordemCompra;
    Object.assign(dossie.ordemCompra, oc);
  }

  // ---------- CADASTRO DO FORNECEDOR ----------
  if (dados.fornecedor && typeof dados.fornecedor === 'object') {
    Object.assign(dossie.fornecedor, dados.fornecedor);
  }

  // ---------- LISTAS ----------
  if (Array.isArray(dados.produtos)) dossie.produtos.push(...dados.produtos);
  if (Array.isArray(dados.servicos)) dossie.servicos.push(...dados.servicos);
  if (Array.isArray(dados.rateios)) dossie.rateios.push(...dados.rateios);

  // ---------- BLOCOS ----------
  if (dados.aprovacao) dossie.aprovacao = dados.aprovacao;
  if (dados.financeiro) dossie.financeiro = dados.financeiro;

  // ---------- HISTÓRICO ----------
  // formato consolidado (objeto pronto)
  if (dados.historicoFornecedor) {
    dossie.historicoFornecedor = dados.historicoFornecedor;
  }
  // formato analítico (chaves na raiz) — só sobrescreve se trouxer conteúdo
  if (Array.isArray(dados.historicoPagamentoFornecedor)) {
    const jaTemConteudo = arr(
      dossie.historicoFornecedor?.historicoPagamentoFornecedor,
    ).length > 0;

    if (!jaTemConteudo || dados.historicoPagamentoFornecedor.length > 0) {
      dossie.historicoFornecedor = {
        historicoPagamentoFornecedor: dados.historicoPagamentoFornecedor,
        indicadoresFornecedor: obj(dados.indicadoresFornecedor),
        resumo: obj(dados.resumo),
        alertasPagamento: arr(dados.alertasPagamento),
      };
    }
  }
}

// ============================================================
// COMPLEMENTAR IDENTIFICAÇÃO
// ============================================================

dossie.identificacao.empresa ||= dossie.ordemCompra.empresa || null;
dossie.identificacao.filial ||= dossie.ordemCompra.filial || null;
dossie.identificacao.fornecedor ||=
  dossie.fornecedor.codigo || dossie.ordemCompra.fornecedor?.codigo || null;
dossie.identificacao.ordemCompraAtual ||= dossie.ordemCompra.numero || null;

if (!Object.keys(dossie.fornecedor).length && dossie.identificacao.fornecedor) {
  dossie.fornecedor = { codigo: dossie.identificacao.fornecedor };
}

// ============================================================
// LIMPEZA
//
// Remove só o que é realmente ausência: null, undefined e objetos
// sem nenhuma chave. Arrays NUNCA são removidos — lista vazia
// significa "consultado, nada encontrado", que é informação.
// ============================================================

function limpar(alvo) {
  if (!alvo || typeof alvo !== 'object') return;

  for (const chave of Object.keys(alvo)) {
    const valor = alvo[chave];

    if (Array.isArray(valor)) continue;

    const vazio =
      valor === null ||
      valor === undefined ||
      (typeof valor === 'object' && Object.keys(valor).length === 0);

    if (vazio) delete alvo[chave];
  }
}

limpar(dossie);

// ============================================================
// RESUMO
// ============================================================

const historico = arr(dossie.historicoFornecedor?.historicoPagamentoFornecedor);

dossie.resumo = {
  quantidadeProdutos: arr(dossie.produtos).length,
  quantidadeServicos: arr(dossie.servicos).length,
  quantidadeRateios: arr(dossie.rateios).length,
  possuiFornecedor: !!dossie.fornecedor?.razaoSocial,
  possuiAprovacao: arr(dossie.aprovacao?.controle?.niveis).length > 0,
  possuiFinanceiro: !!dossie.financeiro,
  possuiHistoricoFornecedor: historico.length > 0,
  quantidadeHistoricoPagamento: historico.length,
};

// ============================================================
// ALERTAS ESTRUTURAIS
// ============================================================

const pendencias = [];

if (!dossie.identificacao.ordemCompraAtual) pendencias.push('OC_NAO_IDENTIFICADA');
if (!dossie.resumo.possuiHistoricoFornecedor) pendencias.push('SEM_HISTORICO_PAGAMENTO_FORNECEDOR');
if (!dossie.resumo.possuiFornecedor) pendencias.push('SEM_CADASTRO_FORNECEDOR');
if (dossie.resumo.quantidadeProdutos === 0 && dossie.resumo.quantidadeServicos === 0) {
  pendencias.push('SEM_ITENS_OC');
}

dossie.alertas = pendencias.map((codigo) => ({
  tipo: 'ESTRUTURAL',
  nivel: 'MEDIO',
  codigo,
}));

// ============================================================
// SAÍDA
// ============================================================

return [{ json: { dossieOC: dossie } }];
}
