// Cliente da porta customizada PostDBInfoFinan (servico com.senior.g5.co.ger.db,
// regra LSP da Consominas -- NAO e' web service nativo da Senior): troca a
// situacao de UM titulo a pagar entre AB (aberto) e PE (pagamento eletronico).
// Existe porque o web service oficial AlteraTitulosCP recusa trocar situacao
// ("Situacao nao pode ser alterada manualmente", testado 13/10/2026).
//
// A regra so' aceita AB->PE e PE->AB, com a chave completa do titulo, e so'
// altera E501TCP.SITTIT (portador/SITANT/NUMPGE ficam como estao). Testada por
// SOAP externo em 13/10/2026: commit confirmado por leitura posterior.
// Fonte da regra: RenataOS grupo-consominas/sql/postdbinfofinan_v1_1.lsp.

const URL_PADRAO = "https://web01s1p.seniorcloud.com.br:30901/g5-senior-services/sapiens_Synccom_senior_g5_co_ger_db";

export type ChaveTitulo = { codFil: number; codFor: number; codTpt: string; numTit: string };
export type ResultadoSituacao = { ok: boolean; mensagem: string };

// Mensagem fixa da regra quando o titulo nao esta na situacao de origem
// (ja esta no destino, liquidado, cancelado...). Nao e' falha de comunicacao.
export const MSG_FORA_DA_ORIGEM = "Titulo nao encontrado na situacao de origem";

function escaparXml(texto: string): string {
  return texto.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function montarEnvelopeSituacao(chave: ChaveTitulo, sitTit: "AB" | "PE", usuario: string, senha: string): string {
  // Campos na ordem do xs:sequence do XSD publicado (alfabetica).
  return (
    `<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ser="http://services.senior.com.br">` +
    `<soapenv:Header/><soapenv:Body><ser:PostDBInfoFinan>` +
    `<user>${escaparXml(usuario)}</user><password>${escaparXml(senha)}</password><encryption>0</encryption>` +
    `<parameters>` +
    `<codEmp>1</codEmp><codFil>${chave.codFil}</codFil><codFor>${chave.codFor}</codFor>` +
    `<codTpt>${escaparXml(chave.codTpt)}</codTpt><numTit>${escaparXml(chave.numTit)}</numTit><sitTit>${sitTit}</sitTit>` +
    `</parameters></ser:PostDBInfoFinan></soapenv:Body></soapenv:Envelope>`
  );
}

export function lerRespostaSituacao(texto: string): ResultadoSituacao {
  const campo = (nome: string) => new RegExp(`<(?:[\\w-]+:)?${nome}\\b[^>]*>([\\s\\S]*?)</(?:[\\w-]+:)?${nome}>`).exec(texto)?.[1].trim() ?? "";
  const falha = campo("faultstring") || campo("erroExecucao");
  if (falha) return { ok: false, mensagem: falha };
  return { ok: campo("sucesso") === "1", mensagem: campo("mensagem") || "Senior nao detalhou a resposta" };
}

export async function alterarSituacaoTitulo(chave: ChaveTitulo, sitTit: "AB" | "PE"): Promise<ResultadoSituacao> {
  const usuario = process.env.SENIOR_WS_SAPIENS_USER;
  const senha = process.env.SENIOR_WS_SAPIENS_PASSWORD;
  if (!usuario || !senha) return { ok: false, mensagem: "SENIOR_WS_SAPIENS_USER/PASSWORD nao configurados." };
  try {
    const resposta = await fetch(process.env.SENIOR_WS_SAPIENS_URL?.trim() || URL_PADRAO, {
      method: "POST",
      headers: { "Content-Type": "text/xml; charset=UTF-8", SOAPAction: '""' },
      body: montarEnvelopeSituacao(chave, sitTit, usuario, senha),
      signal: AbortSignal.timeout(60_000),
    });
    const lido = lerRespostaSituacao(await resposta.text());
    return resposta.ok ? lido : { ok: false, mensagem: lido.mensagem || `HTTP ${resposta.status}` };
  } catch (e: any) {
    return { ok: false, mensagem: `Sem resposta da Senior (${String(e?.message ?? e).slice(0, 150)})` };
  }
}
