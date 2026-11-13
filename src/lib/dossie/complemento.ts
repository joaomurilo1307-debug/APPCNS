// Complemento do dossie: o que o fluxo herdado do n8n nao trazia (ou trazia errado).
//   - dados completos da OC (fornecedor + endereco, condicao/forma de pagamento, observacao da OC, despesa reembolsavel);
//   - produtos, servicos e rateios com a coluna "Reembolsavel" e o valor do rateio como fatia do item (ver itens.ts);
//   - aviso de OC REEMBOLSAVEL (conta financeira >= 180 em algum rateio, ou USU_REEMB = 'S'), com os itens reembolsaveis;
//   - historico do fornecedor: os 3 pagamentos mais recentes no contas a pagar (ver historico.ts);
//   - aviso de "sem nota fiscal" (o dossie so' e' gerado depois que a OC vira titulo; se ainda nao ha NF, fica escrito);
//   - DANFE completa de cada nota, montada com os dados da nota na Senior (ver danfe.ts), ou, para locacao sem nota, o
//     espelho da fatura de locacao (ver locacao.ts).
// So' LEITURA na Senior, sempre pela fila unica (consultarSenior). Falha de consulta = excecao: o dossie vai para ERRO e
// a geracao automatica tenta de novo -- melhor do que publicar um PDF que parece completo e nao e'. (Excecao: o nome do
// centro de custo / conta financeira; sem ele a linha mostra so' o codigo.)
// O texto e' HTML pronto; o gerador do fluxo (nos/gerar-html-do-dossie.js) so' deixa marcadores no lugar certo e
// montarDossie (gerar.ts) troca os marcadores pelo que sai daqui.

import { consultarSenior, type LinhaSenior } from "@/lib/senior/getDbInfo";
import { COD_EMP, numeroSenior } from "@/lib/senior/ocsConferencia";
import { cnpjCpf, esc, moeda, quantidade } from "./formatar";
import { CSS_DANFE, montarDanfe, type DadosNota } from "./danfe";
import { CSS_HISTORICO, montarHtmlHistorico, sqlHistorico, ultimosPagamentos, type PagamentoHistorico } from "./historico";
import {
  CONTA_REEMBOLSAVEL_A_PARTIR_DE,
  CSS_ITENS,
  distribuirRateios,
  itemReembolsavel,
  itensDoFluxo,
  lerRateios,
  montarHtmlItens,
  resumoReembolso,
  type ItemOc,
  type LinhaRateio,
} from "./itens";
import { montarFaturaLocacao, precisaFaturaLocacao, type TituloDoFluxo } from "./locacao";

export { CONTA_REEMBOLSAVEL_A_PARTIR_DE, itensDoFluxo, type ItemOc };

export const MARCADOR_OC = "<!--COMPLEMENTO_OC-->";
export const MARCADOR_ITENS = "<!--COMPLEMENTO_ITENS-->";
export const MARCADOR_HISTORICO = "<!--COMPLEMENTO_HISTORICO-->";
export const MARCADOR_DANFE = "<!--COMPLEMENTO_DANFE-->";

type Consultar = (sql: string) => Promise<LinhaSenior[]>;
export type ChaveNota = { codFil: number; codFor: number; numNfc: number; codSnf: string };

export type DadosComplemento = {
  oc: { numOcp: number; codFil: number };
  cab: LinhaSenior;
  fornecedor: LinhaSenior;
  filial: LinhaSenior | null;
  condicaoPagamento: string | null;
  contasFinanceiras: number[];
  rateios: LinhaRateio[];
  nomes: { ccu: Map<string, string>; conta: Map<number, string> };
  itens: ItemOc[];
  titulos: TituloDoFluxo[];
  notas: DadosNota[];
  historico: PagamentoHistorico[];
  /** O historico juntou mais de um cadastro (grupo de empresas)? Mostra o codigo do fornecedor em cada linha. */
  historicoDeVariosFornecedores: boolean;
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

const valorDaOc = (cab: LinhaSenior) => numeroSenior(cab.VLRORI) || numeroSenior(cab.VLRLIQ);

// "2X VAREJO" -> 2 parcelas. O dossie so' mostrava o valor total da OC, sem avisar que ele vem dividido --
// achado 13/11/2026 (OC 16678, 010 - 2X VAREJO): confere pra 26 das OCs com dossie publicado (2+ titulos
// vinculados), mas o pior caso e' a OC ainda EM ANALISE, sem nenhum titulo gerado na Senior ainda -- so' a
// condicao de pagamento ja avisa que vai parcelar, e e' a unica fonte disso nesse ponto. So' calcula quando
// o proprio texto da condicao confirma 2+ parcelas (nunca inventa uma parcela que a condicao nao diz).
export function parcelamento(condicaoPagamento: string | null, valorOc: number): string | null {
  const m = /^0*(\d+)\s*X\b/i.exec((condicaoPagamento || "").trim());
  if (!m) return null;
  const n = Number(m[1]);
  if (!Number.isFinite(n) || n < 2) return null;
  return `Parcelado em ${n}x de ${moeda(valorOc / n)}`;
}

// ---------------------------------------------------------------- HTML

const CSS_COMPLEMENTO = `
.aviso-forte { border: 2px solid #222; background: #f1f1f1; padding: 10px; margin: 12px 0; font-size: 11px; line-height: 1.4; break-inside: avoid; }
.aviso-forte b.tit { display: block; font-size: 13px; margin-bottom: 4px; letter-spacing: .3px; }
.aviso-leve { border: 1px solid #888; padding: 8px; margin: 12px 0; font-size: 10px; line-height: 1.4; break-inside: avoid; }
.dados-oc th { width: 17%; }
.obs-oc { white-space: pre-wrap; }
.parcelamento { display: block; margin-top: 2px; font-weight: bold; }
`;

function textoReembolso(r: ReturnType<typeof resumoReembolso>): string {
  if (r.situacao === "SIM") return `Sim — toda a OC (${moeda(r.reembolsavel)})`;
  if (r.situacao === "MISTA") return `Mista — ${moeda(r.reembolsavel)} reembolsável e ${moeda(r.naoReembolsavel)} não reembolsável`;
  return "Não";
}

function blocoDadosOc(d: DadosComplemento, reembolso: ReturnType<typeof resumoReembolso>): string {
  const { cab, fornecedor: f } = d;
  const cpg = [cab.CODCPG, d.condicaoPagamento].filter((x) => x && x.trim()).join(" - ");
  const parc = parcelamento(d.condicaoPagamento, valorDaOc(cab));
  const linha = (rotulo: string, valor: string | null | undefined) => `<tr><th>${esc(rotulo)}</th><td colspan="3">${esc(valor && valor.trim() ? valor : "-")}</td></tr>`;
  return `
<h2>Dados da Ordem de Compra</h2>
<table class="dados-oc">
<tr><th>Fornecedor</th><td>${esc([f.CODFOR, f.NOMFOR].filter(Boolean).join(" - "))}</td><th>CNPJ/CPF</th><td>${esc(cnpjCpf(f.CGCCPF))}</td></tr>
${linha("Endereço do fornecedor", enderecoDe(f))}
<tr><th>Inscrição estadual</th><td>${esc(f.INSEST || "-")}</td><th>Telefone</th><td>${esc(f.FONFOR || "-")}</td></tr>
<tr><th>Condição de pagamento</th><td>${esc(cpg || "-")}${parc ? `<span class="parcelamento">${esc(parc)}</span>` : ""}</td><th>Forma de pagamento</th><td>${esc(cab.CODFPG ? `código ${cab.CODFPG}` : "-")}</td></tr>
<tr><th>Valor da OC</th><td>${esc(moeda(valorDaOc(cab)))}</td><th>Saldo em aberto</th><td>${esc(moeda(numeroSenior(cab.VLRLIQ)))}</td></tr>
${linha("Despesa reembolsável", textoReembolso(reembolso))}
<tr><th>Observações da OC</th><td colspan="3" class="obs-oc">${esc(cab.OBSOCP && cab.OBSOCP.trim() ? cab.OBSOCP : "Sem observações.")}</td></tr>
</table>`;
}

function blocoReembolso(d: DadosComplemento, motivo: string, itensReembolsaveis: ItemOc[], reembolso: ReturnType<typeof resumoReembolso>): string {
  const linhas = itensReembolsaveis.length
    ? itensReembolsaveis.map((i) => `<tr><td>${esc(i.codigo)}</td><td>${esc(i.descricao)}</td><td>${esc(i.unidade)}</td><td class="num">${esc(quantidade(i.quantidade))}</td><td class="num">${esc(moeda(i.unitario))}</td><td class="num">${esc(moeda(i.total))}</td></tr>`).join("")
    : `<tr><td colspan="6" class="vazio">Nenhum item encontrado.</td></tr>`;
  const mista =
    reembolso.situacao === "MISTA"
      ? `<br><b>OC mista:</b> ${esc(moeda(reembolso.reembolsavel))} reembolsável e ${esc(moeda(reembolso.naoReembolsavel))} não reembolsável (pelo rateio). A coluna "Reembolsável" das tabelas de itens e de rateio mostra cada parte.`
      : "";
  return `
<div class="aviso-forte"><b class="tit">ITEM REEMBOLSÁVEL</b>
Esta Ordem de Compra tem despesa reembolsável — ${esc(motivo)}.${mista}<br>Fornecedor: ${esc([d.fornecedor.NOMFOR].filter(Boolean).join(""))} — CNPJ/CPF ${esc(cnpjCpf(d.fornecedor.CGCCPF))}.</div>
<table>
<thead><tr><th>Código</th><th>Descrição</th><th>Un.</th><th>Quantidade</th><th>Valor unitário</th><th>Valor total</th></tr></thead>
<tbody>${linhas}</tbody>
</table>`;
}

const BLOCO_SEM_NF = `
<div class="aviso-forte"><b class="tit">SEM NOTA FISCAL</b>
Não há nota fiscal vinculada ao título desta Ordem de Compra no ERP. Este dossiê foi gerado sem a nota fiscal e sem a DANFE; será gerado de novo, com a nota, assim que ela for lançada.</div>`;

const BLOCO_LOCACAO = `
<div class="aviso-leve"><b>Locação sem nota fiscal.</b> Esta OC é de locação e não tem nota fiscal lançada no ERP; o espelho da fatura de locação, montado com os dados do título e da OC, está no fim do dossiê.</div>`;

/** Os trechos que entram no lugar dos marcadores do gerador de HTML. */
export function montarHtmlComplemento(d: DadosComplemento): { oc: string; itens: string; historico: string; danfe: string; css: string } {
  const valorOc = valorDaOc(d.cab) || d.itens.reduce((s, i) => s + i.total, 0);
  const distribuidos = distribuirRateios(d.itens, d.rateios, valorOc);
  const reembolso = resumoReembolso(d.itens, distribuidos, d.cab.USU_REEMB, valorOc);
  const motivo = motivoReembolso(d.contasFinanceiras, d.cab.USU_REEMB);
  const locacao = precisaFaturaLocacao(d.itens, d.notas.length);
  const itensReembolsaveis = d.itens.filter((i) => itemReembolsavel(i, distribuidos, d.cab.USU_REEMB));

  const oc = blocoDadosOc(d, reembolso) + (motivo ? blocoReembolso(d, motivo, itensReembolsaveis, reembolso) : "") + (d.notas.length ? "" : locacao ? BLOCO_LOCACAO : BLOCO_SEM_NF);
  const danfe = locacao
    ? montarFaturaLocacao({ numOcp: d.oc.numOcp, locador: d.fornecedor, locatario: d.filial, titulos: d.titulos, itens: d.itens, observacao: d.cab.OBSOCP ?? null })
    : d.notas.map((n, i) => montarDanfe(n, i + 1, d.notas.length)).join("");
  return {
    oc,
    itens: montarHtmlItens(d.itens, distribuidos, d.cab.USU_REEMB, d.nomes),
    historico: montarHtmlHistorico(d.historico, d.historicoDeVariosFornecedores),
    danfe,
    css: CSS_COMPLEMENTO + CSS_ITENS + CSS_HISTORICO + CSS_DANFE,
  };
}

/** Troca os marcadores deixados pelo gerador de HTML. Sem marcador no HTML = erro (gerador e complemento fora de sincronia). */
export function aplicarComplemento(html: string, c: { oc: string; itens: string; historico: string; danfe: string; css: string }): string {
  const faltando = [MARCADOR_OC, MARCADOR_ITENS, MARCADOR_HISTORICO, MARCADOR_DANFE, "</style>"].filter((m) => !html.includes(m));
  if (faltando.length) {
    throw new Error(`O HTML do dossiê não tem os marcadores do complemento (gerar-html-do-dossie.js desatualizado): ${faltando.join(", ")}.`);
  }
  return html
    .replace("</style>", () => `${c.css}</style>`)
    .replace(MARCADOR_OC, () => c.oc)
    .replace(MARCADOR_ITENS, () => c.itens)
    .replace(MARCADOR_HISTORICO, () => c.historico)
    .replace(MARCADOR_DANFE, () => c.danfe);
}

// ---------------------------------------------------------------- coleta (somente leitura)

const um = async (consultar: Consultar, sql: string) => (await consultar(sql))[0] ?? null;

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

/** Nome do centro de custo e da conta financeira de cada linha de rateio. Falhou = sem nome (a linha mostra o codigo). */
async function nomesDoRateio(emp: number, rateios: LinhaRateio[], consultar: Consultar) {
  const ccus = [...new Set(rateios.map((r) => r.codCcu).filter(Boolean))];
  const contas = [...new Set(rateios.map((r) => r.ctaFin).filter((c): c is number => c !== null))];
  const ccu = new Map<string, string>();
  const conta = new Map<number, string>();
  if (ccus.length) {
    const linhas = await consultar(`SELECT CODCCU, DESCCU FROM E044CCU WHERE CODEMP = ${emp} AND CODCCU IN (${ccus.map(aspas).join(", ")})`).catch(() => []);
    for (const l of linhas) if (l.CODCCU?.trim() && l.DESCCU?.trim()) ccu.set(l.CODCCU.trim(), l.DESCCU.trim());
  }
  if (contas.length) {
    const linhas = await consultar(`SELECT CTAFIN, DESCTA FROM E091PLF WHERE CODEMP = ${emp} AND CTAFIN IN (${contas.join(", ")})`).catch(() => []);
    for (const l of linhas) {
      const c = Number.parseInt(l.CTAFIN ?? "", 10);
      if (Number.isFinite(c) && l.DESCTA?.trim() && !conta.has(c)) conta.set(c, l.DESCTA.trim());
    }
  }
  return { ccu, conta };
}

export async function coletarComplemento(
  oc: { codEmp?: number; codFil: number; numOcp: number },
  fluxo: { produtos: any[]; servicos: any[]; documentosFiscais: any[]; titulos?: any[] },
  consultar: Consultar = consultarSenior,
  opcoes: { fornecedoresDoGrupo?: number[] } = {}
): Promise<DadosComplemento> {
  const emp = oc.codEmp ?? COD_EMP;
  const chaveOc = `CODEMP = ${emp} AND CODFIL = ${oc.codFil} AND NUMOCP = ${oc.numOcp}`;

  const cab = await um(consultar, `SELECT OBSOCP, CODFOR, CODCPG, CODFPG, USU_REEMB, VLRLIQ, VLRORI FROM E420OCP WHERE ${chaveOc}`);
  if (!cab) throw new Error(`OC ${oc.numOcp} (filial ${oc.codFil}) não encontrada na Senior ao montar o complemento.`);
  const codFor = Number(cab.CODFOR);

  const fornecedor = await um(consultar, `SELECT CODFOR, NOMFOR, APEFOR, CGCCPF, INSEST, ENDFOR, CPLEND, BAIFOR, CIDFOR, SIGUFS, CEPFOR, FONFOR FROM E095FOR WHERE CODFOR = ${codFor}`);
  if (!fornecedor) throw new Error(`Fornecedor ${codFor} não encontrado na Senior.`);

  const cpg = cab.CODCPG?.trim() ? await um(consultar, `SELECT DESCPG FROM E028CPG WHERE CODEMP = ${emp} AND CODCPG = ${aspas(cab.CODCPG.trim())}`) : null;
  // SELECT *: o fluxo ja' le a E420RAT assim; os campos usados estao em itens.ts (lerRateios).
  const rateios = lerRateios(await consultar(`SELECT * FROM E420RAT WHERE ${chaveOc}`));
  const nomes = await nomesDoRateio(emp, rateios, consultar);

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

  // Historico: os ultimos pagamentos do fornecedor (e do grupo de empresas dele), sem os titulos desta OC.
  const titulos: any[] = Array.isArray(fluxo.titulos) ? fluxo.titulos : [];
  const fornecedores = opcoes.fornecedoresDoGrupo?.length ? opcoes.fornecedoresDoGrupo : [codFor];
  const historico = ultimosPagamentos(
    await consultar(sqlHistorico(emp, fornecedores)),
    titulos.map((t) => ({ codFil: t?.filial, codFor: t?.fornecedor, numTit: t?.numero }))
  );

  return {
    oc: { numOcp: oc.numOcp, codFil: oc.codFil },
    cab,
    fornecedor,
    filial,
    condicaoPagamento: cpg?.DESCPG?.trim() || null,
    contasFinanceiras: rateios.map((r) => r.ctaFin).filter((c): c is number => c !== null),
    rateios,
    nomes,
    itens: itensDoFluxo(fluxo.produtos, fluxo.servicos),
    titulos,
    notas,
    historico,
    historicoDeVariosFornecedores: new Set(historico.map((p) => Number(p.codFor))).size > 1,
  };
}

