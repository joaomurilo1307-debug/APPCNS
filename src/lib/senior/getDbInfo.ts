// Cliente do web service GetDBInfo da Senior (Sapiens G5): executa um SELECT
// de leitura no banco do ERP e devolve as linhas. So' LEITURA -- nunca chamar
// portas de execucao do mesmo dominio. Dialeto SQL limitado (sem ROWNUM/DUAL/
// COUNT(DISTINCT), filtro de data nao confiavel, numerico sem aspas) -- ver
// GabrielOS/senior_conhecimento_tecnico.md.
//
// Credenciais SO' por variavel de ambiente (nunca no codigo nem no repo):
//   SENIOR_WS_SAPIENS_USER / SENIOR_WS_SAPIENS_PASSWORD
//   SENIOR_WS_SAPIENS_URL (opcional -- ja tem o endpoint padrao do tenant)

export type LinhaSenior = Record<string, string>;

const URL_PADRAO = "https://web01s1p.seniorcloud.com.br:30901/g5-senior-services/sapiens_Synccom_senior_g5_co_ger_db";

function escaparXml(texto: string): string {
  return texto.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function desescaparXml(texto: string): string {
  return texto
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

/** Outra porta GetDBInfo da Senior (ex.: a da folha, HCM/Rubi), com credencial propria. Sem isto, usa a do ERP. */
export type DestinoSenior = { url: string; usuario: string; senha: string };

function montarEnvelope(sql: string, params: string, destino?: DestinoSenior): string {
  const usuario = destino?.usuario ?? process.env.SENIOR_WS_SAPIENS_USER;
  const senha = destino?.senha ?? process.env.SENIOR_WS_SAPIENS_PASSWORD;
  if (!usuario || !senha) {
    throw new Error("Defina SENIOR_WS_SAPIENS_USER e SENIOR_WS_SAPIENS_PASSWORD no .env (nao versionado).");
  }
  return (
    `<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ser="http://services.senior.com.br">` +
    `<soapenv:Header/><soapenv:Body><ser:GetDBInfo>` +
    `<user>${escaparXml(usuario)}</user><password>${escaparXml(senha)}</password><encryption>0</encryption>` +
    `<parameters><pmSQL>${escaparXml(sql)}</pmSQL><pmParams>${params}</pmParams></parameters>` +
    `</ser:GetDBInfo></soapenv:Body></soapenv:Envelope>`
  );
}

function decodificarResposta(base64: string): string {
  const buffer = Buffer.from(base64.trim(), "base64");
  const utf8 = buffer.toString("utf8");
  return utf8.includes("�") ? buffer.toString("latin1") : utf8;
}

function lerLinhas(xml: string): LinhaSenior[] {
  const linhas: LinhaSenior[] = [];
  for (const bloco of xml.matchAll(/<line>([\s\S]*?)<\/line>/g)) {
    const linha: LinhaSenior = {};
    for (const campo of bloco[1].matchAll(/<([A-Za-z0-9_]+)>([\s\S]*?)<\/\1>|<([A-Za-z0-9_]+)\s*\/>/g)) {
      if (campo[3]) linha[campo[3]] = "";
      else linha[campo[1]] = desescaparXml(campo[2]).trim();
    }
    linhas.push(linha);
  }
  return linhas;
}

// O manual do web service nao deixa claro se "sem parametros" e' vazio ou um
// <params/> escapado -- tenta as duas formas antes de desistir.
const FORMAS_DE_PARAMS = ["&lt;params&gt;&lt;/params&gt;", ""];

// Em globalThis: os agendadores internos (instrumentation) e as rotas podem carregar copias diferentes deste modulo, e a fila
// precisa ser uma so' no processo.
const fila = ((globalThis as { __filaSenior?: { ultima: Promise<void> } }).__filaSenior ??= { ultima: Promise.resolve() });

// Todas as telas compartilham uma fila por processo; duas requisicoes HTTP
// simultaneas nao disparam consultas concorrentes no GetDBInfo.
export function consultarSenior(sql: string, opcoes?: { timeoutMs?: number; destino?: DestinoSenior }): Promise<LinhaSenior[]> {
  return emFilaSenior(() => executarConsultaSenior(sql, opcoes?.timeoutMs, opcoes?.destino));
}

/**
 * Sem passar pela fila: so' para a busca de titulos e OCs em segundo plano (src/lib/senior/sincronizacao/), que ja faz uma
 * consulta por vez e tem consultas de varios minutos (historico de pagos: ~9 min so' o tipo NFS, 12/11/2026) que nao podem
 * segurar as telas. No maximo duas chamadas ao mesmo tempo (a da busca e a da fila), como quando a busca rodava no VPS.
 */
export function consultarSeniorForaDaFila(sql: string, opcoes?: { timeoutMs?: number; destino?: DestinoSenior }): Promise<LinhaSenior[]> {
  return executarConsultaSenior(sql, opcoes?.timeoutMs, opcoes?.destino);
}

/**
 * Entra na MESMA fila das consultas acima: uma chamada ao web service por vez em todo o processo. Quem fala com a
 * Senior por outro caminho (ex.: o motor do dossie, que monta o proprio SOAP) usa isto para nao competir com as telas.
 * A falha de uma tarefa nao trava a fila.
 */
export function emFilaSenior<T>(tarefa: () => Promise<T>): Promise<T> {
  const execucao = fila.ultima.then(tarefa);
  fila.ultima = execucao.then(() => undefined, () => undefined);
  return execucao;
}

async function executarConsultaSenior(sql: string, timeoutMs = 60_000, destino?: DestinoSenior): Promise<LinhaSenior[]> {
  const url = destino?.url ?? (process.env.SENIOR_WS_SAPIENS_URL?.trim() || URL_PADRAO);
  let ultimoErro = "erro desconhecido";

  for (const params of FORMAS_DE_PARAMS) {
    const resposta = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "text/xml; charset=UTF-8", SOAPAction: '""' },
      body: montarEnvelope(sql, params, destino),
      signal: AbortSignal.timeout(timeoutMs),
    });
    const texto = await resposta.text();
    if (!resposta.ok) throw new Error(`Senior respondeu HTTP ${resposta.status}. Os dados nao puderam ser conferidos.`);
    const erroExecucao = /<(?:[\w-]+:)?erroExecucao\b[^>]*>([\s\S]*?)<\/(?:[\w-]+:)?erroExecucao>/.exec(texto)?.[1];
    if (erroExecucao?.trim()) throw new Error("Senior recusou a consulta. Os dados nao puderam ser conferidos.");

    const falha = /<faultstring>([\s\S]*?)<\/faultstring>/.exec(texto);
    if (falha) {
      ultimoErro = desescaparXml(falha[1]);
      continue;
    }
    const retorno = /<pmReturnGetDBInfo[^>]*>([\s\S]*?)<\/pmReturnGetDBInfo>/.exec(texto);
    if (!retorno) {
      ultimoErro = `HTTP ${resposta.status}: ${texto.slice(0, 300)}`;
      continue;
    }

    const xml = decodificarResposta(retorno[1]);
    const linhas = lerLinhas(xml);
    if (linhas.length === 0 && /erro|error|exception/i.test(xml)) {
      throw new Error(`Senior recusou a consulta: ${xml.slice(0, 400)}`);
    }
    return linhas;
  }

  throw new Error(`Falha ao consultar a Senior: ${ultimoErro}`);
}
