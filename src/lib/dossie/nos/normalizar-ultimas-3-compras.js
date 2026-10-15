// @ts-nocheck
// No Code do workflow n8n "Normalizar Últimas 3 Compras" (Dossie OC SeniorX v6.4), codigo original sem alteracoes.
// Globais do n8n: $input, $ (como $('Outro no')), $json e items (= $input.all()).
export default async function ($input, $, $json) {
// ============================================================
// NORMALIZAR ÚLTIMAS 3 COMPRAS DO FORNECEDOR
//
// Entrada:
//   Coletar OCs Histórico Fornecedor
//
// Origem:
//   Senior ERP - E420OCP
//
// Objetivo:
//   1. Decodificar resposta SOAP/GetDBInfo
//   2. Localizar a OC atual
//   3. Considerar somente OCs cronologicamente anteriores
//   4. Considerar somente OCs aprovadas
//   5. Considerar somente SITOCP = 1
//   6. Selecionar as 3 compras anteriores mais recentes
//
// IMPORTANTE:
//   A seleção é feita por DATGER + HORGER,
//   e não apenas pelo número da OC.
// ============================================================


// ============================================================
// 1. DADOS DA OC ATUAL
// ============================================================

const preparacao =
  $('Preparar Histórico Fornecedor').first().json;

const codEmp =
  Number(preparacao?.codEmp);

const codFil =
  Number(preparacao?.codFil);

const codFor =
  Number(preparacao?.codFor);

const numOcpAtual =
  Number(preparacao?.numOcpAtual);

const quantidadeDesejada =
  Number(
    preparacao
      ?.historico
      ?.quantidadeDesejada ?? 3
  );


// ============================================================
// 2. VALIDAÇÕES INICIAIS
// ============================================================

if (!Number.isInteger(codEmp) || codEmp <= 0) {
  throw new Error(
    'CODEMP da OC atual não identificado.'
  );
}

if (!Number.isInteger(codFor) || codFor <= 0) {
  throw new Error(
    'CODFOR da OC atual não identificado.'
  );
}

if (!Number.isInteger(numOcpAtual) || numOcpAtual <= 0) {
  throw new Error(
    'NUMOCP da OC atual não identificado.'
  );
}


// ============================================================
// 3. RECUPERA RESPOSTA SOAP
// ============================================================

const soap =
  $json?.data;

if (!soap || typeof soap !== 'string') {
  throw new Error(
    'Resposta SOAP do GetDBInfo não encontrada em $json.data.'
  );
}


// ============================================================
// 4. VERIFICA SE O SENIOR RETORNOU ERRO
// ============================================================

const erroMatch =
  soap.match(
    /<erroExecucao[^>]*>([\s\S]*?)<\/erroExecucao>/i
  );

if (erroMatch) {

  const mensagemErro =
    erroMatch[1]
      ?.replace(/<[^>]*>/g, '')
      ?.trim();

  if (mensagemErro) {
    throw new Error(
      `Senior GetDBInfo: ${mensagemErro}`
    );
  }
}


// ============================================================
// 5. EXTRAI PMRETURNGETDBINFO
// ============================================================

const base64Match =
  soap.match(
    /<pmReturnGetDBInfo[^>]*>([\s\S]*?)<\/pmReturnGetDBInfo>/i
  );

if (!base64Match?.[1]) {
  throw new Error(
    'pmReturnGetDBInfo não encontrado na resposta SOAP.'
  );
}

const base64 =
  base64Match[1]
    .replace(/\s+/g, '')
    .trim();


// ============================================================
// 6. DECODIFICA BASE64
//
// O GetDBInfo está retornando XML ISO-8859-1.
// latin1 é o equivalente apropriado no Node.js.
// ============================================================

let xmlInterno;

try {

  xmlInterno =
    Buffer
      .from(base64, 'base64')
      .toString('latin1');

} catch (erro) {

  throw new Error(
    `Falha ao decodificar pmReturnGetDBInfo: ${erro.message}`
  );
}


// ============================================================
// 7. FUNÇÕES AUXILIARES XML
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


// ============================================================
// 8. CONVERSÃO DE DATA DD/MM/AAAA
// ============================================================

function chaveData(data) {

  if (!data) {
    return 0;
  }

  const match =
    String(data)
      .trim()
      .match(
        /^(\d{2})\/(\d{2})\/(\d{4})$/
      );

  if (!match) {
    return 0;
  }

  const dia =
    Number(match[1]);

  const mes =
    Number(match[2]);

  const ano =
    Number(match[3]);

  return (
    ano * 10000 +
    mes * 100 +
    dia
  );
}


function dataIso(data) {

  if (!data) {
    return null;
  }

  const match =
    String(data)
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
// 9. EXTRAI AS LINHAS DO XML
// ============================================================

const blocos =
  xmlInterno.match(
    /<line>([\s\S]*?)<\/line>/gi
  ) || [];

if (blocos.length === 0) {

  throw new Error(
    'Nenhuma OC foi retornada pela E420OCP.'
  );
}


// ============================================================
// 10. NORMALIZA TODAS AS OCs
// ============================================================

const todasOcs =
  blocos.map(bloco => {

    const dataGeracao =
      campoXml(
        bloco,
        'DATGER'
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

      numero:
        numero(
          campoXml(
            bloco,
            'NUMOCP'
          )
        ),

      fornecedor:
        numero(
          campoXml(
            bloco,
            'CODFOR'
          )
        ),

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
            dataGeracao
          ),

        dataOriginal:
          dataGeracao,

        chaveData:
          chaveData(
            dataGeracao
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

      aprovacao: {

        codigo:
          campoXml(
            bloco,
            'SITAPR'
          )
      },

      situacao: {

        codigo:
          campoXml(
            bloco,
            'SITOCP'
          )
      }
    };
  });


// ============================================================
// 11. LOCALIZA A OC ATUAL
// ============================================================

const ocAtual =
  todasOcs.find(
    oc =>
      Number(oc.numero) ===
      numOcpAtual
  );

if (!ocAtual) {

  throw new Error(
    `OC atual ${numOcpAtual} não foi localizada no histórico do fornecedor ${codFor}.`
  );
}


// ============================================================
// 12. REGRA CRONOLÓGICA
//
// Uma OC é anterior quando:
//
// DATGER menor
//
// OU
//
// mesma DATGER e HORGER menor
//
// Em empate extremo, NUMOCP menor serve
// apenas como critério determinístico.
// ============================================================

function ehAnterior(oc, atual) {

  const dataOc =
    numero(
      oc?.geracao?.chaveData
    );

  const dataAtual =
    numero(
      atual?.geracao?.chaveData
    );

  if (dataOc < dataAtual) {
    return true;
  }

  if (dataOc > dataAtual) {
    return false;
  }


  const horaOc =
    numero(
      oc?.geracao?.horaSenior
    );

  const horaAtual =
    numero(
      atual?.geracao?.horaSenior
    );

  if (horaOc < horaAtual) {
    return true;
  }

  if (horaOc > horaAtual) {
    return false;
  }


  return (
    Number(oc.numero) <
    Number(atual.numero)
  );
}


// ============================================================
// 13. FILTRA OCs ANTERIORES
// ============================================================

const anteriores =
  todasOcs.filter(
    oc =>
      oc.numero !== numOcpAtual &&
      ehAnterior(
        oc,
        ocAtual
      )
  );


// ============================================================
// 14. FILTRA COMPRAS VÁLIDAS
//
// Regra validada para este fluxo:
//
// SITAPR = APR
// SITOCP = 1
//
// Não estamos atribuindo descrição textual ao código
// SITOCP sem tabela oficial de domínio.
// ============================================================

const validas =
  anteriores.filter(
    oc =>
      String(
        oc?.aprovacao?.codigo ?? ''
      ).trim().toUpperCase() === 'APR' &&

      String(
        oc?.situacao?.codigo ?? ''
      ).trim() === '1'
  );


// ============================================================
// 15. ORDENA NOVAMENTE DE FORMA DETERMINÍSTICA
// ============================================================

validas.sort(
  (a, b) => {

    const data =
      numero(
        b?.geracao?.chaveData
      ) -
      numero(
        a?.geracao?.chaveData
      );

    if (data !== 0) {
      return data;
    }


    const hora =
      numero(
        b?.geracao?.horaSenior
      ) -
      numero(
        a?.geracao?.horaSenior
      );

    if (hora !== 0) {
      return hora;
    }


    return (
      Number(b.numero) -
      Number(a.numero)
    );
  }
);


// ============================================================
// 16. SELECIONA AS 3 ÚLTIMAS
// ============================================================

const comprasSelecionadas =
  validas
    .slice(
      0,
      quantidadeDesejada
    )
    .map(
      (oc, indice) => ({

        ordemHistorico:
          indice + 1,

        ...oc
      })
    );


// ============================================================
// 17. LISTA PRONTA PARA OS PRÓXIMOS SQLs
// ============================================================

const ocsSelecionadas =
  comprasSelecionadas.map(
    oc =>
      Number(oc.numero)
  );

const listaOcsSql =
  ocsSelecionadas
    .join(',');


// ============================================================
// 18. DIAGNÓSTICO
// ============================================================

const posterioresOuAtuais =
  todasOcs.length -
  anteriores.length;

const anterioresInvalidas =
  anteriores.filter(
    oc =>
      !(
        String(
          oc?.aprovacao?.codigo ?? ''
        ).trim().toUpperCase() === 'APR' &&

        String(
          oc?.situacao?.codigo ?? ''
        ).trim() === '1'
      )
  );


// ============================================================
// 19. RETORNO FINAL
// ============================================================

return [
  {
    json: {

      identificacao: {

        empresa:
          codEmp,

        filialAtual:
          codFil,

        fornecedor:
          codFor,

        ordemCompraAtual:
          numOcpAtual
      },


      ordemCompraAtual: {

        numero:
          ocAtual.numero,

        emissao:
          ocAtual.emissao,

        geracao:
          ocAtual.geracao,

        valores:
          ocAtual.valores,

        aprovacao:
          ocAtual.aprovacao,

        situacao:
          ocAtual.situacao
      },


      comprasAnteriores:
        comprasSelecionadas,


      ocsSelecionadas:
        ocsSelecionadas,


      listaOcsSql:
        listaOcsSql,


      resumo: {

        quantidadeRegistrosRetornados:
          todasOcs.length,

        quantidadeAnteriores:
          anteriores.length,

        quantidadeAnterioresValidas:
          validas.length,

        quantidadeSelecionada:
          comprasSelecionadas.length,

        quantidadeDesejada:
          quantidadeDesejada,

        historicoCompleto:
          comprasSelecionadas.length ===
          quantidadeDesejada,

        quantidadeDescartadaPorSituacao:
          anterioresInvalidas.length,

        quantidadePosteriorOuAtual:
          posterioresOuAtuais
      },


      criteriosSelecao: {

        empresa:
          codEmp,

        fornecedor:
          codFor,

        consideraTodasFiliais:
          true,

        referenciaCronologica:
          'DATGER + HORGER',

        somenteAnteriores:
          true,

        situacaoAprovacaoAceita:
          'APR',

        situacaoOcAceita:
          '1',

        quantidade:
          quantidadeDesejada
      },


      meta: {

        etapa:
          'NORMALIZAR_ULTIMAS_COMPRAS',

        fonte:
          'E420OCP',

        origem:
          'Senior ERP',

        metodo:
          'GetDBInfo'
      }
    }
  }
];
}
