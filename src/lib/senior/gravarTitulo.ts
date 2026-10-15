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
  docIdeFav?: string;
  codBar?: string;
};

export type ResultadoGravacao = { ok: boolean; mensagem: string; erroExecucao: string };

const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

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
    ["docIdeFav", t.docIdeFav],
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

// ---------- titulo com RATEIO (EntradaTitulosLoteCP_2) ----------
//
// GravarTitulosCP so' aceita UM centro de custo/conta/projeto no cabecalho. Quando a OC tem
// mais de um, a Senior (empresa com controle de projetos) exige o rateio -- erro real da OC
// 15886: "E necessario informar o rateio porque a empresa possui o controle de projetos".
// EntradaTitulosLoteCP_2 aceita o grid `rateio`. Regras da doc 5.10.4: se qualquer campo de
// rateio (codCcu, ctaFin, numPrj, codFpj) estiver no cabecalho do titulo, o grid e' IGNORADO --
// por isso neste caminho eles NUNCA vao no cabecalho. Neste servico os numericos sao Double/Int:
// ponto decimal (nao a virgula do GravarTitulosCP).

export type LinhaRateio = { codCcu: string; ctaFin?: string; numPrj?: string; codFpj?: string; valor: number; percentual: number };

/**
 * Consolida as linhas de E420RAT (uma por item da OC) em linhas de rateio do TITULO: agrupa por
 * CCU + conta + projeto + fase e divide o valor do titulo pela fatia de cada grupo. As linhas
 * somam exatamente o valor do titulo e 100% (a ultima absorve o arredondamento).
 */
export function consolidarRateioTitulo(
  linhas: { CODCCU: string; CTAFIN?: string; NUMPRJ?: string; CODFPJ?: string; VLRRAT: string }[],
  valorTitulo: number
): LinhaRateio[] {
  const num = (v: string | undefined) => Number((v ?? "").trim().replace(/\./g, "").replace(",", "."));
  const preenchido = (v: string | undefined) => (v && !/^0+$/.test(v.trim()) ? v.trim() : undefined);
  const grupos = new Map<string, { base: Omit<LinhaRateio, "valor" | "percentual">; soma: number }>();
  for (const l of linhas) {
    if (!l.CODCCU) continue;
    const base = { codCcu: l.CODCCU, ctaFin: preenchido(l.CTAFIN), numPrj: preenchido(l.NUMPRJ), codFpj: preenchido(l.CODFPJ) };
    const k = [base.codCcu, base.ctaFin, base.numPrj, base.codFpj].join("|");
    const g = grupos.get(k) ?? { base, soma: 0 };
    g.soma += num(l.VLRRAT) || 0;
    grupos.set(k, g);
  }
  const lista = [...grupos.values()];
  const total = lista.reduce((t, g) => t + g.soma, 0);
  if (!lista.length || total <= 0 || !(valorTitulo > 0)) return [];
  const cent = (v: number) => Math.round(v * 100) / 100;
  let restoValor = cent(valorTitulo);
  let restoPerc = 100;
  return lista.map((g, i) => {
    const ultimo = i === lista.length - 1;
    const valor = ultimo ? restoValor : cent((g.soma / total) * valorTitulo);
    const percentual = ultimo ? cent(restoPerc * 10000) / 10000 : Math.round((g.soma / total) * 1000000) / 10000;
    restoValor = cent(restoValor - valor);
    restoPerc = Math.round((restoPerc - percentual) * 10000) / 10000;
    return { ...g.base, valor, percentual };
  });
}

const ponto = (v: number) => (Math.round(v * 100) / 100).toFixed(2);

export function montarEnvelopeTituloRateio(t: TituloNovo, rateio: LinhaRateio[], usuario: string, senha: string): string {
  const inteiro = (n: number) => Number.isSafeInteger(n) && n > 0 && n <= 2147483647;
  if (!inteiro(t.codEmp) || !inteiro(t.codFil) || !inteiro(t.codFor)) throw new Error("Empresa/filial/fornecedor invalido.");
  if (!t.numTit.trim() || t.numTit.length > 15) throw new Error("Numero do titulo invalido (1 a 15 caracteres).");
  if (!t.codTpt.trim() || t.codTpt.length > 3) throw new Error("Tipo de titulo invalido (ate 3 caracteres).");
  if (rateio.length < 2) throw new Error("Rateio precisa de 2 ou mais linhas; com uma so use GravarTitulosCP.");
  if (!(t.valor > 0) || Math.abs(rateio.reduce((s, r) => s + r.valor, 0) - t.valor) > 0.005) throw new Error("O rateio precisa somar exatamente o valor do titulo.");

  // Cabecalho em ordem alfabetica, SEM codCcu/ctaFin/numPrj/codFpj (senao a Senior ignora o grid).
  const cab: [string, string | undefined][] = [
    ["ccbFor", t.ccbFor], ["chvPix", t.chvPix], ["codAge", t.codAge], ["codBan", t.codBan], ["codBar", t.codBar],
    ["codCrt", t.codCrt], ["codFil", String(t.codFil)], ["codFor", String(t.codFor)], ["codFpg", t.codFpg],
    ["codPor", t.codPor], ["codTns", t.codTns], ["codTpt", t.codTpt],
    ["datEmi", dataSenior(t.emissao)], ["datEnt", dataSenior(t.emissao)], ["docIdeFav", t.docIdeFav],
    ["numTit", t.numTit], ["obsTcp", t.obs.slice(0, 250)],
  ];
  const cab2: [string, string | undefined][] = [
    ["tipTcc", t.tipTcc ? String(t.tipTcc) : undefined],
    ["tpcPix", t.chvPix && t.tpcPix ? String(t.tpcPix) : undefined],
    ["vctOri", dataSenior(t.vencimento)],
    ["vlrOri", ponto(t.valor)],
  ];
  const tag = (l: [string, string | undefined][]) => l.filter(([, v]) => v).map(([k, v]) => `<${k}>${esc(v!)}</${k}>`).join("");
  // Linha do rateio: ordem alfabetica do XSD (codCcu, codFpj, ctaFin, numPrj, perCta, perRat, vlrCta, vlrRat).
  const linhas = rateio
    .map(
      (r) =>
        `<rateio><codCcu>${esc(r.codCcu)}</codCcu>` +
        (r.codFpj ? `<codFpj>${esc(r.codFpj)}</codFpj>` : "") +
        (r.ctaFin ? `<ctaFin>${esc(r.ctaFin)}</ctaFin>` : "") +
        (r.numPrj ? `<numPrj>${esc(r.numPrj)}</numPrj>` : "") +
        `<perCta>${r.percentual.toFixed(4)}</perCta><perRat>${r.percentual.toFixed(4)}</perRat>` +
        `<vlrCta>${ponto(r.valor)}</vlrCta><vlrRat>${ponto(r.valor)}</vlrRat></rateio>`
    )
    .join("");
  return (
    `<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ser="http://services.senior.com.br">` +
    `<soapenv:Header/><soapenv:Body><ser:EntradaTitulosLoteCP_2>` +
    `<user>${esc(usuario)}</user><password>${esc(senha)}</password><encryption>0</encryption>` +
    `<parameters><codEmp>${t.codEmp}</codEmp><codFil>${t.codFil}</codFil>` +
    `<entradaTitulos>${tag(cab)}${linhas}${tag(cab2)}</entradaTitulos>` +
    `</parameters></ser:EntradaTitulosLoteCP_2></soapenv:Body></soapenv:Envelope>`
  );
}

/** Texto de retorno (txtRet / erroExecucao / faultstring). O sucesso e' decidido pela releitura da Senior, nao por este texto. */
export function lerRespostaEntrada(xml: string): ResultadoGravacao {
  const falha = /<(?:[\w-]+:)?faultstring\b[^>]*>([\s\S]*?)<\/(?:[\w-]+:)?faultstring>/.exec(xml);
  if (falha) return { ok: false, mensagem: "", erroExecucao: desesc(falha[1]).trim() };
  const erroExecucao = campo(xml, "erroExecucao");
  const txt = campo(xml, "txtRet");
  const resultado = campo(xml, "resultado");
  return { ok: !erroExecucao && !/^erro/i.test(resultado) && !/erro|n[aã]o foi poss|inv[aá]lid|obrigat|necess[aá]rio/i.test(txt), mensagem: txt || resultado, erroExecucao };
}

export async function gravarTituloComRateioCP(t: TituloNovo, rateio: LinhaRateio[], fetchImpl: typeof fetch = fetch): Promise<ResultadoGravacao> {
  const usuario = process.env.SENIOR_WS_SAPIENS_USER;
  const senha = process.env.SENIOR_WS_SAPIENS_PASSWORD;
  if (!usuario || !senha) throw new Error("Defina SENIOR_WS_SAPIENS_USER e SENIOR_WS_SAPIENS_PASSWORD no .env (nao versionado).");
  const r = await fetchImpl(process.env.SENIOR_WS_BAIXA_URL?.trim() || URL_PADRAO, {
    method: "POST",
    headers: { "Content-Type": "text/xml; charset=UTF-8", SOAPAction: '""' },
    body: montarEnvelopeTituloRateio(t, rateio, usuario, senha),
    signal: AbortSignal.timeout(60_000),
  });
  const lido = lerRespostaEntrada(await r.text());
  if (!r.ok) return { ...lido, ok: false, erroExecucao: lido.erroExecucao || `HTTP ${r.status} ao gravar titulo. Conferir na Senior antes de repetir.` };
  return lido;
}
