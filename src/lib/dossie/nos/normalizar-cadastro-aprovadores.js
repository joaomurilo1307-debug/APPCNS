// @ts-nocheck
// No Code do workflow n8n "Normalizar Cadastro Aprovadores" (Dossie OC SeniorX v6.4), codigo original sem alteracoes.
// Globais do n8n: $input, $ (como $('Outro no')), $json e items (= $input.all()).
export default async function ($input, $, $json) {
const items = $input.all();

function decodeXmlEntities(value) {
  if (value === null || value === undefined) {
    return null;
  }

  return String(value)
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .trim();
}

function getTag(xml, tagName) {
  const regex = new RegExp(
    `<${tagName}>([\\s\\S]*?)<\\/${tagName}>`,
    'i'
  );

  const match = xml.match(regex);

  if (!match) {
    return null;
  }

  const value =
    decodeXmlEntities(match[1]);

  return value === ''
    ? null
    : value;
}

function getNumber(xml, tagName) {
  const value =
    getTag(xml, tagName);

  if (value === null) {
    return null;
  }

  const number =
    Number(
      String(value)
        .replace(/\./g, '')
        .replace(',', '.')
    );

  return Number.isFinite(number)
    ? number
    : null;
}

function descricaoSituacao(codigo) {

  const situacoes = {
    A: 'ATIVO',
    I: 'INATIVO'
  };

  return (
    situacoes[codigo] ||
    codigo ||
    null
  );
}


// ============================================================
// NORMALIZA APROVADORES
// ============================================================

const aprovadores = [];

for (const item of items) {

  const xml =
    item.json.aprovadoresXml || '';

  const linhas = [
    ...xml.matchAll(
      /<line>([\s\S]*?)<\/line>/gi
    )
  ].map(
    match => match[1]
  );

  for (const linha of linhas) {

    const situacaoCodigo =
      getTag(
        linha,
        'SITUSU'
      );

    const numEmp =
      getNumber(
        linha,
        'NUMEMP'
      );

    const tipCol =
      getNumber(
        linha,
        'TIPCOL'
      );

    const numCad =
      getNumber(
        linha,
        'NUMCAD'
      );

    const possuiVinculoColaborador =
      numEmp !== null &&
      tipCol !== null &&
      numCad !== null &&
      numEmp > 0 &&
      numCad > 0;


    // ========================================================
    // DADOS DO SGU / R910USU
    // ========================================================

    const nomeCompleto =
      getTag(
        linha,
        'NOMCOMPLETO'
      );

    const descricaoUsuario =
      getTag(
        linha,
        'DESCRICAOUSUARIO'
      );


    // ========================================================
    // REGISTRO NORMALIZADO
    // ========================================================

    aprovadores.push({

      empresa:
        getNumber(
          linha,
          'CODEMP'
        ),

      codigoUsuario:
        getNumber(
          linha,
          'CODUSU'
        ),

      usuario:
        getTag(
          linha,
          'NOMUSU'
        ),

      nomeCompleto,

      descricaoUsuario,

      email:
        getTag(
          linha,
          'INTNET'
        ),

      situacao: {

        codigo:
          situacaoCodigo,

        descricao:
          descricaoSituacao(
            situacaoCodigo
          )
      },

      supervisorImediato:
        getNumber(
          linha,
          'SUPIME'
        ),

      centroCustoCadastro:
        getTag(
          linha,
          'CODCCU'
        ),

      empresaAtiva:
        getNumber(
          linha,
          'EMPATI'
        ),

      filialAtiva:
        getNumber(
          linha,
          'FILATI'
        ),

      colaborador: {

        possuiVinculo:
          possuiVinculoColaborador,

        empresa:
          numEmp,

        tipo:
          tipCol,

        cadastro:
          numCad
      },

      origemNomeCompleto: {

        tabela:
          'R910USU',

        campo:
          'NOMCOM',

        encontrado:
          !!nomeCompleto
      }

    });

  }

}


// ============================================================
// RESUMO
// ============================================================

const quantidadeComNomeCompleto =
  aprovadores.filter(
    aprovador =>
      !!aprovador.nomeCompleto
  ).length;


// ============================================================
// SAÍDA
// ============================================================

return [
  {
    json: {

      aprovadores,

      resumoAprovadores: {

        quantidade:
          aprovadores.length,

        todosAtivos:
          aprovadores.length > 0 &&
          aprovadores.every(
            aprovador =>
              aprovador
                ?.situacao
                ?.codigo === 'A'
          ),

        quantidadeComNomeCompleto,

        todosComNomeCompleto:
          aprovadores.length > 0 &&
          quantidadeComNomeCompleto ===
            aprovadores.length
      },

      meta: {

        fonte: [
          'E099USU',
          'R910USU'
        ],

        origem:
          'Senior ERP',

        metodo:
          'GetDBInfo',

        enriquecidoNomeCompleto:
          true
      }

    }
  }
];
}
