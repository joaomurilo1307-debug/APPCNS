// Cliente do web service GravarTitulosCP_4 da Senior (Sapiens G5, pacote
// com.senior.g5.co.mfi.cpa.titulos): cria titulo a pagar. ESCREVE no contas a
// pagar -- so' chamar depois de conferir que a OC esta aprovada e sem titulo.
//
// Contrato: documentacao.senior.com.br/goup/5.10.3/webservices/com_senior_g5_co_mfi_cpa_titulos.htm
// Os campos saem em ORDEM ALFABETICA (xs:sequence real do servidor, conferido em
// ...cpa_titulos?xsd em 15/10/2026), nao na ordem da pagina da documentacao.
// Rollback de um titulo criado: ExcluirTitulosCP (mesmo pacote).

import { dataSenior, valorSenior } from "./baixaTitulos";

const URL_PADRAO =
  "https://web01s1p.seniorcloud.com.br:30901/g5-senior-services/sapiens_Synccom_senior_g5_co_mfi_cpa_titulos";

export const TPT_PADRAO = "OUT";
export const TNS_PADRAO = "90500"; // transacao dos titulos reais gerados pelo financeiro (007988, 335A1)

export type TituloNovo = {
  codEmp: number;
  codFil: number;
  numTit: string;
  codTpt: string;
  codFor: number;
  codTns: string;
  emissao: Date;
  vencimento: Date;
  valor: number;
  obs: string;
  codFpg?: string;
  codCcu?: string;
  ctaFin?: string;
  numPrj?: string;
  codFpj?: string;
  codPor?: string;
  codCrt?: string;
  codBan?: string;
  codAge?: string;
  ccbFor?: string;
  tipTcc?: number;
  tpcPix?: number;
  chvPix?: string;
  codBar?: string;
};

export type ResultadoGravacao = { ok: boolean; mensagem: string; erroExecucao: string };

const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Chave PIX -> TPCPIX (1 tel, 2 e-mail, 3 CPF/CNPJ, 4 aleatoria). 11 digitos e' ambiguo (CPF ou celular): devolve null. */
export function tipoChavePix(chave: string): number | null {
  const c = chave.trim();
  if (!c) return null;
  if (c.includes("@")) return 2;
  if (/^[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}$/i.test(c)) return 4;
  if (/^\+55\d{10,11}$/.test(c.replace(/[\s()-]/g, ""))) return 1;
  if (/^\d{14}$/.test(c.replace(/\D/g, "")) && !/[a-z]/i.test(c)) return 3;
  return null;
}

export function montarEnvelopeTitulo(t: TituloNovo, usuario: string, senha: string): string {
  const inteiro = (n: number) => Number.isSafeInteger(n) && n > 0 && n <= 2147483647;
  if (!inteiro(t.codEmp) || !inteiro(t.codFil) || !inteiro(t.codFor)) throw new Error("Empresa/filial/fornecedor invalido.");
  if (!t.numTit.trim() || t.numTit.length > 15) throw new Error("Numero do titulo invalido (1 a 15 caracteres).");
  if (!t.codTpt.trim() || t.codTpt.length > 3) throw new Error("Tipo de titulo invalido (ate 3 caracteres).");

  // Alfabetica. Campos vazios nao sao enviados.
  const campos: [string, string | undefined][] = [
    ["ccbFor", t.ccbFor],
    ["chvPix", t.chvPix],
    ["codAge", t.codAge],
    ["codBan", t.codBan],
    ["codBar", t.codBar],
    ["codCcu", t.codCcu],
    ["codCrt", t.codCrt],
    ["codEmp", String(t.codEmp)],
    ["codFil", String(t.codFil)],
    ["codFor", String(t.codFor)],
    ["codFpg", t.codFpg],
    ["codFpj", t.codFpj],
    ["codPor", t.codPor],
    ["codTns", t.codTns],
    ["codTpt", t.codTpt],
    ["ctaFin", t.ctaFin],
    ["datEmi", dataSenior(t.emissao)],
    ["datEnt", dataSenior(t.emissao)],
    ["numPrj", t.numPrj],
    ["numTit", t.numTit],
    ["obsTcp", t.obs.slice(0, 250)],
    ["tipTcc", t.tipTcc ? String(t.tipTcc) : undefined],
    ["tpcPix", t.chvPix && t.tpcPix ? String(t.tpcPix) : undefined],
    ["vctOri", dataSenior(t.vencimento)],
    ["vlrOri", valorSenior(t.valor)],
  ];
  const corpo = campos.filter(([, v]) => v).map(([k, v]) => `<${k}>${esc(v!)}</${k}>`).join("");
  return (
    `<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ser="http://services.senior.com.br">` +
    `<soapenv:Header/><soapenv:Body><ser:GravarTitulosCP_4>` +
    `<user>${esc(usuario)}</user><password>${esc(senha)}</password><encryption>0</encryption>` +
    `<parameters><sistemaIntegracao>APPCNS</sistemaIntegracao><titulos>${corpo}</titulos></parameters>` +
    `</ser:GravarTitulosCP_4></soapenv:Body></soapenv:Envelope>`
  );
}

const desesc = (t: string) =>
  t.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");
const campo = (b: string, n: string) =>
  desesc(new RegExp(`<(?:[\\w-]+:)?${n}\\b[^>]*>([\\s\\S]*?)</(?:[\\w-]+:)?${n}>`).exec(b)?.[1] ?? "").trim();

/** Sucesso = tipoRetorno 0, sem erroExecucao e tipRet 0 no resultado. Qualquer outra coisa e' falha. */
export function lerRespostaTitulo(xml: string): ResultadoGravacao {
  const falha = /<(?:[\w-]+:)?faultstring\b[^>]*>([\s\S]*?)<\/(?:[\w-]+:)?faultstring>/.exec(xml);
  if (falha) return { ok: false, mensagem: "", erroExecucao: desesc(falha[1]).trim() };
  const erroExecucao = campo(xml, "erroExecucao");
  const tipoRetorno = campo(xml, "tipoRetorno");
  const tipRet = campo(xml, "tipRet");
  const msg = campo(xml, "msgRet") || campo(xml, "mensagemRetorno");
  return { ok: !erroExecucao && tipoRetorno === "0" && tipRet === "0", mensagem: msg, erroExecucao };
}

export async function gravarTituloCP(t: TituloNovo, fetchImpl: typeof fetch = fetch): Promise<ResultadoGravacao> {
  const usuario = process.env.SENIOR_WS_SAPIENS_USER;
  const senha = process.env.SENIOR_WS_SAPIENS_PASSWORD;
  if (!usuario || !senha) throw new Error("Defina SENIOR_WS_SAPIENS_USER e SENIOR_WS_SAPIENS_PASSWORD no .env (nao versionado).");
  const r = await fetchImpl(process.env.SENIOR_WS_BAIXA_URL?.trim() || URL_PADRAO, {
    method: "POST",
    headers: { "Content-Type": "text/xml; charset=UTF-8", SOAPAction: '""' },
    body: montarEnvelopeTitulo(t, usuario, senha),
    signal: AbortSignal.timeout(60_000),
  });
  const lido = lerRespostaTitulo(await r.text());
  if (!r.ok) return { ...lido, ok: false, erroExecucao: lido.erroExecucao || `HTTP ${r.status} ao gravar titulo. Conferir na Senior antes de repetir.` };
  return lido;
}
