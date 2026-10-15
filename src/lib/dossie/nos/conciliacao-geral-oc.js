// @ts-nocheck
// No Code do workflow n8n "Conciliação Geral OC" (Dossie OC SeniorX v6.4), codigo original sem alteracoes.
// Globais do n8n: $input, $ (como $('Outro no')), $json e items (= $input.all()).
export default async function ($input, $, $json) {
// ============================================================
// CONCILIAÇÃO GERAL DA ORDEM DE COMPRA
// Projeto: Dossiê OC
//
// REGRA FINANCEIRA:
// E501TCP = situação e saldo ATUAL do título
// E501MCP = histórico de movimentações / pagamentos
// ============================================================


// ============================================================
// 0. LEITURA SEGURA DOS BLOCOS  (acrescentado na v2)
//
// Cada bloco vive em um ramo próprio. Quando a OC não tem títulos,
// notas, aprovação multinível ou rateios, o ramo correspondente
// não produz itens e o nó nunca executa — e $('...').first() passa
// a lançar "hasn't been executed", abortando o dossiê inteiro.
//
// Ausência de dado opcional não é erro: vira bloco vazio + alerta.
// ============================================================

const blocosAusentes = [];

function bloco(nome) {
  try {
    const item = $(nome).first();
    if (!item) {
      blocosAusentes.push(nome);
      return {};
    }
    return item.json || {};
  } catch (e) {
    blocosAusentes.push(nome);
    return {};
  }
}

// ============================================================
// 1. RECUPERA OS RESULTADOS DOS BLOCOS
// ============================================================

const cabecalho =
  bloco('Normalizar Cabeçalho OC');

const produtos =
  bloco('Normalizar Produtos OC');

const servicos =
  bloco('Normalizar Serviços OC');

const rateios =
  bloco('Normalizar Rateios OC');

const aprovacao =
  bloco('Normalizar Níveis Aprovação');

const aprovadores =
  bloco('Normalizar Cadastro Aprovadores');

const titulos =
  bloco('Normalizar Títulos Financeiros');

const notas =
  bloco('Enriquecer Notas Fiscais');

const movimentos =
  bloco('Normalizar Movimentações Financeiras');


// ============================================================
// 2. FUNÇÕES AUXILIARES
// ============================================================

function numero(valor) {
  const n = Number(valor);

  return Number.isFinite(n)
    ? n
    : 0;
}

function moeda(valor) {
  return Number(
    numero(valor).toFixed(2)
  );
}

function confere(a, b, tolerancia = 0.01) {
  return Math.abs(
    numero(a) - numero(b)
  ) <= tolerancia;
}


// ============================================================
// 3. OC
// ============================================================

const ordemCompra =
  cabecalho?.ordemCompra || {};

const valorOC =
  numero(
    ordemCompra?.valores?.liquido
  );

const valorFinanceiroOC =
  numero(
    ordemCompra?.valores?.financeiro
  );

const valorOriginalOC =
  numero(
    ordemCompra?.valores?.original
  );


// ============================================================
// 4. PRODUTOS
// ============================================================

const listaProdutos =
  produtos?.produtos || [];

const valorProdutos =
  numero(
    produtos
      ?.resumoProdutos
      ?.valorLiquido
  );

const quantidadeProdutos =
  listaProdutos.length;


// ============================================================
// 5. SERVIÇOS
// ============================================================

const listaServicos =
  servicos?.servicos || [];

const valorServicos =
  numero(
    servicos
      ?.resumoServicos
      ?.valorLiquido
  );

const quantidadeServicos =
  listaServicos.length;

const valorItens =
  moeda(
    valorProdutos +
    valorServicos
  );


// ============================================================
// 6. RATEIOS
// ============================================================

const listaRateios =
  rateios?.rateios || [];

const valorRateado =
  numero(
    rateios
      ?.resumoRateios
      ?.valorRateado
  );

const quantidadeRateios =
  listaRateios.length;


// ============================================================
// 7. APROVAÇÃO
// ============================================================

const aprovacaoMultinivel =
  aprovacao?.aprovacaoMultinivel || null;

const listaAprovadores =
  aprovadores?.aprovadores || [];

const todosAprovados =
  aprovacaoMultinivel
    ?.todosAprovados === true;


// ============================================================
// 8. TÍTULOS FINANCEIROS
// E501TCP = ESTADO ATUAL
// ============================================================

const listaTitulos =
  titulos?.titulos || [];

const quantidadeTitulos =
  listaTitulos.length;

const valorTitulos =
  moeda(
    listaTitulos.reduce(
      (soma, titulo) =>
        soma +
        numero(
          titulo
            ?.valores
            ?.original
        ),
      0
    )
  );

const saldoAbertoAtual =
  moeda(
    listaTitulos.reduce(
      (soma, titulo) =>
        soma +
        numero(
          titulo
            ?.valores
            ?.aberto
        ),
      0
    )
  );

const valorBaixadoAtual =
  moeda(
    listaTitulos.reduce(
      (soma, titulo) =>
        soma +
        numero(
          titulo
            ?.valores
            ?.baixadoCalculado
        ),
      0
    )
  );


// ------------------------------------------------------------
// Títulos atualmente liquidados
// ------------------------------------------------------------

const titulosLiquidados =
  listaTitulos.filter(
    titulo =>
      titulo
        ?.situacao
        ?.codigo === 'LQ'
  );

const quantidadeTitulosLiquidados =
  titulosLiquidados.length;


// ------------------------------------------------------------
// Títulos atualmente em aberto
// ------------------------------------------------------------

const titulosAtualmenteEmAberto =
  listaTitulos.filter(
    titulo =>
      numero(
        titulo
          ?.valores
          ?.aberto
      ) > 0.01
  );

const quantidadeTitulosEmAberto =
  titulosAtualmenteEmAberto.length;


// ------------------------------------------------------------
// Divergências de observação
// ------------------------------------------------------------

const titulosComDivergenciaObservacao =
  listaTitulos.filter(
    titulo =>
      titulo
        ?.validacao
        ?.observacaoValorConfere === false
  );

const divergenciasObservacao =
  titulosComDivergenciaObservacao.length;


// ============================================================
// 9. NOTAS FISCAIS
// ============================================================

const listaNotasFiscais =
  notas?.notasFiscais || [];

const quantidadeNotas =
  listaNotasFiscais.length;

const valorNotas =
  numero(
    notas
      ?.resumoNotasFiscais
      ?.totalLiquido
  );

const valorFinanceiroNotas =
  numero(
    notas
      ?.resumoNotasFiscais
      ?.totalFinanceiro
  );

const notasComChave =
  listaNotasFiscais.filter(
    nf =>
      nf
        ?.fiscal
        ?.possuiChaveEletronica === true
  ).length;

const notasSemChave =
  listaNotasFiscais.filter(
    nf =>
      nf
        ?.fiscal
        ?.possuiChaveEletronica !== true
  ).length;


// ============================================================
// 10. HISTÓRICO FINANCEIRO
// E501MCP
// ============================================================

const listaMovimentacoes =
  movimentos?.movimentacoes || [];

const titulosMovimentacao =
  movimentos?.titulosMovimentacao || [];

const quantidadeMovimentacoes =
  listaMovimentacoes.length;

const titulosComEvidenciaPagamento =
  titulosMovimentacao.filter(
    titulo =>
      titulo
        ?.existeEvidenciaPagamento === true
  ).length;

const movimentosComEvidenciaPagamento =
  listaMovimentacoes.filter(
    movimento =>
      movimento
        ?.pagamento
        ?.possuiEvidencia === true
  ).length;


// ============================================================
// 11. VALIDAÇÕES
// ============================================================

const validacoes = [];

function adicionarValidacao({
  codigo,
  descricao,
  valorEsperado = null,
  valorEncontrado = null,
  ok,
  severidade = 'ERRO'
}) {

  validacoes.push({
    codigo,
    descricao,

    valorEsperado:
      valorEsperado === null
        ? null
        : moeda(valorEsperado),

    valorEncontrado:
      valorEncontrado === null
        ? null
        : moeda(valorEncontrado),

    ok: ok === true,

    severidade:
      ok === true
        ? 'OK'
        : severidade
  });
}


// 01
adicionarValidacao({
  codigo: 'OC_ITENS',

  descricao:
    'Total de produtos e serviços confere com o valor líquido da OC',

  valorEsperado:
    valorOC,

  valorEncontrado:
    valorItens,

  ok:
    confere(
      valorOC,
      valorItens
    )
});


// 02
adicionarValidacao({
  codigo: 'OC_RATEIO',

  descricao:
    'Total rateado confere com o valor líquido da OC',

  valorEsperado:
    valorOC,

  valorEncontrado:
    valorRateado,

  ok:
    confere(
      valorOC,
      valorRateado
    )
});


// 03
adicionarValidacao({
  codigo: 'OC_TITULOS',

  // Nenhum título lançado ainda não é divergência: é pendência.
  severidade:
    quantidadeTitulos === 0
      ? 'PENDENTE'
      : 'ERRO',

  descricao:
    quantidadeTitulos === 0
      ? 'Ainda não há título financeiro vinculado a esta OC'
      : 'Total original dos títulos financeiros confere com o valor da OC',

  valorEsperado:
    valorOC,

  valorEncontrado:
    valorTitulos,

  ok:
    confere(
      valorOC,
      valorTitulos
    )
});


// 04
adicionarValidacao({
  codigo: 'OC_NOTAS',

  severidade:
    quantidadeNotas === 0
      ? 'PENDENTE'
      : 'ERRO',

  descricao:
    quantidadeNotas === 0
      ? 'Ainda não há nota fiscal vinculada a esta OC'
      : 'Total das notas fiscais relacionadas confere com o valor da OC',

  valorEsperado:
    valorOC,

  valorEncontrado:
    valorNotas,

  ok:
    confere(
      valorOC,
      valorNotas
    )
});


// 05
adicionarValidacao({
  codigo: 'TITULOS_NOTAS',

  descricao:
    'Total dos títulos financeiros confere com o total das notas fiscais',

  valorEsperado:
    valorTitulos,

  valorEncontrado:
    valorNotas,

  ok:
    confere(
      valorTitulos,
      valorNotas
    )
});


// 06
adicionarValidacao({
  codigo: 'OC_FINANCEIRO',

  descricao:
    'Valor financeiro da OC confere com o valor líquido da OC',

  valorEsperado:
    valorOC,

  valorEncontrado:
    valorFinanceiroOC,

  ok:
    confere(
      valorOC,
      valorFinanceiroOC
    )
});


// 07
adicionarValidacao({
  codigo: 'OC_ORIGINAL',

  descricao:
    'Valor original da OC confere com o valor líquido da OC',

  valorEsperado:
    valorOC,

  valorEncontrado:
    valorOriginalOC,

  ok:
    confere(
      valorOC,
      valorOriginalOC
    )
});


// 08
adicionarValidacao({
  codigo: 'CALCULO_PRODUTOS',

  descricao:
    'Os cálculos individuais dos produtos conferem',

  ok:
    produtos
      ?.resumoProdutos
      ?.valoresConferem === true
});


// 09
adicionarValidacao({
  codigo: 'CALCULO_SERVICOS',

  descricao:
    'Os cálculos individuais dos serviços conferem',

  ok:
    servicos
      ?.resumoServicos
      ?.valoresConferem === true
});


// 10
adicionarValidacao({
  codigo: 'CALCULO_RATEIOS',

  descricao:
    'Os valores dos rateios conferem',

  ok:
    rateios
      ?.resumoRateios
      ?.valoresConferem === true
});


// 11
adicionarValidacao({
  codigo: 'APROVACAO',

  descricao:
    'Todos os níveis da aprovação multinível estão aprovados',

  ok:
    todosAprovados
});


// 12
adicionarValidacao({
  codigo: 'NOTAS_FINANCEIRO',

  descricao:
    'Valor financeiro das notas confere com os títulos financeiros',

  valorEsperado:
    valorTitulos,

  valorEncontrado:
    valorFinanceiroNotas,

  ok:
    confere(
      valorTitulos,
      valorFinanceiroNotas
    )
});


// 13
// Validação correta do estado atual dos títulos:
// título LQ não pode possuir saldo aberto.

const titulosLqComSaldo =
  titulosLiquidados.filter(
    titulo =>
      numero(
        titulo
          ?.valores
          ?.aberto
      ) > 0.01
  );

adicionarValidacao({
  codigo: 'LIQUIDACAO_TITULOS',

  descricao:
    'Títulos com situação LQ possuem saldo aberto igual a zero',

  ok:
    titulosLqComSaldo.length === 0
});


// ============================================================
// 12. ALERTAS
// ============================================================

const alertas = [];

function adicionarAlerta({
  codigo,
  severidade = 'INFORMATIVO',
  descricao,
  quantidade = null,
  valor = null,
  detalhes = null
}) {

  alertas.push({
    codigo,
    severidade,
    descricao,

    quantidade:
      quantidade === null
        ? null
        : numero(quantidade),

    valor:
      valor === null
        ? null
        : moeda(valor),

    detalhes
  });
}


// ------------------------------------------------------------
// Divergência textual em observação
// ------------------------------------------------------------

if (
  titulosComDivergenciaObservacao.length > 0
) {

  adicionarAlerta({
    codigo:
      'DIVERGENCIA_OBSERVACAO_TITULO',

    severidade:
      'ATENCAO',

    descricao:
      'Há título financeiro cujo valor informado textualmente na observação diverge do valor estruturado no ERP.',

    quantidade:
      titulosComDivergenciaObservacao.length,

    detalhes:
      titulosComDivergenciaObservacao.map(
        titulo => ({
          numero:
            titulo.numero,

          valorOriginal:
            titulo
              ?.valores
              ?.original ?? null,

          valorObservacao:
            titulo
              ?.validacao
              ?.valorBrutoObservacao ?? null,

          observacao:
            titulo.observacao ?? null
        })
      )
  });
}


// ------------------------------------------------------------
// Documento sem chave eletrônica
// ------------------------------------------------------------

if (notasSemChave > 0) {

  adicionarAlerta({
    codigo:
      'DOCUMENTO_SEM_CHAVE_ELETRONICA',

    severidade:
      'INFORMATIVO',

    descricao:
      'Há documento fiscal relacionado à OC sem chave eletrônica disponível na E440NFC.',

    quantidade:
      notasSemChave,

    detalhes:
      listaNotasFiscais
        .filter(
          nf =>
            nf
              ?.fiscal
              ?.possuiChaveEletronica !== true
        )
        .map(
          nf => ({
            numero:
              nf.numero,

            serie:
              nf.serie,

            natureza:
              nf
                ?.documento
                ?.natureza ?? null,

            valor:
              nf
                ?.valores
                ?.liquido ?? null
          })
        )
  });
}


// ------------------------------------------------------------
// Saldo financeiro atual
// ------------------------------------------------------------

if (saldoAbertoAtual > 0) {

  adicionarAlerta({
    codigo:
      'SALDO_FINANCEIRO_ABERTO',

    severidade:
      'INFORMATIVO',

    descricao:
      'Existem títulos financeiros relacionados à OC com saldo atual em aberto na E501TCP.',

    quantidade:
      quantidadeTitulosEmAberto,

    valor:
      saldoAbertoAtual
  });
}


// ------------------------------------------------------------
// Título liquidado sem evidência histórica
// ------------------------------------------------------------

const titulosLiquidadosSemEvidencia =
  titulosLiquidados.filter(
    titulo => {

      const historico =
        titulosMovimentacao.find(
          movimento =>
            movimento
              ?.titulo
              ?.empresa === titulo.empresa &&

            movimento
              ?.titulo
              ?.filial === titulo.filial &&

            movimento
              ?.titulo
              ?.fornecedor === titulo.fornecedor &&

            movimento
              ?.titulo
              ?.numero === titulo.numero &&

            movimento
              ?.titulo
              ?.tipo === titulo.tipo
        );

      return !(
        historico
          ?.existeEvidenciaPagamento === true
      );
    }
  );

if (
  titulosLiquidadosSemEvidencia.length > 0
) {

  adicionarAlerta({
    codigo:
      'TITULO_LIQUIDADO_SEM_EVIDENCIA_MOVIMENTO',

    severidade:
      'ATENCAO',

    descricao:
      'Há título com situação LQ, mas sem evidência de pagamento ou baixa nas movimentações consultadas.',

    quantidade:
      titulosLiquidadosSemEvidencia.length,

    detalhes:
      titulosLiquidadosSemEvidencia.map(
        titulo => titulo.numero
      )
  });
}


// ------------------------------------------------------------
// Título sem vínculo fiscal
// ------------------------------------------------------------

const titulosSemNota =
  listaTitulos.filter(
    titulo =>
      titulo
        ?.notaFiscal
        ?.possuiVinculo !== true
  );

if (
  titulosSemNota.length > 0
) {

  adicionarAlerta({
    codigo:
      'TITULO_SEM_DOCUMENTO_FISCAL',

    severidade:
      'ATENCAO',

    descricao:
      'Há título financeiro sem vínculo fiscal identificado.',

    quantidade:
      titulosSemNota.length,

    detalhes:
      titulosSemNota.map(
        titulo => titulo.numero
      )
  });
}


// ------------------------------------------------------------
// Nota sem NUMOCP direto
// ------------------------------------------------------------

const notasSemVinculoDiretoOc =
  listaNotasFiscais.filter(
    nf =>
      nf
        ?.ordemCompraDireta
        ?.possuiVinculo !== true
  );

if (
  notasSemVinculoDiretoOc.length > 0
) {

  adicionarAlerta({
    codigo:
      'NOTA_SEM_VINCULO_DIRETO_OC',

    severidade:
      'INFORMATIVO',

    descricao:
      'Há nota fiscal relacionada por vínculo financeiro, mas sem NUMOCP preenchido diretamente na E440NFC.',

    quantidade:
      notasSemVinculoDiretoOc.length
  });
}


// ============================================================
// 13. RESULTADOS DAS VALIDAÇÕES
// ============================================================

const validacoesComErro =
  validacoes.filter(
    validacao =>
      validacao.ok === false &&
      validacao.severidade === 'ERRO'
  );

const validacoesOk =
  validacoes.filter(
    validacao =>
      validacao.ok === true
  );

const alertasAtencao =
  alertas.filter(
    alerta =>
      alerta.severidade === 'ATENCAO'
  );


// ============================================================
// 14. STATUS DA CONFERÊNCIA
// ============================================================

let statusConferencia =
  'CONCILIADO';

if (
  validacoesComErro.length > 0
) {
  statusConferencia =
    'DIVERGENCIA';
}


// ============================================================
// 15. STATUS FINANCEIRO
// ============================================================

let statusFinanceiro =
  'NAO_IDENTIFICADO';

if (
  quantidadeTitulos === 0
) {

  statusFinanceiro =
    'SEM_TITULO_FINANCEIRO';

} else if (
  quantidadeTitulosLiquidados === quantidadeTitulos &&
  saldoAbertoAtual === 0
) {

  statusFinanceiro =
    'QUITADO';

} else if (
  saldoAbertoAtual > 0 &&
  titulosComEvidenciaPagamento > 0
) {

  statusFinanceiro =
    'PAGAMENTO_PARCIAL';

} else if (
  saldoAbertoAtual > 0
) {

  statusFinanceiro =
    'EM_ABERTO';

} else if (
  saldoAbertoAtual === 0 &&
  quantidadeTitulosLiquidados !== quantidadeTitulos
) {

  statusFinanceiro =
    'SALDO_ZERO_SITUACAO_NAO_LIQUIDADA';
}


// ============================================================
// 16. STATUS DOCUMENTAL
// ============================================================

let statusDocumental =
  'DOCUMENTOS_IDENTIFICADOS';

if (
  quantidadeNotas === 0
) {

  statusDocumental =
    'SEM_DOCUMENTO_FISCAL';

} else if (
  notasSemChave > 0 &&
  notasComChave > 0
) {

  statusDocumental =
    'DOCUMENTOS_PARCIALMENTE_ELEGIVEIS_EDOCS';

} else if (
  notasSemChave > 0 &&
  notasComChave === 0
) {

  statusDocumental =
    'SEM_CHAVE_ELETRONICA';

} else if (
  notasComChave === quantidadeNotas
) {

  statusDocumental =
    'ELEGIVEL_EDOCS_POR_CHAVE';
}


// ============================================================
// 16.8 OC AINDA SEM DOCUMENTO FISCAL / FINANCEIRO
//
// Uma OC aprovada mas ainda sem nota lançada é estado normal do
// processo. O que não pode é o dossiê sair mudo: sem alerta, o
// leitor não distingue "ainda não chegou" de "falhou a coleta".
// ============================================================

if (quantidadeNotas === 0) {
  adicionarAlerta({
    codigo:
      'SEM_NOTA_FISCAL_VINCULADA',
    severidade:
      'ATENCAO',
    descricao:
      'Nenhuma nota fiscal foi localizada para esta OC na E440NFC. Sem documento fiscal não há espelho fiscal a anexar. Verifique se a nota já foi lançada no ERP.',
    valor:
      valorOC
  });
}

if (quantidadeTitulos === 0) {
  adicionarAlerta({
    codigo:
      'SEM_TITULO_FINANCEIRO',
    severidade:
      'ATENCAO',
    descricao:
      'Nenhum título financeiro foi localizado para esta OC. Confira o campo USU_NUMTIT na E420OCP — é dele que sai a lista de títulos consultados.',
    valor:
      valorOC
  });
}

// ============================================================
// 16.9 BLOCOS NÃO EXECUTADOS  (acrescentado na v2)
// ============================================================

if (blocosAusentes.length) {
  alertas.push({
    codigo:
      'BLOCO_NAO_RETORNADO',
    severidade:
      'INFORMATIVO',
    descricao:
      'Um ou mais blocos da OC não retornaram dados e foram tratados como vazios.',
    quantidade:
      blocosAusentes.length,
    valor:
      null,
    detalhes:
      blocosAusentes.map(nome => ({ bloco: nome }))
  });
}

// ============================================================
// 17. RESUMO EXECUTIVO
// ============================================================

const resumo = {

  statusConferencia,

  statusFinanceiro,

  statusDocumental,

  valores: {

    ordemCompra:
      moeda(valorOC),

    produtos:
      moeda(valorProdutos),

    servicos:
      moeda(valorServicos),

    itens:
      moeda(valorItens),

    rateios:
      moeda(valorRateado),

    titulos:
      moeda(valorTitulos),

    notasFiscais:
      moeda(valorNotas),

    saldoFinanceiroAberto:
      moeda(saldoAbertoAtual),

    valorBaixado:
      moeda(valorBaixadoAtual)
  },

  quantidades: {

    produtos:
      quantidadeProdutos,

    servicos:
      quantidadeServicos,

    rateios:
      quantidadeRateios,

    titulos:
      quantidadeTitulos,

    notasFiscais:
      quantidadeNotas,

    movimentacoesFinanceiras:
      quantidadeMovimentacoes,

    aprovadores:
      listaAprovadores.length
  },

  financeiro: {

    titulosLiquidados:
      quantidadeTitulosLiquidados,

    titulosEmAberto:
      quantidadeTitulosEmAberto,

    titulosComEvidenciaPagamento,

    movimentosComEvidenciaPagamento
  },

  documentos: {

    notasComChaveEletronica:
      notasComChave,

    notasSemChaveEletronica:
      notasSemChave
  },

  validacoes: {

    quantidade:
      validacoes.length,

    aprovadas:
      validacoesOk.length,

    divergentes:
      validacoesComErro.length
  },

  alertas: {

    quantidade:
      alertas.length,

    quantidadeAtencao:
      alertasAtencao.length
  }
};


// ============================================================
// 18. JSON MESTRE
// ============================================================

return [
  {
    json: {

      ordemCompra,

      produtos:
        listaProdutos,

      servicos:
        listaServicos,

      rateios:
        listaRateios,

      aprovacao: {

        controle:
          aprovacaoMultinivel,

        aprovadores:
          listaAprovadores
      },

      documentosFiscais:
        listaNotasFiscais,

      financeiro: {

        titulos:
          listaTitulos,

        movimentacoes:
          listaMovimentacoes,

        titulosMovimentacao,

        resumo: {

          saldoAbertoAtual:
            moeda(saldoAbertoAtual),

          valorBaixadoAtual:
            moeda(valorBaixadoAtual),

          titulosLiquidados:
            quantidadeTitulosLiquidados,

          titulosEmAberto:
            quantidadeTitulosEmAberto,

          titulosComEvidenciaPagamento,

          movimentosComEvidenciaPagamento
        }
      },

      validacoes,

      alertas,

      resumo,

      meta: {
        blocosAusentes,

        projeto:
          'DOSSIE_OC',

        origem:
          'Senior ERP',

        metodoIntegracao:
          'GetDBInfo',

        versaoEstrutura:
          '1.2',

        estrutura:
          'JSON_MESTRE',

        regraFinanceira: {
          saldoAtual:
            'E501TCP',

          historicoMovimentacoes:
            'E501MCP'
        }
      }
    }
  }
];
}
