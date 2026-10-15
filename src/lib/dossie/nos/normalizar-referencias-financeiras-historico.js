// @ts-nocheck
// No Code do workflow n8n "Normalizar Referências Financeiras Histórico" (Dossie OC SeniorX v6.4), codigo original sem alteracoes.
// Globais do n8n: $input, $ (como $('Outro no')), $json e items (= $input.all()).
export default async function ($input, $, $json) {
// ============================================================
// NORMALIZAR REFERÊNCIAS FINANCEIRAS DO HISTÓRICO
//
// Entrada:
//   Coletar Referências Financeiras Histórico
//
// Apoio:
//   Normalizar Últimas 3 Compras
//
// Objetivo:
//   - Decodificar retorno GetDBInfo
//   - Relacionar cada OC histórica às referências financeiras
//   - Preservar USU_NUMNFC
//   - Separar USU_NUMTIT pelo separador " - "
//   - NÃO dividir pelo caractere "$"
//   - Gerar lista plana de títulos para consulta E501TCP/E501MCP
// ============================================================


// ============================================================
// 1. RECUPERA O CONTEXTO DAS 3 COMPRAS
// ============================================================

const historico =
  $('Normalizar Últimas 3 Compras').first().json;

const empresa =
  Number(historico?.identificacao?.empresa);

const fornecedor =
  Number(historico?.identificacao?.fornecedor);

const comprasSelecionadas =
  Array.isArray(historico?.comprasAnteriores)
    ? historico.comprasAnteriores
    : [];

if (!Number.isInteger(empresa) || empresa <= 0) {
  throw new Error(
    'Empresa do histórico não identificada.'
  );
}

if (!Number.isInteger(fornecedor) || fornecedor <= 0) {
  throw new Error(
    'Fornecedor do histórico não identificado.'
  );
}

if (comprasSelecionadas.length === 0) {
  throw new Error(
    'Nenhuma compra histórica foi recebida do nó anterior.'
  );
}


// ============================================================
// 2. RECUPERA SOAP
// ============================================================

const soap =
  $json?.data;

if (!soap || typeof soap !== 'string') {
  throw new Error(
    'Resposta SOAP não encontrada em $json.data.'
  );
}


// ============================================================
// 3. VERIFICA ERRO DO SENIOR
// ============================================================

const erroExecucao =
  soap.match(
    /<erroExecucao[^>]*>([\s\S]*?)<\/erroExecucao>/i
  );

if (erroExecucao?.[1]) {

  const mensagem =
    String(erroExecucao[1])
      .replace(/<[^>]+>/g, '')
      .trim();

  if (mensagem) {
    throw new Error(
      `Senior GetDBInfo: ${mensagem}`
    );
  }
}


// ============================================================
// 4. EXTRAI BASE64
// ============================================================

const retorno =
  soap.match(
    /<pmReturnGetDBInfo[^>]*>([\s\S]*?)<\/pmReturnGetDBInfo>/i
  );

if (!retorno?.[1]) {
  throw new Error(
    'pmReturnGetDBInfo não encontrado.'
  );
}

const base64 =
  retorno[1]
    .replace(/\s+/g, '')
    .trim();


// ============================================================
// 5. DECODIFICA XML INTERNO
// ============================================================

let xmlInterno;

try {

  xmlInterno =
    Buffer
      .from(base64, 'base64')
      .toString('latin1');

} catch (erro) {

  throw new Error(
    `Erro ao decodificar retorno GetDBInfo: ${erro.message}`
  );
}


// ============================================================
// 6. FUNÇÕES AUXILIARES
// ============================================================

function desescaparXml(valor) {

  if (valor === null || valor === undefined) {
    return null;
  }

  return String(valor)
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .trim();
}


function campoXml(bloco, campo) {

  const regex =
    new RegExp(
      `<${campo}[^>]*>([\\s\\S]*?)<\\/${campo}>`,
      'i'
    );

  const encontrado =
    bloco.match(regex);

  if (!encontrado) {
    return null;
  }

  return desescaparXml(
    encontrado[1]
  );
}


function numero(valor) {

  if (
    valor === null ||
    valor === undefined ||
    valor === ''
  ) {
    return 0;
  }

  const texto =
    String(valor)
      .trim()
      .replace(/\./g, '')
      .replace(',', '.');

  const n =
    Number(texto);

  return Number.isFinite(n)
    ? n
    : 0;
}


function dataIso(valor) {

  if (!valor) {
    return null;
  }

  const match =
    String(valor)
      .trim()
      .match(
        /^(\d{2})\/(\d{2})\/(\d{4})$/
      );

  if (!match) {
    return null;
  }

  return `${match[3]}-${match[2]}-${match[1]}`;
}


// ============================================================
// 7. REGRA PARA SEPARAÇÃO DOS TÍTULOS
//
// Exemplo:
//
// "392A1 - 189$01"
//
// vira:
//
// ["392A1", "189$01"]
//
// IMPORTANTE:
// O "$" pertence ao número do título.
// Nunca usamos "$" como separador.
// ============================================================

function separarTitulos(valor) {

  if (
    valor === null ||
    valor === undefined
  ) {
    return [];
  }

  const texto =
    String(valor)
      .trim();

  if (!texto) {
    return [];
  }

  return texto
    .split(/\s+-\s+/)
    .map(
      titulo =>
        titulo.trim()
    )
    .filter(Boolean);
}


// ============================================================
// 8. EXTRAI LINHAS
// ============================================================

const blocos =
  xmlInterno.match(
    /<line>([\s\S]*?)<\/line>/gi
  ) || [];

if (blocos.length === 0) {
  throw new Error(
    'Nenhuma referência financeira foi retornada.'
  );
}


// ============================================================
// 9. NORMALIZA RETORNO E420OCP
// ============================================================

const referencias =
  blocos.map(
    bloco => {

      const numeroOc =
        numero(
          campoXml(
            bloco,
            'NUMOCP'
          )
        );

      const titulosBruto =
        campoXml(
          bloco,
          'USU_NUMTIT'
        );

      const titulos =
        separarTitulos(
          titulosBruto
        );

      return {

        empresa:
          numero(
            campoXml(
              bloco,
              'CODEMP'
            )
          ),

        filial:
          numero(
            campoXml(
              bloco,
              'CODFIL'
            )
          ),

        fornecedor:
          numero(
            campoXml(
              bloco,
              'CODFOR'
            )
          ),

        ordemCompra:
          numeroOc,

        emissao:
          dataIso(
            campoXml(
              bloco,
              'DATEMI'
            )
          ),

        geracao: {

          data:
            dataIso(
              campoXml(
                bloco,
                'DATGER'
              )
            ),

          horaSenior:
            numero(
              campoXml(
                bloco,
                'HORGER'
              )
            )
        },

        valores: {

          liquido:
            numero(
              campoXml(
                bloco,
                'VLRLIQ'
              )
            ),

          financeiro:
            numero(
              campoXml(
                bloco,
                'VLRFIN'
              )
            )
        },

        referencias: {

          notaFiscal:
            campoXml(
              bloco,
              'USU_NUMNFC'
            ),

          titulosInformados:
            titulosBruto,

          titulos:
            titulos,

          quantidadeTitulos:
            titulos.length
        }
      };
    }
  );


// ============================================================
// 10. REORDENA CONFORME AS 3 COMPRAS SELECIONADAS
// ============================================================

const comprasComReferencias =
  comprasSelecionadas.map(
    compra => {

      const ref =
        referencias.find(
          item =>
            Number(item.ordemCompra) ===
            Number(compra.numero)
        );

      return {

        ordemHistorico:
          compra.ordemHistorico,

        empresa:
          compra.empresa,

        filial:
          compra.filial,

        numero:
          compra.numero,

        fornecedor:
          compra.fornecedor,

        emissao:
          compra.emissao,

        geracao:
          compra.geracao,

        valores:
          compra.valores,

        aprovacao:
          compra.aprovacao,

        situacao:
          compra.situacao,

        referenciasFinanceiras:
          ref?.referencias || {

            notaFiscal:
              null,

            titulosInformados:
              null,

            titulos:
              [],

            quantidadeTitulos:
              0
          }
      };
    }
  );


// ============================================================
// 11. CRIA LISTA PLANA DOS TÍTULOS
//
// Um item por título.
// Isso facilitará muito as próximas consultas.
// ============================================================

const titulosParaConsulta = [];

for (const compra of comprasComReferencias) {

  const titulos =
    compra
      ?.referenciasFinanceiras
      ?.titulos || [];

  titulos.forEach(
    (numTit, indice) => {

      titulosParaConsulta.push({

        empresa:
          Number(compra.empresa),

        filial:
          Number(compra.filial),

        fornecedor:
          Number(compra.fornecedor),

        ordemCompra:
          Number(compra.numero),

        ordemHistorico:
          Number(compra.ordemHistorico),

        sequenciaTituloNaCompra:
          indice + 1,

        numeroTitulo:
          String(numTit),

        notaFiscalInformada:
          compra
            ?.referenciasFinanceiras
            ?.notaFiscal || null,

        valorCompra:
          numero(
            compra
              ?.valores
              ?.financeiro
          ),

        emissaoCompra:
          compra.emissao,

        chaveConsulta:
          [
            compra.empresa,
            compra.filial,
            compra.fornecedor,
            numTit
          ].join('|')
      });
    }
  );
}


// ============================================================
// 12. VALIDAÇÕES
// ============================================================

const comprasSemReferencia =
  comprasComReferencias.filter(
    compra =>
      !referencias.some(
        ref =>
          Number(ref.ordemCompra) ===
          Number(compra.numero)
      )
  );


const comprasSemTitulo =
  comprasComReferencias.filter(
    compra =>
      (
        compra
          ?.referenciasFinanceiras
          ?.titulos
          ?.length || 0
      ) === 0
  );


const titulosDuplicados =
  titulosParaConsulta
    .filter(
      (titulo, indice, lista) =>
        lista.findIndex(
          outro =>
            outro.chaveConsulta ===
            titulo.chaveConsulta
        ) !== indice
    );


// ============================================================
// 13. RESUMO
// ============================================================

const valorTotalCompras =
  comprasComReferencias.reduce(
    (soma, compra) =>
      soma +
      numero(
        compra
          ?.valores
          ?.financeiro
      ),
    0
  );


// ============================================================
// 14. RETORNO
// ============================================================

return [
  {
    json: {

      identificacao: {
        empresa,
        fornecedor,
        ordemCompraAtual:
          historico
            ?.identificacao
            ?.ordemCompraAtual || null
      },


      compras:
        comprasComReferencias,


      titulosParaConsulta:
        titulosParaConsulta,


      resumo: {

        quantidadeCompras:
          comprasComReferencias.length,

        quantidadeTitulos:
          titulosParaConsulta.length,

        valorTotalCompras:
          valorTotalCompras,

        comprasSemReferencia:
          comprasSemReferencia.length,

        comprasSemTitulo:
          comprasSemTitulo.length,

        titulosDuplicados:
          titulosDuplicados.length,

        referenciasCompletas:
          comprasSemReferencia.length === 0,

        titulosCompletos:
          comprasSemTitulo.length === 0
      },


      alertas: [

        ...comprasSemReferencia.map(
          compra => ({
            codigo:
              'OC_HISTORICA_SEM_REFERENCIA',

            ordemCompra:
              compra.numero,

            mensagem:
              'A OC histórica não foi retornada na consulta de referências financeiras.'
          })
        ),

        ...comprasSemTitulo.map(
          compra => ({
            codigo:
              'OC_HISTORICA_SEM_TITULO',

            ordemCompra:
              compra.numero,

            mensagem:
              'A OC histórica não possui título informado em USU_NUMTIT.'
          })
        )
      ],


      meta: {

        etapa:
          'NORMALIZAR_REFERENCIAS_FINANCEIRAS_HISTORICO',

        fonte:
          'E420OCP.USU_NUMNFC + E420OCP.USU_NUMTIT',

        origem:
          'Senior ERP',

        metodo:
          'GetDBInfo',

        regraSeparacaoTitulos:
          'Separar somente por " - "; preservar o caractere $ dentro do número do título.'
      }
    }
  }
];
}
