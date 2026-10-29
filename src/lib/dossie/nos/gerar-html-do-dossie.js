// @ts-nocheck
// No Code do workflow n8n "Gerar HTML do Dossiê" (Dossie OC SeniorX v6.4). ALTERADO em 29/10/2026: o espelho fiscal simples e o aviso de
// "sem espelho" sairam; no lugar ficam os marcadores COMPLEMENTO_OC e COMPLEMENTO_DANFE, trocados em gerar.ts por
// complemento.ts (dados completos da OC, reembolso, sem nota, DANFE). Nao regenerar a partir do n8n sem refazer isso.
// Globais do n8n: $input, $ (como $('Outro no')), $json e items (= $input.all()).
export default async function ($input, $, $json) {
// ============================================================
// GERAR HTML DOSSIÊ — v6
// Consominas | Dossiê de Ordem de Compra (Senior ERP + e-Docs X)
//
// v6 corrige a origem dos dados sem alterar o layout aprovado:
//   - lê os caminhos aninhados reais do "Consolidar Dossiê Final"
//   - fornecedor por extenso (código + razão social)
//   - aprovações, histórico do fornecedor, movimentações e
//     itens do espelho fiscal deixam de vir vazios
//   - objetos nunca mais são impressos como JSON cru
//   - saída HTML compacta (sem linhas em branco entre tags)
// ============================================================

const dados = $json || {};

// ============================================================
// UTILITÁRIOS
// ============================================================

const arr = (v) => (Array.isArray(v) ? v : []);
const obj = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});

/** Primeiro valor "de verdade" da lista (ignora null/undefined/''). */
function coalesce(...valores) {
  for (const v of valores) {
    if (v !== undefined && v !== null && String(v).trim() !== '') return v;
  }
  return null;
}

/** Converte para número aceitando "1.234,56" e "1234.56". */
function num(v) {
  if (v === undefined || v === null || v === '') return 0;
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  const limpo = String(v).trim().replace(/\./g, '').replace(',', '.');
  const n = Number(limpo);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Primeiro valor MAIOR QUE ZERO (ou 0). Em OC liquidada a Senior zera o saldo (VLRLIQ) e o valor so' sobrevive em
 * VLRORI/VLRBRU; coalesce() pararia no 0 e o dossie mostraria R$ 0,00 numa compra de milhares (visto na OC 15500).
 */
function positivo(...valores) {
  return valores.find((x) => num(x) > 0) ?? 0;
}

function moeda(v) {
  return num(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function quantidade(v) {
  return num(v).toLocaleString('pt-BR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 4,
  });
}

function percentual(v) {
  if (v === undefined || v === null || v === '') return '-';
  return `${num(v).toLocaleString('pt-BR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}%`;
}

/**
 * ISO (2026-08-17) ou dd/mm/aaaa -> dd/mm/aaaa.
 * Datas-sentinela do Senior (31/12/1900, 30/12/1899) representam
 * "sem data" e são exibidas como traço, não como data real.
 */
function dataBR(v) {
  if (!v) return '-';
  const s = String(v).trim();

  const ano = Number(
    /^\d{4}-/.test(s) ? s.substring(0, 4) : s.substring(6, 10),
  );
  if (Number.isFinite(ano) && (ano < 1950 || ano > 2100)) return '-';

  if (/^\d{2}\/\d{2}\/\d{4}$/.test(s)) return s;
  const iso = s.substring(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    const [a, m, d] = iso.split('-');
    return `${d}/${m}/${a}`;
  }
  return s;
}

function dataHoraBR(data, hora) {
  const d = dataBR(data);
  if (d === '-') return '-';
  return hora ? `${d} ${hora}` : d;
}

/**
 * Texto seguro para célula. NUNCA imprime objeto cru:
 * quando recebe objeto tenta extenso/descricao/nome/codigo.
 */
function txt(v) {
  if (v === undefined || v === null || v === '') return '-';
  if (typeof v === 'object') {
    const achatado = coalesce(
      v.extenso,
      v.descricao,
      v.nomeCompleto,
      v.nome,
      v.numero,
      v.codigo,
    );
    return achatado === null ? '-' : String(achatado);
  }
  return String(v);
}

function esc(v) {
  return txt(v)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** "102325 - MACFROTAS CT 4336/2026" a partir de {codigo, descricao, extenso}. */
function porExtenso(v) {
  if (v === undefined || v === null || v === '') return '-';
  if (typeof v !== 'object') return String(v);
  if (v.extenso) return String(v.extenso);
  const codigo = coalesce(v.codigo, v.numero);
  const descricao = coalesce(v.descricao, v.nome, v.nomeCompleto);
  if (codigo !== null && descricao !== null) return `${codigo} - ${descricao}`;
  return txt(v);
}

/** Chave de NF-e em blocos de 4 dígitos. */
function chaveFormatada(chave) {
  const limpa = String(chave || '').replace(/\D/g, '');
  if (!limpa) return null;
  return limpa.replace(/(\d{4})(?=\d)/g, '$1 ').trim();
}

function linhaVazia(colunas, mensagem) {
  return `<tr><td colspan="${colunas}" class="vazio">${esc(mensagem)}</td></tr>`;
}

/** Texto seguro para nome de arquivo: sem acento, sem caractere inválido. */
function slug(valor, limite = 40) {
  return String(valor ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, limite)
    .replace(/-+$/, '');
}

/** ISO ou dd/mm/aaaa -> dd-mm-aaaa, para uso em nome de arquivo. */
function dataArquivo(v) {
  const d = dataBR(v);
  return d === '-' ? null : d.replace(/\//g, '-');
}

// ============================================================
// FORNECEDOR — CÓDIGO + RAZÃO SOCIAL
// ============================================================

const ordemCompra = obj(dados.ordemCompra);
const documentosFiscais = arr(dados.documentosFiscais);
const documentosOriginais = arr(dados.documentosOriginais);
const financeiro = obj(dados.financeiro);
const aprovacao = obj(dados.aprovacao);

/**
 * O cadastro do fornecedor pode chegar por três caminhos.
 * A ordem abaixo vai do mais específico ao mais genérico.
 */
const fornecedorCadastro = obj(
  coalesce(
    dados.fornecedor,
    dados.cadastroFornecedor,
    ordemCompra.fornecedorCadastro,
    typeof ordemCompra.fornecedor === 'object' ? ordemCompra.fornecedor : null,
  ) || {},
);

const fornecedorCodigo = coalesce(
  fornecedorCadastro.codigo,
  fornecedorCadastro.codFor,
  typeof ordemCompra.fornecedor === 'object'
    ? ordemCompra.fornecedor.codigo
    : ordemCompra.fornecedor,
  dados.identificacao?.fornecedor,
  documentosFiscais[0]?.fornecedor,
  financeiro.titulos?.[0]?.fornecedor,
);

const fornecedorRazaoSocial = coalesce(
  fornecedorCadastro.razaoSocial,
  fornecedorCadastro.nomeFornecedor,
  fornecedorCadastro.nomFor,
  fornecedorCadastro.descricao,
  fornecedorCadastro.nome,
);

const fornecedorNomeFantasia = coalesce(
  fornecedorCadastro.nomeFantasia,
  fornecedorCadastro.nomFan,
);

const fornecedorCnpj = coalesce(
  fornecedorCadastro.cnpjFormatado,
  fornecedorCadastro.cnpj,
  fornecedorCadastro.cgcCpf,
);

/** "713616 - MS AUTO CENTER E LOCACOES LTDA" (ou só o código, se não houver cadastro). */
const fornecedorExtenso = (() => {
  if (fornecedorCadastro.extenso) return String(fornecedorCadastro.extenso);
  const nome = fornecedorRazaoSocial || fornecedorNomeFantasia;
  if (fornecedorCodigo !== null && nome) return `${fornecedorCodigo} - ${nome}`;
  if (nome) return String(nome);
  return fornecedorCodigo === null ? '-' : String(fornecedorCodigo);
})();

/** Mesma identificação, com CNPJ quando disponível (usada no espelho fiscal). */
const fornecedorExtensoFiscal = fornecedorCnpj
  ? `${fornecedorExtenso} — CNPJ ${fornecedorCnpj}`
  : fornecedorExtenso;

const numeroOC = coalesce(
  ordemCompra.numero,
  dados.identificacao?.ordemCompra,
  dados.identificacao?.ordemCompraAtual,
);

// ============================================================
// TÍTULO E VENCIMENTO
//
// Quando o dossiê é disparado pelo número do título (relatório 201),
// é esse título que nomeia o documento. No modo OC, cai no primeiro
// título financeiro encontrado.
//
// O vencimento vem do USU_DATVECT da OC — é a data que aparece no
// boleto e no aviso de "programada para pagamento". Os campos
// VCTORI/VCTPRO do título costumam trazer data-placeholder do Senior.
// ============================================================

const entrada = obj(dados.entrada);

const numeroTitulo = coalesce(
  entrada.numeroTitulo,
  entrada.numTit,
  dados.identificacao?.titulo,
  arr(financeiro.titulos)[0]?.numero,
);

const vencimentoOC = coalesce(
  ordemCompra.camposCustomizados?.vencimento,
  arr(financeiro.titulos)[0]?.datas?.vencimentoAtual,
  arr(financeiro.titulos)[0]?.datas?.vencimentoOriginal,
);

// ------------------------------------------------------------
// NOME DO DOCUMENTO
// Nº Título + Fornecedor (código + razão social) + Vencimento
// ------------------------------------------------------------

const partesNome = ['DOSSIE'];

partesNome.push(numeroTitulo ? slug(numeroTitulo, 20) : `OC-${slug(numeroOC, 12)}`);

const nomeFornecedorArquivo = [
  fornecedorCodigo,
  fornecedorRazaoSocial || fornecedorNomeFantasia,
]
  .filter(Boolean)
  .join('-');
if (nomeFornecedorArquivo) partesNome.push(slug(nomeFornecedorArquivo, 40));

const vencimentoArquivo = dataArquivo(vencimentoOC);
if (vencimentoArquivo) partesNome.push(vencimentoArquivo);

const nomeBase = partesNome.join('_');

// ============================================================
// SITUAÇÃO DA OC
//
// Três eixos, na linha logo abaixo do fornecedor:
//   situação da OC · situação da aprovação · situação financeira
// ============================================================

const resumoOC = obj(dados.resumo);

const STATUS_FINANCEIRO = {
  QUITADO: { texto: 'Quitado', classe: 'status-ok' },
  PAGAMENTO_PARCIAL: { texto: 'Pagamento parcial', classe: 'status-alerta' },
  EM_ABERTO: { texto: 'Em aberto', classe: 'status-alerta' },
  SEM_TITULO_FINANCEIRO: { texto: 'Sem título financeiro', classe: 'status-info' },
  SALDO_ZERO_SITUACAO_NAO_LIQUIDADA: {
    texto: 'Saldo zerado, título não liquidado',
    classe: 'status-alerta',
  },
  NAO_IDENTIFICADO: { texto: 'Situação financeira não identificada', classe: 'status-info' },
};

/**
 * Fallback: se o resumo não vier, deduz a situação financeira a
 * partir dos próprios títulos, para o cabeçalho nunca ficar mudo.
 */
function deduzirStatusFinanceiro() {
  const titulosDoc = arr(financeiro.titulos);
  if (!titulosDoc.length) return 'SEM_TITULO_FINANCEIRO';

  const saldo = titulosDoc.reduce((t, x) => t + num(x.valores?.aberto), 0);
  const liquidados = titulosDoc.filter(
    (x) => String(coalesce(x.situacao?.codigo, x.situacao) || '').toUpperCase() === 'LQ',
  ).length;

  if (liquidados === titulosDoc.length && saldo === 0) return 'QUITADO';
  if (saldo > 0 && liquidados > 0) return 'PAGAMENTO_PARCIAL';
  if (saldo > 0) return 'EM_ABERTO';
  return 'NAO_IDENTIFICADO';
}

const codigoFinanceiro = coalesce(
  resumoOC.statusFinanceiro,
  deduzirStatusFinanceiro(),
);
const situacaoFinanceira =
  STATUS_FINANCEIRO[codigoFinanceiro] || {
    texto: String(codigoFinanceiro).replace(/_/g, ' ').toLowerCase(),
    classe: 'status-info',
  };

/** A OC está quitada: todos os títulos liquidados e saldo aberto zerado. */
const ocQuitada = codigoFinanceiro === 'QUITADO';

const selosSituacao = [];

const situacaoOC = coalesce(
  ordemCompra.situacao?.ocDescricao,
  ordemCompra.situacao?.ocExtenso,
);
if (situacaoOC) {
  selosSituacao.push(`<span class="status status-info">${esc(situacaoOC)}</span>`);
}

const situacaoAprovacao = coalesce(
  ordemCompra.situacao?.aprovacaoDescricao,
  ordemCompra.situacao?.aprovacaoExtenso,
);
if (situacaoAprovacao) {
  const classe =
    String(ordemCompra.situacao?.aprovacao || '').toUpperCase() === 'APR'
      ? 'status-ok'
      : 'status-alerta';
  selosSituacao.push(
    `<span class="status ${classe}">${esc(situacaoAprovacao)}</span>`,
  );
}

selosSituacao.push(
  `<span class="status ${situacaoFinanceira.classe}">${esc(
    situacaoFinanceira.texto,
  )}</span>`,
);

// ============================================================
// RESUMO EXECUTIVO
// ============================================================

const produtos = arr(dados.produtos);
const servicos = arr(dados.servicos);
const rateios = arr(dados.rateios);

const totalProdutos = produtos.reduce(
  (t, p) => t + num(positivo(p.valores?.liquido, p.valores?.original, p.valores?.bruto, p.valorTotal)),
  0,
);

const totalServicos = servicos.reduce(
  (t, s) =>
    t +
    num(
      positivo(
        s.valores?.liquidoServico,
        s.valores?.liquido,
        s.valores?.original,
        s.valores?.bruto,
        s.valorTotal,
      ),
    ),
  0,
);

const totalNotas = documentosFiscais.reduce(
  (t, n) => t + num(coalesce(n.valores?.liquido, n.valores?.informado, n.valor)),
  0,
);

const valorOC = num(
  positivo(
    ordemCompra.valores?.liquido,
    ordemCompra.valores?.original,
    dados.resumo?.valores?.ordemCompra,
    totalProdutos + totalServicos,
  ),
);

// ============================================================
// PRODUTOS
// ============================================================

const linhasProdutos = produtos.length
  ? produtos
      .map((item) => {
        const p = obj(item.produto);
        const q = obj(item.quantidades);
        const v = obj(item.valores);
        return [
          '<tr>',
          `<td>${esc(coalesce(item.sequencia, '-'))}</td>`,
          `<td>${esc(coalesce(p.codigo, item.codigo))}</td>`,
          `<td>${esc(coalesce(p.descricao, item.descricao))}</td>`,
          `<td>${esc(coalesce(item.unidade, p.unidade))}</td>`,
          `<td class="num">${esc(
            quantidade(coalesce(q.pedida, q.original, q.aberta, item.quantidade)),
          )}</td>`,
          `<td class="num">${esc(moeda(coalesce(v.unitario, item.valorUnitario)))}</td>`,
          `<td class="num">${esc(
            moeda(positivo(v.liquido, v.original, v.bruto, item.valorTotal)),
          )}</td>`,
          '</tr>',
        ].join('');
      })
      .join('')
  : linhaVazia(7, 'Nenhum produto encontrado.');

// ============================================================
// SERVIÇOS
// ============================================================

const linhasServicos = servicos.length
  ? servicos
      .map((item) => {
        const s = obj(item.servico);
        const q = obj(item.quantidades);
        const v = obj(item.valores);
        return [
          '<tr>',
          `<td>${esc(coalesce(item.sequencia, '-'))}</td>`,
          `<td>${esc(coalesce(s.codigo, item.codigo))}</td>`,
          `<td>${esc(coalesce(s.descricao, item.descricao))}</td>`,
          `<td>${esc(coalesce(item.unidade, s.unidade))}</td>`,
          `<td class="num">${esc(
            quantidade(coalesce(q.pedida, q.original, q.aberta, item.quantidade)),
          )}</td>`,
          `<td class="num">${esc(moeda(coalesce(v.unitario, item.valorUnitario)))}</td>`,
          `<td class="num">${esc(
            moeda(positivo(v.liquidoServico, v.liquido, v.original, v.bruto, item.valorTotal)),
          )}</td>`,
          '</tr>',
        ].join('');
      })
      .join('')
  : linhaVazia(7, 'Nenhum serviço encontrado.');

// ============================================================
// RATEIOS
// ============================================================

const linhasRateios = rateios.length
  ? rateios
      .map((item) => {
        const v = obj(item.valores);
        const projeto = obj(item.projeto);
        const temProjeto = num(projeto.numero) > 0;
        return [
          '<tr>',
          `<td>${esc(coalesce(item.sequencia, '-'))}</td>`,
          `<td>${esc(porExtenso(item.centroCusto))}</td>`,
          `<td>${esc(porExtenso(item.contaFinanceira))}</td>`,
          `<td>${
            temProjeto
              ? esc(`${projeto.numero} / ${coalesce(projeto.fase, 0)}`)
              : '-'
          }</td>`,
          `<td class="num">${esc(
            percentual(coalesce(v.percentualRateio, v.percentualConta, item.percentual)),
          )}</td>`,
          `<td class="num">${esc(
            moeda(
              positivo(
                v.valorRateado,
                v.valorConta,
                item.valor,
                (num(coalesce(v.percentualRateio, v.percentualConta, item.percentual)) / 100) * valorOC,
              ),
            ),
          )}</td>`,
          '</tr>',
        ].join('');
      })
      .join('')
  : linhaVazia(6, 'Nenhum rateio encontrado.');

// ============================================================
// APROVAÇÕES
// ============================================================

const controleAprovacao = obj(aprovacao.controle);
const niveisAprovacao = arr(
  coalesce(controleAprovacao.niveis, aprovacao.niveis, dados.aprovacoes) || [],
);

const cadastroAprovadores = arr(aprovacao.aprovadores);
const indiceAprovadores = new Map(
  cadastroAprovadores.map((a) => [String(a.codigoUsuario), a]),
);

const linhasAprovacoes = niveisAprovacao.length
  ? niveisAprovacao
      .map((nivel) => {
        const codigoUsuario = coalesce(
          nivel.aprovador?.codigoUsuario,
          nivel.codigoUsuario,
          nivel.usuario,
        );
        const cadastro = obj(indiceAprovadores.get(String(codigoUsuario)));
        const ap = obj(nivel.aprovacao);
        const usuario = coalesce(cadastro.usuario, cadastro.login);
        return [
          '<tr>',
          `<td>${esc(coalesce(nivel.nivel, nivel.sequenciaNivel, '-'))}</td>`,
          `<td>${esc(
            usuario && codigoUsuario !== null
              ? `${codigoUsuario} - ${usuario}`
              : coalesce(codigoUsuario, usuario),
          )}</td>`,
          `<td>${esc(coalesce(cadastro.nomeCompleto, cadastro.nome))}</td>`,
          `<td>${esc(coalesce(nivel.centroCusto, cadastro.centroCustoCadastro))}</td>`,
          `<td>${esc(
            coalesce(ap.situacaoDescricao, ap.situacaoCodigo, nivel.situacao),
          )}</td>`,
          `<td>${esc(dataHoraBR(coalesce(ap.data, nivel.dataAprovacao), ap.hora))}</td>`,
          '</tr>',
        ].join('');
      })
      .join('')
  : linhaVazia(6, 'Nenhuma aprovação encontrada.');

// ============================================================
// HISTÓRICO DO FORNECEDOR
// ============================================================

const historicoFornecedor = obj(dados.historicoFornecedor);
const comprasHistorico = arr(
  coalesce(
    historicoFornecedor.compras,
    historicoFornecedor.historicoPagamentoFornecedor,
  ) || [],
);
const indicadores = obj(historicoFornecedor.indicadoresFornecedor);

const historicoQuantidade = coalesce(
  indicadores.quantidadeComprasAnalisadas,
  indicadores.quantidadePagamentosAnalisados,
  historicoFornecedor.resumo?.quantidadeTitulos,
  comprasHistorico.length,
);

const historicoPrazoMedio = coalesce(
  indicadores.prazoMedioPagamentoDias,
  indicadores.prazoMedioDias,
  indicadores.prazoMedio,
);

const historicoLiquidacao = coalesce(
  indicadores.percentualLiquidacao,
  indicadores.liquidacao,
);

const historicoClassificacao = coalesce(
  indicadores.classificacao,
  indicadores.status,
);

const linhasHistorico = comprasHistorico.length
  ? comprasHistorico
      .map((compra) => {
        const nf = obj(compra.notaFiscal);
        const titulo = obj(compra.titulo);
        const pagamento = obj(compra.pagamento);
        const prazo = coalesce(
          compra.prazoPagamentoDias,
          compra.prazoDias,
          pagamento.prazoDias,
        );
        return [
          '<tr>',
          `<td>${esc(coalesce(compra.ordemCompra, compra.numeroOC, compra.oc))}</td>`,
          `<td>${esc(dataBR(coalesce(compra.emissao, compra.data)))}</td>`,
          `<td>${esc(coalesce(nf.numero, compra.numeroNota, titulo.numero))}</td>`,
          `<td>${esc(coalesce(nf.serie, compra.serie, titulo.tipo))}</td>`,
          `<td class="num">${esc(moeda(coalesce(compra.valor, compra.valorTotal)))}</td>`,
          `<td>${esc(
            dataBR(
              coalesce(
                compra.dataPagamento,
                pagamento.data,
                compra.ultimoPagamento,
              ),
            ),
          )}</td>`,
          `<td class="num">${
            prazo === null ? '-' : esc(`${num(prazo)} dias`)
          }</td>`,
          '</tr>',
        ].join('');
      })
      .join('')
  : linhaVazia(7, 'Nenhuma compra anterior encontrada.');

// ============================================================
// DOCUMENTOS FISCAIS
// ============================================================

/** Estratégia e-Docs por documento, indexada por "numero|serie". */
const indiceDocumentosOriginais = new Map(
  documentosOriginais.map((d) => {
    const id = obj(d.identificacao);
    return [`${coalesce(id.numero, d.numero)}|${coalesce(id.serie, d.serie)}`, d];
  }),
);

function estrategiaDocumento(nota) {
  const encontrado = indiceDocumentosOriginais.get(`${nota.numero}|${nota.serie}`);
  return coalesce(encontrado?.estrategia, encontrado?.statusDocumental);
}

const linhasDocumentosFiscais = documentosFiscais.length
  ? documentosFiscais
      .map((nota) => {
        const v = obj(nota.valores);
        return [
          '<tr>',
          `<td>${esc(nota.numero)}</td>`,
          `<td>${esc(nota.serie)}</td>`,
          `<td>${esc(coalesce(nota.documento?.natureza, nota.tipo))}</td>`,
          `<td>${esc(dataBR(coalesce(nota.datas?.emissao, nota.emissao)))}</td>`,
          `<td class="num">${esc(moeda(coalesce(v.liquido, v.informado, nota.valor)))}</td>`,
          `<td>${esc(coalesce(nota.situacao?.descricao, nota.situacao))}</td>`,
          '</tr>',
        ].join('');
      })
      .join('')
  : linhaVazia(6, 'Nenhum documento fiscal encontrado.');

// ============================================================
// FINANCEIRO
// ============================================================

const titulos = arr(financeiro.titulos);

const linhasTitulos = titulos.length
  ? titulos
      .map((titulo) => {
        const d = obj(titulo.datas);
        const v = obj(titulo.valores);
        return [
          '<tr>',
          `<td>${esc(titulo.numero)}</td>`,
          `<td>${esc(titulo.tipo)}</td>`,
          `<td>${esc(dataBR(coalesce(d.emissao, titulo.emissao)))}</td>`,
          `<td>${esc(
            dataBR(coalesce(d.vencimentoAtual, d.vencimentoOriginal, titulo.vencimento)),
          )}</td>`,
          `<td class="num">${esc(moeda(coalesce(v.original, titulo.valor)))}</td>`,
          `<td class="num">${esc(moeda(coalesce(v.aberto, titulo.saldo, 0)))}</td>`,
          `<td>${esc(coalesce(titulo.situacao?.descricao, titulo.situacao))}</td>`,
          '</tr>',
        ].join('');
      })
      .join('')
  : linhaVazia(7, 'Nenhum título financeiro encontrado.');

// ============================================================
// MOVIMENTAÇÕES FINANCEIRAS
// ============================================================

const ROTULO_TRANSACAO = {
  90500: 'Entrada',
  90501: 'Entrada',
  90550: 'Baixa / Pagamento',
};

/**
 * A lista analítica é "financeiro.movimentacoes".
 * "titulosMovimentacao" é apenas o agrupador por título — usá-lo
 * como fonte fazia o dossiê exibir 1 linha por título em vez de
 * 1 linha por movimento.
 */
const movimentacoes = arr(
  coalesce(
    financeiro.movimentacoes,
    arr(financeiro.titulosMovimentacao).flatMap((t) => arr(t.movimentos)),
  ) || [],
);

const linhasMovimentacoes = movimentacoes.length
  ? movimentacoes
      .map((mov) => {
        const chave = obj(mov.chaveTitulo);
        const v = obj(mov.valores);
        const pagamento = obj(mov.pagamento);
        const transacao = coalesce(mov.transacao, mov.movimento);
        const rotulo = ROTULO_TRANSACAO[num(transacao)];
        const numeroTitulo = coalesce(chave.numero, mov.numero, mov.titulo);
        const tipoTitulo = coalesce(chave.tipo, mov.tipo);
        return [
          '<tr>',
          `<td>${esc(
            tipoTitulo ? `${numeroTitulo} (${tipoTitulo})` : numeroTitulo,
          )}</td>`,
          `<td>${esc(rotulo ? `${transacao} - ${rotulo}` : transacao)}</td>`,
          `<td>${esc(dataBR(coalesce(mov.dataMovimento, mov.data)))}</td>`,
          `<td class="num">${esc(moeda(coalesce(v.movimento, v.liquido, mov.valor)))}</td>`,
          `<td>${
            pagamento.possuiEvidencia
              ? esc(
                  pagamento.data
                    ? `Sim — ${dataBR(pagamento.data)}`
                    : 'Sim',
                )
              : 'Não'
          }</td>`,
          '</tr>',
        ].join('');
      })
      .join('')
  : linhaVazia(5, 'Nenhuma movimentação financeira encontrada.');

// ============================================================
// VALIDAÇÕES E ALERTAS
// ============================================================

const validacoes = arr(dados.validacoes);

const linhasValidacoes = validacoes.length
  ? validacoes
      .map((v) => {
        const status = v.ok ? 'OK' : coalesce(v.severidade, 'DIVERGENTE');
        const classe = v.ok ? 'status status-ok' : 'status status-alerta';
        return [
          '<tr>',
          `<td>${esc(coalesce(v.codigo, v.tipo))}</td>`,
          `<td><span class="${classe}">${esc(status)}</span></td>`,
          `<td>${esc(v.descricao)}</td>`,
          '</tr>',
        ].join('');
      })
      .join('')
  : linhaVazia(3, 'Nenhuma validação executada.');

const alertas = arr(dados.alertas);

const linhasAlertas = alertas.length
  ? alertas
      .map((a) => {
        const severidade = coalesce(a.severidade, a.nivel);
        return [
          '<tr>',
          `<td>${esc(coalesce(a.codigo, a.tipo))}${
            severidade ? `<span class="badge">${esc(severidade)}</span>` : ''
          }</td>`,
          `<td>${esc(a.descricao)}</td>`,
          '</tr>',
        ].join('');
      })
      .join('')
  : linhaVazia(2, 'Nenhum alerta registrado.');

// ============================================================
// CSS — LAYOUT APROVADO (INALTERADO)
// ============================================================

const estilo = `
@page { size: A4; margin: 14mm; }
* { box-sizing: border-box; }
body { font-family: Arial, Helvetica, sans-serif; font-size: 10px; color: #222; margin: 0; background: #fff; }
h1 { font-size: 22px; margin: 0; }
h2 { font-size: 15px; margin: 25px 0 8px 0; padding-bottom: 5px; border-bottom: 2px solid #333; }
h3 { font-size: 12px; margin: 15px 0 6px 0; }

/* CABEÇALHO */
.cabecalho { padding-bottom: 14px; border-bottom: 3px solid #333; }
.subtitulo { margin-top: 7px; font-size: 17px; font-weight: 700; line-height: 1.2; }
.situacao-oc { margin-top: 9px; display: flex; flex-wrap: wrap; gap: 5px; }
.situacao-oc .status { font-size: 9px; font-weight: bold; }
.grade { display: grid; grid-template-columns: repeat(4, 1fr); gap: 7px; margin-top: 12px; }
.card { border: 1px solid #ccc; padding: 8px; border-radius: 4px; }
.card .rotulo { font-size: 8px; color: #666; text-transform: uppercase; }
.card .valor { font-size: 12px; font-weight: bold; margin-top: 3px; }

/* STATUS */
.status { display: inline-block; padding: 4px 7px; border-radius: 3px; font-weight: bold; }
.status-ok { border: 1px solid #555; }
.status-alerta { border: 1px dashed #777; }
.status-info { border: 1px solid #aaa; }

/* TABELAS */
table { width: 100%; border-collapse: collapse; margin-top: 6px; page-break-inside: auto; }
thead { display: table-header-group; }
tr { page-break-inside: avoid; }
th { background: #eee; border: 1px solid #aaa; padding: 5px; font-size: 9px; text-align: left; }
td { border: 1px solid #ccc; padding: 5px; vertical-align: top; }
.num { text-align: right; white-space: nowrap; }
.vazio { text-align: center; color: #777; padding: 10px; }

/* ALERTAS */
.alerta { border: 1px solid #bbb; padding: 8px; margin-bottom: 6px; }
.badge { margin-left: 8px; font-size: 8px; border: 1px solid #999; padding: 2px 4px; }
.sem-alerta { border: 1px solid #ccc; padding: 8px; }

/* RESULTADOS */
.resultado { font-weight: bold; }
.resultado-ok { color: #222; }
.resultado-alerta { color: #555; }
.bloco { page-break-inside: avoid; }

/* RODAPÉ */
.rodape { margin-top: 25px; border-top: 1px solid #aaa; padding-top: 7px; font-size: 8px; color: #666; }

/* HISTÓRICO DO FORNECEDOR */
.historico-resumo { display: grid; grid-template-columns: repeat(4, 1fr); gap: 7px; margin: 8px 0; }
.historico-card { border: 1px solid #ccc; padding: 7px; border-radius: 4px; }
.historico-card .rotulo { font-size: 8px; color: #666; text-transform: uppercase; }
.historico-card .valor { font-size: 11px; font-weight: bold; margin-top: 3px; }

/* ESPELHO FISCAL */
.espelho-fiscal { page-break-before: always; break-before: page; padding-top: 12mm; font-size: 9px; }
.espelho-fiscal + .espelho-fiscal { page-break-before: always; break-before: page; padding-top: 16mm; }
.espelho-topo { display: table; width: 100%; border: 2px solid #222; margin-bottom: 8px; }
.espelho-topo-esquerda { display: table-cell; vertical-align: top; padding: 10px; }
.espelho-numero { display: table-cell; vertical-align: middle; width: 125px; border-left: 2px solid #222; text-align: center; padding: 8px; }
.espelho-anexo { font-size: 8px; font-weight: bold; margin-bottom: 5px; }
.espelho-titulo { font-size: 17px; font-weight: bold; letter-spacing: 0.3px; }
.espelho-aviso { margin-top: 6px; font-size: 8px; line-height: 1.35; }
.rotulo-fiscal { font-size: 8px; font-weight: bold; text-transform: uppercase; }
.numero-nota { font-size: 20px; font-weight: bold; margin: 3px 0; }
.titulo-secao-fiscal { margin-top: 8px; padding: 4px 6px; border: 1px solid #555; background: #e9e9e9; font-size: 9px; font-weight: bold; text-transform: uppercase; }
.tabela-fiscal { margin-top: 0; }
.tabela-fiscal th { background: #f4f4f4; border: 1px solid #888; font-size: 8px; padding: 4px; }
.tabela-fiscal td { border: 1px solid #aaa; font-size: 8px; padding: 4px; }
.tabela-itens-fiscais { table-layout: auto; }
.tabela-itens-fiscais td:nth-child(3) { word-break: normal; }
.chave-eletronica { border: 1px solid #888; border-top: 0; padding: 7px; min-height: 26px; font-family: "Courier New", monospace; font-size: 9px; letter-spacing: 0.2px; word-break: break-word; }
.tabela-tributos, .tabela-totais-fiscais { page-break-inside: avoid; }
.total-nota { font-weight: bold; font-size: 9px !important; }
.rodape-fiscal { margin-top: 12px; border-top: 1px solid #999; padding-top: 5px; font-size: 7px; color: #666; }

@media print {
  .cabecalho { break-inside: avoid; }
  .historico-resumo { break-inside: avoid; }
  .espelho-topo { break-inside: avoid; }
  .titulo-secao-fiscal { break-after: avoid; }
}`;

// ============================================================
// MONTAGEM DO DOCUMENTO
// ============================================================

const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<title>${esc(nomeBase)}</title>
<style>${estilo}
</style>
</head>
<body>

<div class="cabecalho">
<h1>Dossiê da Ordem de Compra</h1>
<div class="subtitulo">OC nº ${esc(numeroOC)}${
  numeroTitulo ? `&nbsp;&nbsp;·&nbsp;&nbsp;Título ${esc(numeroTitulo)}` : ''
}</div>
<div class="subtitulo">Fornecedor: ${esc(fornecedorExtenso)}</div>
<div class="situacao-oc">${selosSituacao.join('')}</div>
</div>

<h2>Resumo Executivo</h2>
<div class="grade">
<div class="card"><div class="rotulo">Valor OC</div><div class="valor">${esc(moeda(valorOC))}</div></div>
<div class="card"><div class="rotulo">Produtos</div><div class="valor">${esc(moeda(totalProdutos))}</div></div>
<div class="card"><div class="rotulo">Serviços</div><div class="valor">${esc(moeda(totalServicos))}</div></div>
<div class="card"><div class="rotulo">Notas Fiscais</div><div class="valor">${esc(moeda(totalNotas))}</div></div>
</div>

<!--COMPLEMENTO_OC-->

<h2>Produtos</h2>
<table>
<thead><tr><th>Seq.</th><th>Código</th><th>Descrição</th><th>Unidade</th><th>Quantidade</th><th>Valor Unitário</th><th>Valor Total</th></tr></thead>
<tbody>${linhasProdutos}</tbody>
</table>

<h2>Serviços</h2>
<table>
<thead><tr><th>Seq.</th><th>Código</th><th>Descrição</th><th>Unidade</th><th>Quantidade</th><th>Valor Unitário</th><th>Valor Total</th></tr></thead>
<tbody>${linhasServicos}</tbody>
</table>

<h2>Rateios</h2>
<table>
<thead><tr><th>Seq.</th><th>Centro de Custo</th><th>Conta Financeira</th><th>Projeto</th><th>Percentual</th><th>Valor</th></tr></thead>
<tbody>${linhasRateios}</tbody>
</table>

<h2>Aprovações</h2>
<table>
<thead><tr><th>Nível</th><th>Usuário</th><th>Nome</th><th>Centro</th><th>Situação</th><th>Data</th></tr></thead>
<tbody>${linhasAprovacoes}</tbody>
</table>

<h2>Histórico do Fornecedor</h2>
<div class="historico-resumo">
<div class="historico-card"><div class="rotulo">Compras analisadas</div><div class="valor">${esc(
  historicoQuantidade === null ? '0' : historicoQuantidade,
)}</div></div>
<div class="historico-card"><div class="rotulo">Prazo médio</div><div class="valor">${
  historicoPrazoMedio === null ? '&mdash;' : esc(`${num(historicoPrazoMedio)} dias`)
}</div></div>
<div class="historico-card"><div class="rotulo">Liquidação</div><div class="valor">${
  historicoLiquidacao === null ? '&mdash;' : esc(percentual(historicoLiquidacao))
}</div></div>
<div class="historico-card"><div class="rotulo">Classificação</div><div class="valor">${
  historicoClassificacao === null ? '&mdash;' : esc(historicoClassificacao)
}</div></div>
</div>
<table>
<thead><tr><th>OC</th><th>Data</th><th>NF</th><th>Série</th><th>Valor</th><th>Pagamento</th><th>Prazo</th></tr></thead>
<tbody>${linhasHistorico}</tbody>
</table>

<h2>Documentos Fiscais</h2>
<table>
<thead><tr><th>Número</th><th>Série</th><th>Tipo</th><th>Emissão</th><th>Valor</th><th>Situação</th></tr></thead>
<tbody>${linhasDocumentosFiscais}</tbody>
</table>

<h2>Financeiro</h2>
<table>
<thead><tr><th>Título</th><th>Tipo</th><th>Emissão</th><th>Vencimento</th><th>Valor</th><th>Saldo</th><th>Situação</th></tr></thead>
<tbody>${linhasTitulos}</tbody>
</table>

<h2>Movimentações Financeiras</h2>
<table>
<thead><tr><th>Título</th><th>Movimento</th><th>Data</th><th>Valor</th><th>Evidência</th></tr></thead>
<tbody>${linhasMovimentacoes}</tbody>
</table>

<h2>Validações</h2>
<table>
<thead><tr><th>Tipo</th><th>Status</th><th>Descrição</th></tr></thead>
<tbody>${linhasValidacoes}</tbody>
</table>

${
  ocQuitada
    ? ''
    : `
<div class="bloco">
<h2>Alertas</h2>
<table>
<thead><tr><th>Tipo</th><th>Descrição</th></tr></thead>
<tbody>${linhasAlertas}</tbody>
</table>
</div>`
}
<!--COMPLEMENTO_DANFE-->

<div class="rodape">Documento gerado automaticamente pelo GERAR_HTML_DOSSIE v6.3.</div>

</body>
</html>`;

// ============================================================
// SAÍDA
// ============================================================

return [
  {
    json: {
      html,
      arquivo: `${nomeBase}.html`,
      arquivoPdf: `${nomeBase}.pdf`,
      nomeBase,
      identificacao: {
        ordemCompra: numeroOC,
        titulo: numeroTitulo,
        vencimento: vencimentoOC,
        fornecedor: {
          codigo: fornecedorCodigo,
          razaoSocial: fornecedorRazaoSocial,
          extenso: fornecedorExtenso,
        },
      },
      situacao: {
        ordemCompra: situacaoOC,
        aprovacao: situacaoAprovacao,
        financeiro: codigoFinanceiro,
        quitada: ocQuitada,
      },
      meta: {
        etapa: 'GERAR_HTML_DOSSIE',
        versao: '6.3',
        alertasOmitidos: ocQuitada,
      },
    },
  },
];
}
