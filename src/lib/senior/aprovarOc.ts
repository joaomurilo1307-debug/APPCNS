// Aprovacao de OC pelo web service NATIVO da Senior: com.senior.g5.co.mcm.est.ordemcompra, portas buscarPendentes_4,
// aprovar e reprovar (doc oficial ERP 5.10.4; contrato conferido no XSD do tenant em 17/11/2026).
// Roda SEMPRE com o login ERP da propria pessoa (assim a auditoria da Senior mostra quem aprovou) -- por isso nada aqui usa
// SENIOR_WS_SAPIENS_*. Aprovar/reprovar ESCREVE no ERP e nao tem desfazer por aqui.
//
// Contrato (ordem alfabetica dos campos, como o XSD): aprovar/reprovar recebem parameters/ordemCompra com codigoEmpresa,
// codigoFilial, numero, sequencia. Sucesso = codigoResultado 1 + retorno.resultado 1 + erroExecucao vazio. A porta reprovar
// NAO tem campo de motivo.
// Nao confirmado ainda contra a Senior real: base do indicePagina (1 ou 0) -- ver paginaInicial.

export const EMPRESA_APROVACAO = 1;
export const FILIAIS_APROVACAO = [1, 2];

const URL_PADRAO = "https://web01s1p.seniorcloud.com.br:30901/g5-senior-services/sapiens_Synccom_senior_g5_co_mcm_est_ordemcompra";
const LIMITE_PAGINA = 50;
const MAX_PAGINAS = 20;
const paginaInicial = 1;

export type Credencial = { usuario: string; senha: string };
export type RateioPendente = { codigoCentroCustos: string; abreviatura: string; percentual: number; valor: number };
export type ItemPendente = {
  descricao: string;
  observacao: string;
  quantidade: number; // quantidadeSolicitada
  unidade: string;
  valorUnitario: number;
  valorBruto: number; // vlrBru
  desconto: number; // vlrDsc
  valorLiquido: number;
  rateio: RateioPendente[];
};
export type OcPendente = {
  codigoEmpresa: number;
  codigoFilial: number;
  numero: number;
  dataEmissao: string;
  fornecedor: string;
  solicitante: string;
  valor: number;
  observacao: string;
  observacaoMotivo: string;
  moeda: string;
  rateio: RateioPendente[];
  itens: ItemPendente[];
};

const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const desesc = (t: string) => t.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");
const P = "(?:[\\w-]+:)?";
const campo = (b: string, n: string) => desesc(new RegExp(`<${P}${n}\\b[^>]*>([\\s\\S]*?)</${P}${n}>`).exec(b)?.[1] ?? "").trim();
const blocos = (b: string, n: string) => [...b.matchAll(new RegExp(`<${P}${n}\\b[^>]*>([\\s\\S]*?)</${P}${n}>`, "g"))].map((m) => m[1]);

/** "1.234,56" (BR) ou "1234.56" (XML) -> 1234.56; ilegivel -> 0. */
export function numeroSenior(v: string): number {
  const t = v.trim();
  const n = t.includes(",") ? Number(t.replace(/\./g, "").replace(",", ".")) : Number(t);
  return Number.isFinite(n) ? n : 0;
}

const rateiosDe = (b: string): RateioPendente[] =>
  blocos(b, "rateio").map((r) => ({
    codigoCentroCustos: campo(r, "codigoCentroCustos"),
    abreviatura: campo(r, "abreviaturaCentroCustos"),
    percentual: numeroSenior(campo(r, "percentualRateio")),
    valor: numeroSenior(campo(r, "valorRateio")),
  }));

function envelope(operacao: string, c: Credencial, parametros: string): string {
  return (
    `<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ser="http://services.senior.com.br">` +
    `<soapenv:Header/><soapenv:Body><ser:${operacao}>` +
    `<user>${esc(c.usuario)}</user><password>${esc(c.senha)}</password><encryption>0</encryption>` +
    `<parameters>${parametros}</parameters></ser:${operacao}></soapenv:Body></soapenv:Envelope>`
  );
}

export function envelopePendentes(c: Credencial, indicePagina: number, limitePagina = LIMITE_PAGINA): string {
  return envelope("buscarPendentes_4", c, `<indicePagina>${indicePagina}</indicePagina><limitePagina>${limitePagina}</limitePagina>`);
}

export type Chave = { codigoEmpresa: number; codigoFilial: number; numero: number };

export function envelopeDecisao(operacao: "aprovar" | "reprovar", c: Credencial, k: Chave): string {
  const inteiro = (n: number) => Number.isSafeInteger(n) && n > 0 && n <= 2147483647;
  if (!inteiro(k.codigoEmpresa) || !inteiro(k.codigoFilial) || !inteiro(k.numero)) throw new Error("Empresa/filial/OC inválida.");
  return envelope(
    operacao,
    c,
    `<ordemCompra><codigoEmpresa>${k.codigoEmpresa}</codigoEmpresa><codigoFilial>${k.codigoFilial}</codigoFilial><numero>${k.numero}</numero><sequencia>1</sequencia></ordemCompra>`
  );
}

function falhaDoEnvelope(xml: string): string | null {
  const f = new RegExp(`<${P}faultstring\\b[^>]*>([\\s\\S]*?)</${P}faultstring>`).exec(xml);
  return f ? desesc(f[1]).trim() || "Falha sem mensagem" : null;
}

export function lerPendentes(xml: string): { ocs: OcPendente[]; erro: string | null } {
  const falha = falhaDoEnvelope(xml);
  if (falha) return { ocs: [], erro: falha };
  const erro = campo(xml, "erroExecucao");
  if (erro) return { ocs: [], erro };
  const ocs = blocos(xml, "ordemCompra").map((b): OcPendente => {
    const semItens = b.replace(new RegExp(`<${P}item\\b[^>]*>[\\s\\S]*?</${P}item>`, "g"), "");
    return {
      codigoEmpresa: Number(campo(semItens, "codigoEmpresa")),
      codigoFilial: Number(campo(semItens, "codigoFilial")),
      numero: Number(campo(semItens, "numero")),
      dataEmissao: campo(semItens, "dataEmissao"),
      fornecedor: campo(semItens, "nomeFornecedor"),
      solicitante: campo(semItens, "nomeSolicitante") || campo(semItens, "usuarioSolicitante"),
      valor: numeroSenior(campo(semItens, "valorAproximado")),
      observacao: campo(semItens, "observacao"),
      observacaoMotivo: campo(semItens, "observacaoMotivo"),
      moeda: campo(semItens, "moedaOC"),
      rateio: rateiosDe(semItens),
      itens: blocos(b, "item").map(
        (i): ItemPendente => ({
          descricao: campo(i, "descricao"),
          observacao: campo(i, "observacao"),
          quantidade: numeroSenior(campo(i, "quantidadeSolicitada")),
          unidade: campo(i, "unidadeMedida"),
          valorUnitario: numeroSenior(campo(i, "valorUnitario")),
          valorBruto: numeroSenior(campo(i, "vlrBru")),
          desconto: numeroSenior(campo(i, "vlrDsc")),
          valorLiquido: numeroSenior(campo(i, "valorLiquido")),
          rateio: rateiosDe(i),
        })
      ),
    };
  });
  return { ocs: ocs.filter((o) => o.numero > 0), erro: null };
}

/** Sucesso so' com TODOS os sinais de sucesso; qualquer ambiguidade vira erro (nunca "provavelmente aprovou"). */
export function lerDecisao(xml: string): { ok: boolean; mensagem: string } {
  const falha = falhaDoEnvelope(xml);
  if (falha) return { ok: false, mensagem: falha };
  const erroExecucao = campo(xml, "erroExecucao");
  if (erroExecucao) return { ok: false, mensagem: erroExecucao };
  const retorno = blocos(xml, "retorno")[0] ?? "";
  const codigo = campo(xml, "codigoResultado");
  const resultado = campo(retorno, "resultado");
  if (codigo === "1" && resultado === "1") return { ok: true, mensagem: campo(retorno, "mensagemErro") || "Processado com sucesso" };
  return { ok: false, mensagem: campo(retorno, "mensagemErro") || campo(xml, "resultado") || "Resposta da Senior não reconhecida; confira a OC na Senior." };
}

async function chamar(corpo: string, fetchImpl: typeof fetch): Promise<string> {
  const r = await fetchImpl(process.env.SENIOR_WS_ORDEMCOMPRA_URL?.trim() || URL_PADRAO, {
    method: "POST",
    headers: { "Content-Type": "text/xml; charset=UTF-8", SOAPAction: '""' },
    body: corpo,
    signal: AbortSignal.timeout(60_000),
  });
  const texto = await r.text();
  if (!r.ok && !falhaDoEnvelope(texto)) throw new Error(`Senior respondeu HTTP ${r.status}.`);
  return texto;
}

export const daAlcada = (o: OcPendente) => o.codigoEmpresa === EMPRESA_APROVACAO && FILIAIS_APROVACAO.includes(o.codigoFilial);

/** Pendentes DA PESSOA (a Senior filtra pelo usuario da chamada), so' empresa 1 / filiais 1 e 2. */
export async function listarPendentes(c: Credencial, fetchImpl: typeof fetch = fetch): Promise<OcPendente[]> {
  const todas: OcPendente[] = [];
  const vistas = new Set<string>();
  for (let i = 0; i < MAX_PAGINAS; i++) {
    const { ocs, erro } = lerPendentes(await chamar(envelopePendentes(c, paginaInicial + i), fetchImpl));
    if (erro) throw new Error(erro);
    const novas = ocs.filter((o) => !vistas.has(`${o.codigoEmpresa}-${o.codigoFilial}-${o.numero}`));
    novas.forEach((o) => vistas.add(`${o.codigoEmpresa}-${o.codigoFilial}-${o.numero}`));
    todas.push(...novas);
    if (ocs.length < LIMITE_PAGINA || !novas.length) break; // pagina curta ou repetida: acabou
  }
  return todas.filter(daAlcada);
}

export async function decidirOc(operacao: "aprovar" | "reprovar", c: Credencial, k: Chave, fetchImpl: typeof fetch = fetch) {
  return lerDecisao(await chamar(envelopeDecisao(operacao, c, k), fetchImpl));
}
