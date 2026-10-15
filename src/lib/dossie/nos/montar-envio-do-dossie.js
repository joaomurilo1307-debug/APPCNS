// @ts-nocheck
// No Code do workflow n8n "Montar Envio do Dossiê" (Dossie OC SeniorX v6.4), codigo original sem alteracoes.
export default async function ($input, $, $json) {
// ============================================================
// MONTAR ENVIO DO DOSSIÊ (para o consominas-gestao)
//
// Último passo do fluxo. Empacota o que foi gerado e manda para a
// aba "Conferência de OC" do sistema, que é quem transforma o número
// do título num link na Programação de Pagamento.
//
// Roda nos DOIS desfechos:
//   GED - Processo Finalizado  -> status PUBLICADO, com o PDF
//   GED - Erro Publicação      -> status ERRO, sem PDF, com o motivo
//
// Registrar o fracasso é tão importante quanto registrar o sucesso:
// é isso que permite a tela dizer POR QUE um título não tem dossiê,
// em vez de simplesmente não mostrar nada e deixar a pergunta no ar.
//
// O PDF vai em base64 dentro do próprio JSON. Some o problema de
// binário que já nos mordeu no upload do GED (nó HTTP do n8n não
// repassa binário), ao custo de ~33% de tamanho — irrelevante para
// um documento de 4 páginas.
// ============================================================

/** Lê um nó anterior sem derrubar a execução se ele não rodou. */
function no(nome) {
  try {
    const item = $(nome).first();
    return item?.json || {};
  } catch (e) {
    return {};
  }
}

function primeiro(...valores) {
  for (const v of valores) {
    if (v !== null && v !== undefined && v !== '' && !Number.isNaN(v)) return v;
  }
  return null;
}

/** "398A1 - 196$01" -> ["398A1", "196$01"] */
function listaDeTitulos(bruto) {
  if (!bruto) return [];
  return String(bruto)
    .split(/\s+-\s+|;|,|\r?\n/)
    .map((t) => t.trim())
    .filter(Boolean);
}

/** Ignora as sentinelas de "sem data" do Senior (31/12/1900 e afins). */
function dataOuNull(valor) {
  if (!valor) return null;
  const texto = String(valor).trim();
  const iso = /^\d{2}\/\d{2}\/\d{4}$/.test(texto)
    ? `${texto.slice(6, 10)}-${texto.slice(3, 5)}-${texto.slice(0, 2)}`
    : texto.slice(0, 10);
  const ano = Number(iso.slice(0, 4));
  if (!Number.isFinite(ano) || ano < 1950 || ano > 2100) return null;
  return iso;
}

const gerador = no('Gerar HTML do Dossiê');
const dossie = no('Consolidar Dossiê Final');
const identificacao = gerador.identificacao || {};
const entrada = dossie.entrada || {};
const ordemCompra = dossie.ordemCompra || {};
const financeiro = dossie.financeiro || {};

const desfecho = $input.first().json || {};
const publicado = String(desfecho.status || '').toUpperCase() === 'SUCESSO';

// ------------------------------------------------------------
// Identificação
// ------------------------------------------------------------

const numOcp = primeiro(
  identificacao.ordemCompra,
  ordemCompra.numero,
  dossie.identificacao?.ordemCompra,
  entrada.ordemCompra,
);

const codFil = primeiro(ordemCompra.filial, dossie.identificacao?.filial, entrada.codFil, 1);
const codFor = primeiro(
  identificacao.fornecedor?.codigo,
  dossie.fornecedor?.codigo,
  ordemCompra.fornecedor,
  entrada.codFor,
);

// Todos os títulos que este dossiê responde — o índice do sistema
// precisa achar o documento por QUALQUER um deles.
const titulos = Array.from(
  new Set([
    ...listaDeTitulos(identificacao.titulo),
    ...listaDeTitulos(entrada.numeroTitulo),
    ...(Array.isArray(financeiro.titulos)
      ? financeiro.titulos.map((t) => String(t?.numero ?? '').trim()).filter(Boolean)
      : []),
  ]),
);

const valorTotal = (() => {
  const bruto = primeiro(
    ordemCompra.valores?.liquido,
    ordemCompra.valores?.final,
    ordemCompra.valores?.original,
    dossie.resumo?.valorTotalOC,
  );
  const n = Number(String(bruto ?? '').replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(n) && n !== 0 ? n : null;
})();

// Chave única do registro no sistema. Com OC, a OC manda — é um
// dossiê por OC, mesmo que ela responda por vários títulos. Sem OC
// (caso de erro antes de resolver a OC), cai pro título.
const chave = numOcp
  ? `OC|${codFil}|${numOcp}`
  : `TIT|${codFil}|${codFor ?? 'SEM_FOR'}|${titulos[0] ?? 'SEM_TITULO'}`;

// ------------------------------------------------------------
// PDF
// ------------------------------------------------------------

let arquivoBase64 = null;
let arquivoNome = null;

// Lido do node nativo 'Extrair PDF em Base64' (Extract from File, operação
// binaryToPropery), não mais direto de item.binary.data.data -- esse campo
// só tem o binário de verdade quando o n8n guarda em memória. Nesta
// instância o binary data fica em disco (modo 'filesystem-v2'), e
// item.binary.data.data vira só o marcador 'filesystem-v2' em vez do PDF --
// bug real encontrado em 16/09/2026 (todo PDF publicado até então tinha
// 9 bytes de lixo). O node nativo resolve a leitura do jeito certo,
// independente do modo de armazenamento.
if (publicado) {
  try {
    const extraido = $('Extrair PDF em Base64').first();
    if (extraido?.json?.data) {
      arquivoBase64 = extraido.json.data;
      arquivoNome = primeiro(extraido.json.arquivo, gerador.arquivoPdf, `dossie-OC-${numOcp}.pdf`);
    }
  } catch (e) {
    // nó não executou nesta rota
  }
}

const dados = {
  chave,
  numOcp: numOcp === null ? null : String(numOcp),
  codFil: String(codFil),
  codFor: codFor === null ? null : String(codFor),
  titulos,
  fornecedorNome: primeiro(
    identificacao.fornecedor?.razaoSocial,
    dossie.fornecedor?.razaoSocial,
    dossie.fornecedor?.nomeFantasia,
  ),
  vencimento: dataOuNull(identificacao.vencimento),
  valorTotal,
  status: publicado ? 'PUBLICADO' : 'ERRO',
  motivo: publicado
    ? null
    : primeiro(
        desfecho.mensagem,
        desfecho.statusGED ? `GED retornou status ${desfecho.statusGED}` : null,
        'Falha na publicação do documento no GED',
      ),
  origem: primeiro(entrada.origem, dossie.identificacao?.origem, 'MANUAL'),
  gedDocumentId: primeiro(desfecho.documentld, desfecho.documentId),
  gedVersao: primeiro(desfecho.versao),
  arquivoNome,
  arquivoBase64,
};

// Aviso, não erro: publicar sem PDF é resultado degradado, mas o
// registro ainda vale — a tela mostra "sem documento" com o motivo.
if (publicado && !arquivoBase64) {
  dados.status = 'ERRO';
  dados.motivo = 'GED publicou, mas o PDF não chegou até o envio para o sistema.';
}

return [{ json: { envio: dados, resumoEnvio: { chave, status: dados.status, titulos, comPdf: !!arquivoBase64 } } }];
}
