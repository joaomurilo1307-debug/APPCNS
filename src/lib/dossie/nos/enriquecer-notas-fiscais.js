// @ts-nocheck
// No Code do workflow n8n "Enriquecer Notas Fiscais" (Dossie OC SeniorX v6.4), codigo original sem alteracoes.
// Globais do n8n: $input, $ (como $('Outro no')), $json e items (= $input.all()).
export default async function ($input, $, $json) {
const inputs = $input.all();


// ============================================================
// LOCALIZA OS TRÊS BLOCOS
// ============================================================

const blocoCabecalho =
  inputs.find(
    item =>
      Array.isArray(
        item.json?.notasFiscais
      )
  )?.json || {};


const blocoProdutos =
  inputs.find(
    item =>
      Array.isArray(
        item.json?.notasProdutos
      )
  )?.json || {};


const blocoServicos =
  inputs.find(
    item =>
      Array.isArray(
        item.json?.notasServicos
      )
  )?.json || {};


// ============================================================
// DADOS BASE
// ============================================================

const notasFiscais =
  blocoCabecalho.notasFiscais || [];

const notasProdutos =
  blocoProdutos.notasProdutos || [];

const notasServicos =
  blocoServicos.notasServicos || [];


// ============================================================
// FUNÇÕES AUXILIARES
// ============================================================

function criarChaveNota({
  empresa,
  filial,
  fornecedor,
  numero,
  serie
}) {

  return [
    empresa,
    filial,
    fornecedor,
    numero,
    serie || ''
  ].join('|');
}


function numeroSeguro(valor) {

  const numero =
    Number(valor);

  return Number.isFinite(numero)
    ? numero
    : 0;
}


function arredondar(valor) {

  return Number(
    numeroSeguro(valor)
      .toFixed(2)
  );
}


function valoresConferem(
  valorA,
  valorB,
  tolerancia = 0.01
) {

  return (
    Math.abs(
      numeroSeguro(valorA) -
      numeroSeguro(valorB)
    ) <= tolerancia
  );
}


// ============================================================
// MAPAS DOS ITENS
// ============================================================

const mapaProdutos =
  new Map();

for (const nota of notasProdutos) {

  const chave =
    nota.chave ||
    criarChaveNota(nota);

  mapaProdutos.set(
    chave,
    nota
  );
}


const mapaServicos =
  new Map();

for (const nota of notasServicos) {

  const chave =
    nota.chave ||
    criarChaveNota(nota);

  mapaServicos.set(
    chave,
    nota
  );
}


// ============================================================
// ENRIQUECIMENTO DE CADA NOTA
// ============================================================

const notasFiscaisDetalhadas =
  notasFiscais.map(nf => {

    const chave =
      criarChaveNota(nf);

    const blocoProduto =
      mapaProdutos.get(chave) || null;

    const blocoServico =
      mapaServicos.get(chave) || null;


    const produtos =
      blocoProduto?.itens || [];

    const servicos =
      blocoServico?.itens || [];


    // ========================================================
    // TOTAIS DOS ITENS
    // ========================================================

    const totalProdutosItens =
      produtos.reduce(
        (total, item) =>
          total +
          numeroSeguro(
            item?.valores?.liquido
          ),
        0
      );


    const totalServicosItens =
      servicos.reduce(
        (total, item) =>
          total +
          numeroSeguro(
            item?.valores?.liquido
          ),
        0
      );


    const totalItens =
      totalProdutosItens +
      totalServicosItens;


    // ========================================================
    // VALIDAÇÕES
    // ========================================================

    const produtoConfere =
      valoresConferem(
        nf?.valores?.produtos,
        totalProdutosItens
      );


    const servicoConfere =
      valoresConferem(
        nf?.valores?.servicos,
        totalServicosItens
      );


    const liquidoConfere =
      valoresConferem(
        nf?.valores?.liquido,
        totalItens
      );


    const todosValoresConferem =
      produtoConfere &&
      servicoConfere &&
      liquidoConfere;


    // ========================================================
    // TIPO DE ESPELHO
    // ========================================================

    let tipoEspelho =
      nf?.documento?.natureza ||
      'NAO_IDENTIFICADA';


    if (
      produtos.length > 0 &&
      servicos.length > 0
    ) {

      tipoEspelho =
        'MISTA';

    } else if (
      produtos.length > 0
    ) {

      tipoEspelho =
        'PRODUTO';

    } else if (
      servicos.length > 0
    ) {

      tipoEspelho =
        'SERVICO';
    }


    return {

      ...nf,


      // ======================================================
      // IDENTIFICADOR INTERNO
      // ======================================================

      chaveInterna:
        chave,


      // ======================================================
      // ITENS DA NOTA
      // ======================================================

      itens: {

        produtos,

        servicos,

        quantidadeProdutos:
          produtos.length,

        quantidadeServicos:
          servicos.length,

        quantidadeTotal:
          produtos.length +
          servicos.length
      },


      // ======================================================
      // RESUMO DOS ITENS
      // ======================================================

      resumoItens: {

        totalProdutos:
          arredondar(
            totalProdutosItens
          ),

        totalServicos:
          arredondar(
            totalServicosItens
          ),

        total:
          arredondar(
            totalItens
          )
      },


      // ======================================================
      // VALIDAÇÃO DO ESPELHO
      // ======================================================

      validacaoItens: {

        produtoConfere,

        servicoConfere,

        liquidoConfere,

        todosValoresConferem,

        status:
          todosValoresConferem
            ? 'CONFERIDO'
            : 'DIVERGENCIA'
      },


      // ======================================================
      // CONFIGURAÇÃO DO ESPELHO FISCAL
      // ======================================================

      espelhoFiscal: {

        gerar:
          true,

        tipo:
          tipoEspelho,

        titulo:
          `ESPELHO DA NOTA FISCAL ${nf.numero}/${nf.serie}`,

        aviso:
          'Documento gerado automaticamente a partir dos dados registrados no ERP. Não substitui o documento fiscal original.'
      }

    };

  });


// ============================================================
// RESUMO GERAL
// ============================================================

const quantidadeItensProdutos =
  notasFiscaisDetalhadas.reduce(
    (total, nf) =>
      total +
      (
        nf?.itens
          ?.quantidadeProdutos || 0
      ),
    0
  );


const quantidadeItensServicos =
  notasFiscaisDetalhadas.reduce(
    (total, nf) =>
      total +
      (
        nf?.itens
          ?.quantidadeServicos || 0
      ),
    0
  );


const notasConferidas =
  notasFiscaisDetalhadas.filter(
    nf =>
      nf
        ?.validacaoItens
        ?.todosValoresConferem === true
  ).length;


const notasComDivergencia =
  notasFiscaisDetalhadas.filter(
    nf =>
      nf
        ?.validacaoItens
        ?.todosValoresConferem === false
  ).length;


// ============================================================
// SAÍDA
// ============================================================

return [
  {
    json: {

      notasFiscais:
        notasFiscaisDetalhadas,

      resumoNotasFiscais: {

        ...(blocoCabecalho
          .resumoNotasFiscais || {}),

        quantidadeItensProdutos,

        quantidadeItensServicos,

        quantidadeItens:
          quantidadeItensProdutos +
          quantidadeItensServicos,

        notasConferidas,

        notasComDivergencia
      },

      meta: {

        fonte: [
          'E440NFC',
          'E440IPC',
          'E440ISC'
        ],

        origem:
          'Senior ERP',

        metodo:
          'GetDBInfo',

        enriquecido:
          true
      }

    }
  }
];
}
