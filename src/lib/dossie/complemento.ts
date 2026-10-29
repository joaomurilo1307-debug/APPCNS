// Complemento do dossie: o que o fluxo herdado do n8n nao trazia.
//   - dados completos da OC (fornecedor + endereco, condicao/forma de pagamento, observacao da OC);
//   - aviso de OC REEMBOLSAVEL (conta financeira >= 180 em qualquer rateio, ou USU_REEMB = 'S');
//   - aviso de "sem nota fiscal" (o dossie so' e' gerado depois que a OC vira titulo; se ainda nao ha NF, fica escrito);
//   - DANFE completa de cada nota, montada com os dados da nota na Senior (ver danfe.ts).
// So' LEITURA na Senior, sempre pela fila unica (consultarSenior). Falha de consulta = excecao: o dossie vai para ERRO e
// a geracao automatica tenta de novo -- melhor do que publicar um PDF que parece completo e nao e'.
// O texto e' HTML pronto; o gerador do fluxo (nos/gerar-html-do-dossie.js) so' deixa marcadores no lugar certo e
// montarDossie (gerar.ts) troca os marcadores pelo que sai daqui.

import { consultarSenior, type LinhaSenior } from "@/lib/senior/getDbInfo";
import { COD_EMP, numeroSenior } from "@/lib/senior/ocsConferencia";
import { cnpjCpf, esc, moeda, quantidade } from "./formatar";
import { CSS_DANFE, montarDanfe, type DadosNota } from "./danfe";

export const MARCADOR_OC = "<!--COMPLEMENTO_OC-->";
export const MARCADOR_DANFE = "<!--COMPLEMENTO_DANFE-->";
/** Conta financeira a partir da qual a despesa e' reembolsavel (regra do financeiro, 29/10/2026). */
export const CONTA_REEMBOLSAVEL_A_PARTIR_DE = 180;

type Consultar = (sql: string) => Promise<LinhaSenior[]>;
export type ChaveNota = { codFil: number; codFor: number; numNfc: number; codSnf: string };
export type ItemOc = { codigo: string; descricao: string; unidade: string; quantidade: number; unitario: number; total: number };

export type DadosComplemento = {
  oc: { numOcp: number; codFil: number };
  cab: LinhaSenior;
  fornecedor: LinhaSenior;
  condicaoPagamento: string | null;
  contasFinanceiras: number[];
  itens: ItemOc[];
  notas: DadosNota[];
};

// ---------------------------------------------------------------- regras puras

/** Reembolsavel = alguma conta financeira do rateio >= 180, ou o campo USU_REEMB da OC marcado 'S'. */
export function motivoReembolso(contas: number[], usuReemb: string | undefined): string | null {
  const alta = contas.filter((c) => c >= CONTA_REEMBOLSAVEL_A_PARTIR_DE);
  if (alta.length) return `conta financeira ${[...new Set(alta)].sort((a, b) => a - b).join(", ")} (a partir da ${CONTA_REEMBOLSAVEL_A_PARTIR_DE})`;
  if ((usuReemb ?? "").trim().toUpperCase() === "S") return "OC marcada como reembolsável (USU_REEMB)";
  return null;
}

const enderecoDe = (f: LinhaSenior) =>
  [f.ENDFOR, f.CPLEND, f.BAIFOR, [f.CIDFOR, f.SIGUFS].filter(Boolean).join("/"), f.CEPFOR ? `CEP ${f.CEPFOR.replace(/^(\d{5})(\d{3})$/, "$1-$2")}` : ""].filter((p) => p && p.trim()).join(" — ");

// ---------------------------------------------------------------- HTML

const CSS_COMPLEMENTO = `
.aviso-forte { border: 2px solid #222; background: #f1f1f1; padding: 10px; margin: 12px 0; font-size: 11px; line-height: 1.4; break-inside: avoid; }
.aviso-forte b.tit { display: block; font-size: 13px; margin-bottom: 4px; letter-spacing: .3px; }
.dados-oc th { width: 17%; }
.obs-oc { white-space: pre-wrap; }
`;

function blocoDadosOc(d: DadosComplemento): string {
  const { cab, fornecedor: f } = d;
  const cpg = [cab.CODCPG, d.condicaoPagamento].filter((x) => x && x.trim()).join(" - ");
  const linha = (rotulo: string, valor: string | null | undefined) => `<tr><th>${esc(rotulo)}</th><td colspan="3">${esc(valor && valor.trim() ? valor : "-")}</td></tr>`;
  return `
<h2>Dados da Ordem de Compra</h2>
<table class="dados-oc">
<tr><th>Fornecedor</th><td>${esc([f.CODFOR, f.NOMFOR].filter(Boolean).join(" - "))}</td><th>CNPJ/CPF</th><td>${esc(cnpjCpf(f.CGCCPF))}</td></tr>
${linha("Endereço do fornecedor", enderecoDe(f))}
<tr><th>Inscrição estadual</th><td>${esc(f.INSEST || "-")}</td><th>Telefone</th><td>${esc(f.FONFOR || "-")}</td></tr>
<tr><th>Condição de pagamento</th><td>${esc(cpg || "-")}</td><th>Forma de pagamento</th><td>${esc(cab.CODFPG ? `código ${cab.CODFPG}` : "-")}</td></tr>
<tr><th>Valor da OC</th><td>${esc(moeda(numeroSenior(cab.VLRORI) || numeroSenior(cab.VLRLIQ)))}</td><th>Saldo em aberto</th><td>${esc(moeda(numeroSenior(cab.VLRLIQ)))}</td></tr>
<tr><th>Observações da OC</th><td colspan="3" class="obs-oc">${esc(cab.OBSOCP && cab.OBSOCP.trim() ? cab.OBSOCP : "Sem observações.")}</td></tr>
</table>`;
}

function blocoReembolso(d: DadosComplemento, motivo: string): string {
  const linhas = d.itens.length
    ? d.itens.map((i) => `<tr><td>${esc(i.codigo)}</td><td>${esc(i.descricao)}</td><td>${esc(i.unidade)}</td><td class="num">${esc(quantidade(i.quantidade))}</td><td class="num">${esc(moeda(i.unitario))}</td><td class="num">${esc(moeda(i.total))}</td></tr>`).join("")
    : `<tr><td colspan="6" class="vazio">Nenhum item encontrado.</td></tr>`;
  return `
<div class="aviso-forte"><b class="tit">ITEM REEMBOLSÁVEL</b>
Esta Ordem de Compra é de despesa reembolsável — ${esc(motivo)}.<br>Fornecedor: ${esc([d.fornecedor.NOMFOR].filter(Boolean).join(""))} — CNPJ/CPF ${esc(cnpjCpf(d.fornecedor.CGCCPF))}.</div>
<table>
<thead><tr><th>Código</th><th>Descrição</th><th>Un.</th><th>Quantidade</th><th>Valor unitário</th><th>Valor total</th></tr></thead>
<tbody>${linhas}</tbody>
</table>`;
}

const BLOCO_SEM_NF = `
<div class="aviso-forte"><b class="tit">SEM NOTA FISCAL</b>
Não há nota fiscal vinculada ao título desta Ordem de Compra no ERP. Este dossiê foi gerado sem a nota fiscal e sem a DANFE; será gerado de novo, com a nota, assim que ela for lançada.</div>`;

/** Os trechos que entram no lugar dos marcadores do gerador de HTML. */
export function montarHtmlComplemento(d: DadosComplemento): { oc: string; danfe: string; css: string } {
  const motivo = motivoReembolso(d.contasFinanceiras, d.cab.USU_REEMB);
  const oc = blocoDadosOc(d) + (motivo ? blocoReembolso(d, motivo) : "") + (d.notas.length ? "" : BLOCO_SEM_NF);
  const danfe = d.notas.map((n, i) => montarDanfe(n, i + 1, d.notas.length)).join("");
  return { oc, danfe, css: CSS_COMPLEMENTO + CSS_DANFE };
}

/** Troca os marcadores deixados pelo gerador de HTML. Sem marcador no HTML = erro (gerador e complemento fora de sincronia). */
export function aplicarComplemento(html: string, c: { oc: string; danfe: string; css: string }): string {
  if (!html.includes(MARCADOR_OC) || !html.includes(MARCADOR_DANFE) || !html.includes("</style>")) {
    throw new Error("O HTML do dossiê não tem os marcadores do complemento (gerar-html-do-dossie.js desatualizado).");
  }
  return html.replace("</style>", () => `${c.css}</style>`).replace(MARCADOR_OC, () => c.oc).replace(MARCADOR_DANFE, () => c.danfe);
}

// ---------------------------------------------------------------- coleta (somente leitura)

const um = async (consultar: Consultar, sql: string) => (await consultar(sql))[0] ?? null;

/** Itens (produto + servico) da OC, como o fluxo os normalizou. */
export function itensDoFluxo(produtos: any[], servicos: any[]): ItemOc[] {
  const pegar = (...v: any[]) => v.find((x) => x !== undefined && x !== null && x !== "");
  const num = (v: unknown) => (typeof v === "number" ? v : numeroSenior(String(v ?? "")));
  const positivo = (...v: any[]) => v.find((x) => num(x) > 0) ?? 0; // OC liquidada: saldo zerado, o valor fica em original/bruto
  const linha = (i: any, ref: any, servico: boolean): ItemOc => ({
    codigo: String(pegar(ref?.codigo, i.codigo) ?? "-"),
    descricao: String(pegar(ref?.descricao, i.descricao) ?? "-"),
    unidade: String(pegar(i.unidade, ref?.unidade) ?? "-"),
    quantidade: num(pegar(i.quantidades?.pedida, i.quantidades?.original, i.quantidades?.aberta, i.quantidade)),
    unitario: num(pegar(i.valores?.unitario, i.valorUnitario)),
    total: num(positivo(servico ? i.valores?.liquidoServico : undefined, i.valores?.liquido, i.valores?.original, i.valores?.bruto, i.valorTotal)),
  });
  return [...produtos.map((i) => linha(i, i.produto, false)), ...servicos.map((i) => linha(i, i.servico, true))];
}

/** Notas do fluxo (documentosFiscais) -> chave de consulta. Ignora nota sem numero ou serie. */
export function chavesDasNotas(docs: any[], codFilOc: number, codForOc: number): ChaveNota[] {
  const vistas = new Map<string, ChaveNota>();
  for (const n of docs) {
    const numNfc = Number(n?.numero);
    const codSnf = String(n?.serie ?? "").trim();
    if (!Number.isInteger(numNfc) || numNfc <= 0 || !codSnf) continue;
    const c = { codFil: Number(n.filial) || codFilOc, codFor: Number(n.fornecedor) || codForOc, numNfc, codSnf };
    vistas.set(`${c.codFil}|${c.codFor}|${c.numNfc}|${c.codSnf}`, c);
  }
  return [...vistas.values()];
}

/**
 * Fornecedores do MESMO GRUPO DE EMPRESAS do fornecedor da OC (E095FOR.CODGRE > 0), incluindo ele proprio. Marketplace (Mercado Livre,
 * Magalu, Salu...) tem um cadastro por vendedor, e o titulo pode estar em qualquer um deles. Sem grupo = so' o fornecedor da OC.
 */
export async function codigosDoGrupoDoFornecedor(oc: { codEmp?: number; codFil: number; numOcp: number }, consultar: Consultar = consultarSenior): Promise<number[]> {
  const emp = oc.codEmp ?? COD_EMP;
  const cab = await um(consultar, `SELECT CODFOR FROM E420OCP WHERE CODEMP = ${emp} AND CODFIL = ${oc.codFil} AND NUMOCP = ${oc.numOcp}`);
  const codFor = Number(cab?.CODFOR);
  if (!Number.isInteger(codFor) || codFor <= 0) return [];
  const grupo = Number((await um(consultar, `SELECT CODGRE FROM E095FOR WHERE CODFOR = ${codFor}`))?.CODGRE);
  if (!Number.isInteger(grupo) || grupo <= 0) return [codFor];
  const membros = (await consultar(`SELECT CODFOR FROM E095FOR WHERE CODGRE = ${grupo}`)).map((l) => Number(l.CODFOR)).filter((n) => Number.isInteger(n) && n > 0);
  return [...new Set([codFor, ...membros])];
}

const aspas = (s: string) => `'${s.replace(/'/g, "''")}'`;

export async function coletarComplemento(
  oc: { codEmp?: number; codFil: number; numOcp: number },
  fluxo: { produtos: any[]; servicos: any[]; documentosFiscais: any[] },
  consultar: Consultar = consultarSenior
): Promise<DadosComplemento> {
  const emp = oc.codEmp ?? COD_EMP;
  const chaveOc = `CODEMP = ${emp} AND CODFIL = ${oc.codFil} AND NUMOCP = ${oc.numOcp}`;

  const cab = await um(consultar, `SELECT OBSOCP, CODFOR, CODCPG, CODFPG, USU_REEMB, VLRLIQ, VLRORI FROM E420OCP WHERE ${chaveOc}`);
  if (!cab) throw new Error(`OC ${oc.numOcp} (filial ${oc.codFil}) não encontrada na Senior ao montar o complemento.`);
  const codFor = Number(cab.CODFOR);

  const fornecedor = await um(consultar, `SELECT CODFOR, NOMFOR, APEFOR, CGCCPF, INSEST, ENDFOR, CPLEND, BAIFOR, CIDFOR, SIGUFS, CEPFOR, FONFOR FROM E095FOR WHERE CODFOR = ${codFor}`);
  if (!fornecedor) throw new Error(`Fornecedor ${codFor} não encontrado na Senior.`);

  const cpg = cab.CODCPG?.trim() ? await um(consultar, `SELECT DESCPG FROM E028CPG WHERE CODEMP = ${emp} AND CODCPG = ${aspas(cab.CODCPG.trim())}`) : null;
  const contasFinanceiras = (await consultar(`SELECT CTAFIN FROM E420RAT WHERE ${chaveOc}`)).map((l) => Number(l.CTAFIN)).filter(Number.isFinite);

  // Notas: so' as que o fluxo achou pelo(s) titulo(s) da OC. Cada nota: cabecalho + itens de produto + itens de servico.
  const filial = await um(consultar, `SELECT * FROM E070FIL WHERE CODEMP = ${emp} AND CODFIL = ${oc.codFil}`);
  if (!filial) throw new Error(`Filial ${oc.codFil} não encontrada na Senior.`);
  const emitentes = new Map<number, LinhaSenior>([[codFor, fornecedor]]);
  const notas: DadosNota[] = [];
  for (const k of chavesDasNotas(fluxo.documentosFiscais, oc.codFil, codFor)) {
    const chaveNf = `CODEMP = ${emp} AND CODFIL = ${k.codFil} AND CODFOR = ${k.codFor} AND NUMNFC = ${k.numNfc} AND CODSNF = ${aspas(k.codSnf)}`;
    const nf = await um(consultar, `SELECT * FROM E440NFC WHERE ${chaveNf}`);
    if (!nf) continue; // o titulo cita uma nota que nao esta no ERP: sem DANFE, o aviso de "sem nota" cobre
    if (!emitentes.has(k.codFor)) {
      const e = await um(consultar, `SELECT CODFOR, NOMFOR, APEFOR, CGCCPF, INSEST, ENDFOR, CPLEND, BAIFOR, CIDFOR, SIGUFS, CEPFOR, FONFOR FROM E095FOR WHERE CODFOR = ${k.codFor}`);
      if (e) emitentes.set(k.codFor, e);
    }
    const itensProduto = await consultar(`SELECT * FROM E440IPC WHERE ${chaveNf}`);
    const itensServico = await consultar(`SELECT * FROM E440ISC WHERE ${chaveNf}`);
    const codTra = Number(nf.CODTRA);
    const transp = codTra > 0 ? await um(consultar, `SELECT CODTRA, NOMTRA, CGCCPF FROM E073TRA WHERE CODTRA = ${codTra}`).catch(() => null) : null;
    notas.push({ nf, itensProduto, itensServico, emitente: emitentes.get(k.codFor) ?? null, destinatario: filial, transportadora: transp });
  }

  return {
    oc: { numOcp: oc.numOcp, codFil: oc.codFil },
    cab,
    fornecedor,
    condicaoPagamento: cpg?.DESCPG?.trim() || null,
    contasFinanceiras,
    itens: itensDoFluxo(fluxo.produtos, fluxo.servicos),
    notas,
  };
}

