// @ts-nocheck
// No Code do workflow n8n "Normalizar Títulos Histórico E501TCP" (Dossie OC SeniorX v6.4), codigo original sem alteracoes.
// Globais do n8n: $input, $ (como $('Outro no')), $json e items (= $input.all()).
export default async function ($input, $, $json) {
// ============================================================
// NORMALIZAR TÍTULOS HISTÓRICO E501TCP — v2
//
// Entrada: Coletar Títulos Histórico E501TCP
//
// v2 acrescenta o que faltava para o bloco "Histórico do Fornecedor":
//   - data de emissão do título (DATEMI já vinha no SELECT, mas não
//     era extraída)
//   - o contextoHistorico (qual OC, qual valor, qual NF) vindo do
//     "Preparar Títulos Histórico E501TCP", correlacionado pela chave
//     empresa|filial|fornecedor|numeroTítulo
// ============================================================

const respostas = $input.all();
const titulos = [];

// ============================================================
// FUNÇÕES AUXILIARES
// ============================================================

function campoXml(xml, campo) {
  const m = xml.match(new RegExp(`<${campo}>([\\s\\S]*?)<\\/${campo}>`, 'i'));
  return m ? m[1].trim() : null;
}

function numero(valor) {
  if (valor === null || valor === undefined || valor === '') return 0;
  const n = Number(String(valor).replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
}

function dataISO(valor) {
  if (!valor) return null;
  const p = String(valor).split('/');
  if (p.length !== 3) return valor;
  return `${p[2]}-${p[1]}-${p[0]}`;
}

function situacaoTitulo(codigo) {
  const mapa = {
    LQ: 'LIQUIDADO',
    AB: 'ABERTO',
    CA: 'CANCELADO',
  };
  return mapa[codigo] || codigo;
}

// ============================================================
// CONTEXTO HISTÓRICO (de qual OC veio cada título)
// ============================================================

const contextoPorChave = new Map();

try {
  for (const item of $('Preparar Títulos Histórico E501TCP').all()) {
    const j = item.json || {};
    const chave = j.tituloConsulta?.chave;
    if (chave) contextoPorChave.set(String(chave), j.contextoHistorico || {});
  }
} catch (e) {
  // Sem contexto disponível o nó continua funcionando, só sem enriquecimento.
}

function chaveDe(empresa, filial, fornecedor, numeroTitulo) {
  return [empresa, filial, fornecedor, numeroTitulo].join('|');
}

// ============================================================
// PROCESSAMENTO SOAP
// ============================================================

for (const resposta of respostas) {
  const soap = resposta.json.data;
  if (!soap) continue;

  const retorno = campoXml(soap, 'pmReturnGetDBInfo');
  if (!retorno) continue;

  const xmlInterno = Buffer.from(retorno, 'base64').toString('latin1');
  const linhas = [...xmlInterno.matchAll(/<line>([\s\S]*?)<\/line>/gi)].map((x) => x[1]);

  for (const linha of linhas) {
    const empresa = numero(campoXml(linha, 'CODEMP'));
    const filial = numero(campoXml(linha, 'CODFIL'));
    const fornecedor = numero(campoXml(linha, 'CODFOR'));
    const numeroTitulo = campoXml(linha, 'NUMTIT');
    const situacaoCodigo = campoXml(linha, 'SITTIT');

    const contexto = contextoPorChave.get(
      chaveDe(empresa, filial, fornecedor, numeroTitulo),
    ) || {};

    titulos.push({
      identificacao: {
        empresa,
        filial,
        fornecedor,
        numero: numeroTitulo,
        tipo: campoXml(linha, 'CODTPT'),
      },
      financeiro: {
        situacaoCodigo,
        situacao: situacaoTitulo(situacaoCodigo),
        valorOriginal: numero(campoXml(linha, 'VLRORI')),
        saldoAberto: numero(campoXml(linha, 'VLRABE')),
      },
      datas: {
        emissao: dataISO(campoXml(linha, 'DATEMI')),
      },
      vencimentos: {
        original: dataISO(campoXml(linha, 'VCTORI')),
        prorrogado: dataISO(campoXml(linha, 'VCTPRO')),
      },
      pagamento: {
        ultimoPagamento: dataISO(campoXml(linha, 'ULTPGT')),
      },
      documento: {
        empresaNF: numero(campoXml(linha, 'FORNFC')),
        filialNF: numero(campoXml(linha, 'FILNFC')),
        numeroNF: campoXml(linha, 'NUMNFC'),
        serieNF: campoXml(linha, 'SNFNFC'),
      },
      contextoHistorico: {
        ordemCompra: contexto.ordemCompra ?? null,
        ordemHistorico: contexto.ordemHistorico ?? null,
        valorCompra: contexto.valorCompra ?? null,
        emissaoCompra: contexto.emissaoCompra ?? null,
        notaFiscalInformada: contexto.notaFiscalInformada ?? null,
      },
      meta: {
        fonte: 'E501TCP',
        etapa: 'NORMALIZAR_TITULOS_HISTORICO',
      },
    });
  }
}

// ============================================================
// RETORNO
// ============================================================

return [
  {
    json: {
      titulos,
      resumo: {
        quantidadeTitulos: titulos.length,
        liquidados: titulos.filter((t) => t.financeiro.situacaoCodigo === 'LQ').length,
        abertos: titulos.filter((t) => t.financeiro.situacaoCodigo === 'AB').length,
        saldoAbertoTotal: titulos.reduce((s, t) => s + t.financeiro.saldoAberto, 0),
        comContextoHistorico: titulos.filter(
          (t) => t.contextoHistorico.ordemCompra !== null,
        ).length,
      },
      meta: {
        origem: 'Senior ERP',
        tabela: 'E501TCP',
        finalidade: 'NORMALIZACAO_STATUS_FINANCEIRO_TITULOS',
        versao: '2.0',
      },
    },
  },
];
}
