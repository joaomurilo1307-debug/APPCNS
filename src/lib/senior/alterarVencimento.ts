// Altera o vencimento programado (VCTPRO, "vencimento atual") de UM titulo a pagar na Senior
// pelo web service AlteraTitulosCP (pacote com.senior.g5.co.mfi.cpa.alteratituloscp, = tela
// F501ATL). ESCREVE no contas a pagar -- so' chama com o titulo aberto (AB) e depois CONFERE
// na Senior se o VCTPRO realmente mudou (a mensagem de sucesso do servico nao e' documentada,
// entao a prova e' a releitura, nao o texto da resposta). So' vctPro e' enviado: o vencimento
// original (vctOri) e a data provavel de pagamento (datPpt) ficam como estao.
//
// Contrato conferido no XSD do tenant em 15/10/2026 e na doc ERP 5.10.4: campos em ordem
// alfabetica; datas DD/MM/YYYY; os campos de gridTitulosAlterar sao todos opcionais, a chave
// e' codFil + numTit + codTpt + codFor (dentro do codEmp).
// Rollback: chamar de novo com o vencimento anterior (a tela guarda a programacao de origem).

import { dataSenior } from "./baixaTitulos";
import { consultarSenior } from "./getDbInfo";
import { COD_EMP, dataIso } from "./ocsConferencia";

const URL_PADRAO =
  "https://web01s1p.seniorcloud.com.br:30901/g5-senior-services/sapiens_Synccom_senior_g5_co_mfi_cpa_alteratituloscp";

export type ChaveTitulo = { codFil: number; numTit: string; codTpt: string; codFor: number };
export type ResultadoAlteracao = { ok: boolean; mensagem: string };

const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export function montarEnvelopeVencimento(c: ChaveTitulo, novoVencimento: Date, usuario: string, senha: string): string {
  const inteiro = (n: number) => Number.isSafeInteger(n) && n > 0 && n <= 2147483647;
  if (!inteiro(c.codFil) || !inteiro(c.codFor)) throw new Error("Filial/fornecedor inválido.");
  if (!c.numTit.trim() || c.numTit.length > 15 || !c.codTpt.trim() || c.codTpt.length > 3) throw new Error("Chave do título inválida.");
  return (
    `<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ser="http://services.senior.com.br">` +
    `<soapenv:Header/><soapenv:Body><ser:AlteraTitulosCP>` +
    `<user>${esc(usuario)}</user><password>${esc(senha)}</password><encryption>0</encryption>` +
    `<parameters><codEmp>${COD_EMP}</codEmp>` +
    `<gridTitulosAlterar><codFil>${c.codFil}</codFil><codFor>${c.codFor}</codFor><codTpt>${esc(c.codTpt)}</codTpt>` +
    `<numTit>${esc(c.numTit)}</numTit><vctPro>${dataSenior(novoVencimento)}</vctPro></gridTitulosAlterar>` +
    `</parameters></ser:AlteraTitulosCP></soapenv:Body></soapenv:Envelope>`
  );
}

const desesc = (t: string) => t.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");
const campo = (b: string, n: string) =>
  desesc(new RegExp(`<(?:[\\w-]+:)?${n}\\b[^>]*>([\\s\\S]*?)</(?:[\\w-]+:)?${n}>`).exec(b)?.[1] ?? "").trim();

/** Texto de retorno do servico (txtRet / erroExecucao / faultstring) -- so' pra mostrar; o sucesso e' decidido pela releitura. */
export function lerRespostaAltera(xml: string): { mensagem: string; erro: boolean } {
  const falha = /<(?:[\w-]+:)?faultstring\b[^>]*>([\s\S]*?)<\/(?:[\w-]+:)?faultstring>/.exec(xml);
  if (falha) return { mensagem: desesc(falha[1]).trim(), erro: true };
  const erroExecucao = campo(xml, "erroExecucao");
  const txt = campo(xml, "txtRet");
  const resultado = campo(xml, "resultado");
  return { mensagem: erroExecucao || txt || resultado, erro: !!erroExecucao || /^erro/i.test(resultado) };
}

async function lerTitulo(c: ChaveTitulo) {
  const [l] = await consultarSenior(
    `SELECT VCTPRO, SITTIT, VLRABE FROM E501TCP WHERE CODEMP IN (${COD_EMP}) AND CODFIL IN (${c.codFil}) AND CODFOR IN (${c.codFor}) AND NUMTIT IN ('${c.numTit.replace(/'/g, "''")}') AND CODTPT IN ('${c.codTpt.replace(/'/g, "''")}')`
  );
  return l ? { vctPro: dataIso(l.VCTPRO), sitTit: l.SITTIT, aberto: Number(l.VLRABE.replace(",", ".")) > 0 } : null;
}

export async function alterarVencimentoTitulo(c: ChaveTitulo, novoVencimento: Date, fetchImpl: typeof fetch = fetch): Promise<ResultadoAlteracao> {
  const usuario = process.env.SENIOR_WS_SAPIENS_USER;
  const senha = process.env.SENIOR_WS_SAPIENS_PASSWORD;
  if (!usuario || !senha) throw new Error("Defina SENIOR_WS_SAPIENS_USER e SENIOR_WS_SAPIENS_PASSWORD no .env (nao versionado).");
  const alvo = novoVencimento.toISOString().slice(0, 10);

  const antes = await lerTitulo(c);
  if (!antes) return { ok: false, mensagem: "Título não encontrado na Senior." };
  if (antes.sitTit !== "AB" || !antes.aberto)
    return { ok: false, mensagem: `Título na situação ${antes.sitTit || "?"} (só título aberto AB, com saldo, pode ter o vencimento alterado — título em remessa/pagamento eletrônico ou liquidado não).` };
  if (antes.vctPro === alvo) return { ok: true, mensagem: "O vencimento já estava nessa data na Senior." };

  const r = await fetchImpl(process.env.SENIOR_WS_ALTERA_URL?.trim() || URL_PADRAO, {
    method: "POST",
    headers: { "Content-Type": "text/xml; charset=UTF-8", SOAPAction: '""' },
    body: montarEnvelopeVencimento(c, novoVencimento, usuario, senha),
    signal: AbortSignal.timeout(60_000),
  });
  const lido = lerRespostaAltera(await r.text());

  const depois = await lerTitulo(c).catch(() => null);
  if (depois?.vctPro === alvo) return { ok: true, mensagem: lido.mensagem };
  return {
    ok: false,
    mensagem: lido.mensagem || (r.ok ? "A Senior não alterou o vencimento (sem detalhe)." : `Senior respondeu HTTP ${r.status}.`),
  };
}
