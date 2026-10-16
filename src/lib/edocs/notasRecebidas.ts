// Notas fiscais RECEBIDAS (emitidas contra a Consominas) no eDocs X da Senior (somente leitura).
//
// Fonte: Senior X Platform, dominio edocsx_nfe, servico issuer, entidade incomingInvoice
// (GET paginado; "offset" e' o indice da pagina). Login em platform/authentication/actions/login.
// Credencial SO' por variavel de ambiente: SENIORX_ACCOUNT / SENIORX_PASSWORD (nunca no codigo).
// Descoberto em 15/10/2026 lendo o swagger do servico (GET .../rest/edocsx_nfe/issuer).

export type NotaRecebida = {
  chave: string; // chave de acesso, 44 digitos
  numero: string;
  serie: string;
  emitente: string;
  cnpj: string; // so' digitos
  valor: number;
  emissao: string | null; // yyyy-mm-dd
};

export type Sugestao = { nota: NotaRecebida; pontos: number; motivos: string[] };

const BASE = (process.env.SENIORX_URL?.trim() || "https://platform.senior.com.br/t/senior.com.br/bridge/1.0/rest/").replace(/\/?$/, "/");
const TAMANHO_PAGINA = 100;
const CACHE_MS = 5 * 60 * 1000;

let token: { valor: string; expiraEm: number } | null = null;
let cache: { em: number; notas: NotaRecebida[] } | null = null;

async function login(): Promise<string> {
  const usuario = process.env.SENIORX_ACCOUNT;
  const senha = process.env.SENIORX_PASSWORD;
  if (!usuario || !senha) throw new Error("Defina SENIORX_ACCOUNT e SENIORX_PASSWORD no .env (nao versionado).");
  const r = await fetch(`${BASE}platform/authentication/actions/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ username: usuario, password: senha }),
    signal: AbortSignal.timeout(30_000),
  });
  const corpo: any = await r.json().catch(() => ({}));
  const t = typeof corpo.jsonToken === "string" ? JSON.parse(corpo.jsonToken) : corpo.jsonToken ?? corpo;
  if (!r.ok || !t?.access_token) throw new Error("Login no Senior X recusado (usuario/senha, MFA ou troca de senha pendente).");
  token = { valor: t.access_token, expiraEm: Date.now() + Math.max(60, Number(t.expires_in) || 3600) * 1000 - 60_000 };
  return token.valor;
}

async function lerPagina(pagina: number, nova = false): Promise<any> {
  const tk = !nova && token && token.expiraEm > Date.now() ? token.valor : await login();
  const r = await fetch(`${BASE}edocsx_nfe/issuer/entities/incomingInvoice?size=${TAMANHO_PAGINA}&offset=${pagina}`, {
    headers: { Authorization: `Bearer ${tk}`, Accept: "application/json" },
    signal: AbortSignal.timeout(60_000),
  });
  if (r.status === 401 && !nova) return lerPagina(pagina, true); // token revogado: um novo login
  if (!r.ok) throw new Error(`eDocs respondeu HTTP ${r.status}.`);
  return r.json();
}

const soDigitos = (v: unknown) => String(v ?? "").replace(/\D/g, "");

/** Mapeia uma nota do eDocs; nota sem XML recebido (sem emitente/valor) nao serve pra conferencia. */
export function mapearNota(n: any): NotaRecebida | null {
  if (n?.situation !== "AUTHORIZED" || !n.accessKey || n.number == null) return null;
  return {
    chave: String(n.accessKey),
    numero: String(n.number),
    serie: String(n.series ?? ""),
    emitente: String(n.issuerCorporateName ?? ""),
    cnpj: soDigitos(n.issuerDocument),
    valor: Number(n.totalValue) || 0,
    emissao: typeof n.issueDateTime === "string" ? n.issueDateTime.slice(0, 10) : null,
  };
}

export async function listarNotasRecebidas(forcar = false): Promise<NotaRecebida[]> {
  if (!forcar && cache && Date.now() - cache.em < CACHE_MS) return cache.notas;
  const notas: NotaRecebida[] = [];
  for (let pagina = 0; pagina < 200; pagina++) {
    const d = await lerPagina(pagina);
    for (const n of d.contents ?? []) {
      const m = mapearNota(n);
      if (m) notas.push(m);
    }
    if ((d.contents ?? []).length < TAMANHO_PAGINA || pagina + 1 >= (d.totalPages ?? 1)) break;
  }
  cache = { em: Date.now(), notas };
  return notas;
}

export async function buscarNotaPorChave(chave: string): Promise<NotaRecebida | null> {
  if (!/^\d{44}$/.test(chave)) return null;
  return (await listarNotasRecebidas()).find((n) => n.chave === chave) ?? (await listarNotasRecebidas(true)).find((n) => n.chave === chave) ?? null;
}

// ---------- pre-selecao ----------

const semZeros = (v: string) => soDigitos(v).replace(/^0+/, "");

/**
 * Ranqueia as notas candidatas a uma OC. So' sugere: a associacao e' sempre manual.
 * CNPJ do emitente = fornecedor da OC e' o criterio principal; sem ele, so' entra a nota
 * cujo numero foi digitado na OC (USU_NUMNFC) com o mesmo valor.
 */
export function sugerirNotas(
  oc: { docFornecedor: string | null; valor: number; emissao: string | null; numNfc: string | null },
  notas: NotaRecebida[],
  limite = 5
): Sugestao[] {
  const doc = soDigitos(oc.docFornecedor);
  const nfOc = oc.numNfc ? semZeros(oc.numNfc) : "";
  const saida: Sugestao[] = [];
  for (const nota of notas) {
    const motivos: string[] = [];
    let pontos = 0;
    const mesmoDoc = !!doc && nota.cnpj === doc;
    const mesmoNumero = !!nfOc && semZeros(nota.numero) === nfOc;
    const dif = Math.abs(nota.valor - oc.valor);
    if (mesmoDoc) {
      pontos += 50;
      motivos.push("mesmo CNPJ/CPF do fornecedor");
    }
    if (mesmoNumero) {
      pontos += 40;
      motivos.push("número igual ao digitado na OC");
    }
    if (!mesmoDoc && !(mesmoNumero && dif <= 0.01)) continue;
    if (oc.valor > 0 && dif <= 0.01) {
      pontos += 30;
      motivos.push("valor igual ao da OC");
    } else if (oc.valor > 0 && dif / oc.valor <= 0.05) {
      pontos += 10;
      motivos.push("valor até 5% de diferença");
    }
    if (oc.emissao && nota.emissao && nota.emissao >= oc.emissao) {
      pontos += 5;
      motivos.push("emitida depois da OC");
    }
    saida.push({ nota, pontos, motivos });
  }
  return saida.sort((a, b) => b.pontos - a.pontos || (b.nota.emissao ?? "").localeCompare(a.nota.emissao ?? "")).slice(0, limite);
}

// ---------- pagamento (vem do XML da nota) ----------

export type PagamentoDaNota = { vencimentos: string[]; formasPag: string[]; indPag: string | null };

/** Le o XML autorizado da nota e extrai vencimentos (cobr/dup) e forma de pagamento (pag/detPag). */
export function lerPagamentoDoXml(xml: string): PagamentoDaNota {
  const todos = (re: RegExp) => [...xml.matchAll(re)].map((m) => m[1]);
  return {
    vencimentos: todos(/<dVenc>(\d{4}-\d{2}-\d{2})<\/dVenc>/g),
    formasPag: todos(/<tPag>(\d{2})<\/tPag>/g),
    indPag: xml.match(/<indPag>(\d)<\/indPag>/)?.[1] ?? null,
  };
}

export async function baixarXmlDaNota(chave: string, nova = false): Promise<string> {
  const tk = !nova && token && token.expiraEm > Date.now() ? token.valor : await login();
  const r = await fetch(`${BASE}edocsx_nfe/issuer/actions/downloadNfeIncoming`, {
    method: "POST",
    headers: { Authorization: `Bearer ${tk}`, "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ accessKey: chave, xmlType: "AUTHORIZED" }),
    signal: AbortSignal.timeout(60_000),
  });
  if (r.status === 401 && !nova) return baixarXmlDaNota(chave, true);
  if (!r.ok) throw new Error(`eDocs respondeu HTTP ${r.status}.`);
  const { xmlUrl } = (await r.json()) as { xmlUrl?: string };
  if (!xmlUrl?.startsWith("https://")) throw new Error("eDocs não devolveu a URL do XML.");
  const x = await fetch(xmlUrl, { signal: AbortSignal.timeout(60_000) });
  if (!x.ok) throw new Error(`XML da nota indisponível (HTTP ${x.status}).`);
  return x.text();
}

export async function baixarPagamentoDaNota(chave: string): Promise<PagamentoDaNota> {
  return lerPagamentoDoXml(await baixarXmlDaNota(chave));
}

export type CampoXml = { caminho: string; valor: string };

/** Achata o XML em (caminho, valor) -- todos os campos da nota. Tags repetidas ganham indice: det[2]. Ignora a assinatura digital. */
export function achatarXml(xml: string): CampoXml[] {
  const campos: CampoXml[] = [];
  const pilha: { nome: string; filhos: Map<string, number> }[] = [{ nome: "", filhos: new Map() }];
  const decodifica = (t: string) => t.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");
  const caminho = () => pilha.slice(1).map((p) => p.nome).join(" › ");
  let ignorar = 0;
  for (const m of xml.matchAll(/<(\/?)([A-Za-z_][\w:.-]*)([^>]*?)(\/?)>|([^<]+)/g)) {
    if (m[5] !== undefined) {
      const v = m[5].trim();
      if (v && !ignorar && pilha.length > 1) campos.push({ caminho: caminho(), valor: decodifica(v) });
      continue;
    }
    const [, fecha, nome, attrs, autoFecha] = m;
    if (fecha) {
      if (nome === "Signature") ignorar--;
      pilha.pop();
      continue;
    }
    if (nome === "Signature") ignorar++;
    const pai = pilha[pilha.length - 1];
    const n = (pai.filhos.get(nome) ?? 0) + 1;
    pai.filhos.set(nome, n);
    pilha.push({ nome: n > 1 ? `${nome}[${n}]` : nome, filhos: new Map() });
    if (!ignorar) for (const a of attrs.matchAll(/([\w:-]+)="([^"]*)"/g)) if (!a[1].startsWith("xmlns")) campos.push({ caminho: `${caminho()} @${a[1]}`, valor: decodifica(a[2]) });
    if (autoFecha) pilha.pop();
  }
  return campos;
}
