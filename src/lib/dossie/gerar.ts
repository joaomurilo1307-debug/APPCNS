// Gera o dossie de UMA OC dentro do APPCNS (substitui o workflow "Dossie OC (SeniorX)" do n8n):
//   1. executa o fluxo (coleta na Senior -> normaliza -> consolida -> monta o HTML)  [motor.ts]
//   2. converte o HTML em PDF no Gotenberg (GOTENBERG_URL)
//   3. empacota e grava (DossieOC + PDF)                                           [salvar.ts]
// So' leitura na Senior (GetDBInfo). Uma geracao por vez (fila em memoria): a Senior atende mal
// consultas simultaneas.

import { NOME_SAIDA, executarFluxo, type Item } from "./motor";
import { NOS } from "./nos/index.js";
import { chaveDaOc, registrarFalha, salvarDossie } from "./salvar";

const URL_SENIOR = "https://web01s1p.seniorcloud.com.br:30901/g5-senior-services/sapiens_Synccom_senior_g5_co_ger_db";

const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Chamada SOAP do fluxo: o corpo vem do fluxo com marcadores no lugar de usuario/senha. */
export async function chamarSenior(corpo: string, fetchImpl: typeof fetch = fetch): Promise<string> {
  const usuario = process.env.SENIOR_WS_SAPIENS_USER;
  const senha = process.env.SENIOR_WS_SAPIENS_PASSWORD;
  if (!usuario || !senha) throw new Error("Defina SENIOR_WS_SAPIENS_USER e SENIOR_WS_SAPIENS_PASSWORD no .env (nao versionado).");
  const chamar = () =>
    fetchImpl(process.env.SENIOR_WS_SAPIENS_URL?.trim() || URL_SENIOR, {
      method: "POST",
      headers: { "Content-Type": "text/xml; charset=UTF-8", SOAPAction: '""' },
      body: corpo.replace("__SENIOR_USER__", esc(usuario)).replace("__SENIOR_PASSWORD__", esc(senha)),
      signal: AbortSignal.timeout(60_000),
    });
  // Leitura (idempotente): uma segunda tentativa cobre a lentidao pontual da Senior (visto em 15/10/2026).
  let r: Response;
  try {
    r = await chamar();
  } catch {
    r = await chamar();
  }
  const texto = await r.text();
  if (!r.ok) throw new Error(`Senior respondeu HTTP ${r.status}.`);
  return texto;
}

export async function htmlParaPdf(html: string, fetchImpl: typeof fetch = fetch): Promise<Buffer> {
  const base = (process.env.GOTENBERG_URL?.trim() || "http://gotenberg:3000").replace(/\/$/, "");
  const form = new FormData();
  form.append("files", new Blob([html], { type: "text/html" }), "index.html");
  const r = await fetchImpl(`${base}/forms/chromium/convert/html`, { method: "POST", body: form, signal: AbortSignal.timeout(120_000) });
  if (!r.ok) throw new Error(`Gotenberg respondeu HTTP ${r.status}.`);
  const bytes = Buffer.from(await r.arrayBuffer());
  if (bytes.subarray(0, 4).toString("latin1") !== "%PDF") throw new Error("Gotenberg nao devolveu um PDF.");
  return bytes;
}

export type Dependencias = { http?: (corpo: string) => Promise<string>; pdf?: (html: string) => Promise<Buffer> };

/** Executa o fluxo e devolve o HTML + o registro pronto para gravar (sem tocar no banco). */
export async function montarDossie(oc: { codEmp?: number; codFil: number; numOcp: number }, deps: Dependencias = {}) {
  const estado = await executarFluxo(
    { codEmp: oc.codEmp ?? 1, codFil: oc.codFil, numOcp: oc.numOcp },
    { http: (_nome, corpo) => (deps.http ?? chamarSenior)(corpo) }
  );
  const gerador: any = estado.get(NOME_SAIDA)?.[0]?.[0]?.json ?? {};
  if (typeof gerador.html !== "string" || gerador.html.length < 200 || gerador.error) {
    throw new Error(`Nao foi possivel montar o dossie${gerador.error ? `: ${gerador.error}` : " (HTML vazio)"}.`);
  }
  const nomeArquivo: string =
    gerador.arquivoPdf || (gerador.nomeBase ? `${gerador.nomeBase}.pdf` : null) || `DOSSIE_OC_${gerador.identificacao?.ordemCompra ?? oc.numOcp}.pdf`;
  const pdf = await (deps.pdf ?? htmlParaPdf)(gerador.html);

  // Empacota com o proprio no do workflow ("Montar Envio do Dossie"), alimentado pelo resultado desta execucao.
  const $ = (nome: string) => {
    if (nome === "Extrair PDF em Base64") return { first: () => ({ json: { data: pdf.toString("base64"), arquivo: nomeArquivo } }) };
    const s = estado.get(nome);
    if (!s) throw new Error(`No "${nome}" nao executou.`);
    return { first: () => s[0]?.[0], all: () => s[0] ?? [] };
  };
  const desfecho: Item = { json: { status: "SUCESSO", mensagem: "Dossie gerado pelo APPCNS" } };
  const [saida] = await (NOS as Record<string, Function>)["Montar Envio do Dossiê"]({ first: () => desfecho, all: () => [desfecho] }, $, desfecho.json);
  const envio = saida.json.envio;
  return { html: gerador.html as string, pdf, nomeArquivo, envio };
}

// ---------- fila: uma geracao por vez ----------
let fila: Promise<unknown> = Promise.resolve();

/** Gera e grava. Nunca lanca: falha vira status ERRO com o motivo (e o PDF anterior, se houver, e' mantido). */
export function gerarEGravar(oc: { codEmp?: number; codFil: number; numOcp: number }, deps: Dependencias = {}): Promise<{ ok: boolean; motivo?: string }> {
  const trabalho = fila.then(async () => {
    try {
      const { pdf, nomeArquivo, envio } = await montarDossie(oc, deps);
      await salvarDossie(
        { ...envio, chave: chaveDaOc(oc.codFil, oc.numOcp), numOcp: String(oc.numOcp), codFil: String(oc.codFil), status: "PUBLICADO", motivo: null, origem: "APPCNS" },
        { bytes: pdf, nome: nomeArquivo }
      );
      return { ok: true };
    } catch (e) {
      const motivo = (e instanceof Error ? e.message : String(e)).slice(0, 500);
      await registrarFalha(String(oc.codFil), String(oc.numOcp), motivo).catch(() => {});
      return { ok: false, motivo };
    }
  });
  fila = trabalho.catch(() => undefined);
  return trabalho;
}
