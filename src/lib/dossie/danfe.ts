// DANFE montada com os dados da nota fiscal NA SENIOR (E440NFC cabecalho, E440IPC itens de produto, E440ISC itens de
// servico, E095FOR emitente, E070FIL destinatario, E073TRA transportadora). NAO e' o PDF oficial do emissor: o ERP
// nao guarda o XML nem o protocolo de autorizacao, e a pagina diz isso. Nota sem chave de acesso (NFS-e, nota
// manual) sai como "espelho da nota fiscal", com os mesmos blocos.

import type { LinhaSenior } from "@/lib/senior/getDbInfo";
import { numeroSenior } from "@/lib/senior/ocsConferencia";
import { chaveEmBlocos, cnpjCpf, dataBr, esc, moeda, percentual, quantidade } from "./formatar";

export type DadosNota = {
  nf: LinhaSenior;
  itensProduto: LinhaSenior[];
  itensServico: LinhaSenior[];
  emitente: LinhaSenior | null;
  destinatario: LinhaSenior | null;
  transportadora: LinhaSenior | null;
};

export const CSS_DANFE = `
.danfe { page-break-before: always; break-before: page; font-size: 8px; }
.danfe table { margin-top: 0; }
.danfe th { font-size: 6.5px; text-transform: uppercase; background: #f4f4f4; padding: 2px 3px; font-weight: normal; color: #444; }
.danfe td { font-size: 8px; padding: 3px; }
.danfe .faixa { margin-top: 5px; padding: 2px 4px; background: #e3e3e3; border: 1px solid #555; font-size: 7.5px; font-weight: bold; text-transform: uppercase; }
.danfe .topo { display: table; width: 100%; border: 2px solid #222; }
.danfe .topo > div { display: table-cell; vertical-align: middle; padding: 6px; }
.danfe .topo .nome { font-size: 15px; font-weight: bold; }
.danfe .topo .num { text-align: center; width: 110px; border-left: 2px solid #222; border-right: 2px solid #222; }
.danfe .topo .num b { font-size: 15px; display: block; }
.danfe .chave { border: 1px solid #888; border-top: 0; padding: 5px; font-family: "Courier New", monospace; font-size: 10px; letter-spacing: .3px; }
.danfe .itens td, .danfe .itens th { font-size: 7px; padding: 2px; }
.danfe .total { font-weight: bold; font-size: 10px; }
.danfe .nota-rodape { margin-top: 8px; border-top: 1px solid #999; padding-top: 4px; font-size: 7px; color: #555; }
.danfe .obs { white-space: pre-wrap; min-height: 24px; }
`;

const v = (l: LinhaSenior | null | undefined, c: string) => (l?.[c] ?? "").trim();
const n = (l: LinhaSenior | null | undefined, c: string) => numeroSenior(l?.[c]);
const m = (l: LinhaSenior | null | undefined, c: string) => esc(moeda(n(l, c)));
const campo = (rotulo: string, valor: string, largura = "") => `<th${largura}>${esc(rotulo)}</th><td>${valor}</td>`;

function enderecoFornecedor(f: LinhaSenior | null) {
  if (!f) return "-";
  return [f.ENDFOR, f.CPLEND, f.BAIFOR, [f.CIDFOR, f.SIGUFS].filter(Boolean).join("/"), f.CEPFOR && `CEP ${f.CEPFOR}`].filter((p) => p && p.trim()).join(" — ") || "-";
}
function enderecoFilial(f: LinhaSenior | null) {
  if (!f) return "-";
  return [f.ENDENT || f.ENDFIL, f.BAIFIL, [f.CIDFIL, f.SIGUFS].filter(Boolean).join("/"), f.CEPFIL && `CEP ${f.CEPFIL}`].filter((p) => p && p.trim()).join(" — ") || "-";
}

function linhasProdutos(itens: LinhaSenior[]) {
  return itens
    .map(
      (i) =>
        `<tr><td>${esc(v(i, "CODPRO"))}</td><td>${esc(v(i, "CPLIPC"))}</td><td>${esc(v(i, "CODCLF"))}</td><td>${esc(v(i, "CODSTR"))}</td><td>${esc(v(i, "NOPPRO"))}</td><td>${esc(v(i, "UNINFC") || v(i, "UNIMED"))}</td>` +
        `<td class="num">${esc(quantidade(n(i, "QTDREC")))}</td><td class="num">${m(i, "PREUNI")}</td><td class="num">${m(i, "VLRBRU")}</td><td class="num">${m(i, "VLRBIC")}</td><td class="num">${m(i, "VLRICM")}</td><td class="num">${m(i, "VLRIPI")}</td>` +
        `<td class="num">${esc(percentual(n(i, "PERICM")))}</td><td class="num">${esc(percentual(n(i, "PERIPI")))}</td></tr>`
    )
    .join("");
}

function linhasServicos(itens: LinhaSenior[]) {
  return itens
    .map(
      (i) =>
        `<tr><td>${esc(v(i, "CODSER"))}</td><td>${esc(v(i, "CPLISC"))}</td><td>${esc(v(i, "NOPSER"))}</td><td>${esc(v(i, "UNIMED"))}</td><td class="num">${esc(quantidade(n(i, "QTDREC")))}</td><td class="num">${m(i, "PREUNI")}</td>` +
        `<td class="num">${m(i, "VLRBRU")}</td><td class="num">${m(i, "VLRBIS")}</td><td class="num">${m(i, "VLRISS")}</td><td class="num">${esc(percentual(n(i, "PERISS")))}</td><td class="num">${m(i, "VLRIRF")}</td><td class="num">${m(i, "VLRINS")}</td></tr>`
    )
    .join("");
}

export function montarDanfe(d: DadosNota, indice: number, total: number): string {
  const { nf, emitente: e, destinatario: f, transportadora: t } = d;
  const chave = v(nf, "CHVNEL");
  const titulo = chave ? "DANFE — Documento Auxiliar da Nota Fiscal Eletrônica" : "Espelho da Nota Fiscal (sem chave de acesso NF-e)";
  const descontos = n(nf, "VLRDS1") + n(nf, "VLRDS2") + n(nf, "VLRDS3") + n(nf, "VLRDS4") + n(nf, "VLRDS5") + n(nf, "VLRDSE") + n(nf, "VLRDPR");
  const ciffob = ({ C: "CIF (emitente)", F: "FOB (destinatário)" } as Record<string, string>)[v(nf, "CIFFOB")] ?? v(nf, "CIFFOB"); // outro codigo: mostra como veio

  const tabelaProdutos = d.itensProduto.length
    ? `<div class="faixa">Dados dos produtos</div>
<table class="itens"><thead><tr><th>Código</th><th>Descrição</th><th>Class. fiscal</th><th>CST</th><th>CFOP</th><th>Un.</th><th>Qtde</th><th>Vl. unit.</th><th>Vl. total</th><th>BC ICMS</th><th>Vl. ICMS</th><th>Vl. IPI</th><th>% ICMS</th><th>% IPI</th></tr></thead><tbody>${linhasProdutos(d.itensProduto)}</tbody></table>`
    : "";
  const tabelaServicos = d.itensServico.length
    ? `<div class="faixa">Dados dos serviços</div>
<table class="itens"><thead><tr><th>Código</th><th>Descrição</th><th>Natureza</th><th>Un.</th><th>Qtde</th><th>Vl. unit.</th><th>Vl. total</th><th>BC ISS</th><th>Vl. ISS</th><th>% ISS</th><th>Vl. IRRF</th><th>Vl. INSS</th></tr></thead><tbody>${linhasServicos(d.itensServico)}</tbody></table>`
    : "";
  const semItens = !d.itensProduto.length && !d.itensServico.length ? `<div class="faixa">Itens</div><div class="vazio">A nota não tem itens lançados no ERP.</div>` : "";

  return `
<div class="danfe">
<div class="topo">
<div><div style="font-size:7px;font-weight:bold">ANEXO FISCAL ${indice} DE ${total}</div><div class="nome">${esc(titulo)}</div><div>Emitente: ${esc(v(e, "NOMFOR") || "-")}</div></div>
<div class="num">0 – ENTRADA<b>Nº ${esc(v(nf, "NUMNFC"))}</b>Série ${esc(v(nf, "CODSNF"))}</div>
<div style="width:34%"><div style="font-size:6.5px;color:#444">CHAVE DE ACESSO</div><div style="font-family:'Courier New',monospace;font-size:9px;word-break:break-all">${esc(chaveEmBlocos(chave) || "Não informada")}</div></div>
</div>
<table><tr>${campo("Natureza da operação (cód. Senior)", esc(v(nf, "NOPPRO") || v(nf, "NOPSER") || "-"))}${campo("Emissão", esc(dataBr(v(nf, "DATEMI"))))}${campo("Entrada", esc(dataBr(v(nf, "DATENT"))))}</tr></table>

<div class="faixa">Emitente</div>
<table><tr>${campo("Razão social", esc(v(e, "NOMFOR") || "-"))}${campo("CNPJ/CPF", esc(cnpjCpf(v(e, "CGCCPF"))))}${campo("Insc. estadual", esc(v(e, "INSEST") || "-"))}</tr>
<tr><th>Endereço</th><td colspan="5">${esc(enderecoFornecedor(e))}</td></tr></table>

<div class="faixa">Destinatário</div>
<table><tr>${campo("Razão social", esc(v(f, "NOMFIL") || "-"))}${campo("CNPJ", esc(cnpjCpf(v(f, "NUMCGC"))))}${campo("Insc. estadual", esc(v(f, "INSEST") || "-"))}</tr>
<tr><th>Endereço</th><td colspan="5">${esc(enderecoFilial(f))}</td></tr></table>

<div class="faixa">Cálculo do imposto</div>
<table><tr>${campo("Base ICMS", m(nf, "VLRBIC"))}${campo("Valor ICMS", m(nf, "VLRICM"))}${campo("Base ICMS ST", m(nf, "VLRBSI"))}${campo("Valor ICMS ST", m(nf, "VLRSIC"))}</tr>
<tr>${campo("Total produtos", m(nf, "VLRLPR"))}${campo("Total serviços", m(nf, "VLRLSE"))}${campo("Frete", m(nf, "VLRFRE"))}${campo("Seguro", m(nf, "VLRSEG"))}</tr>
<tr>${campo("Desconto", esc(moeda(descontos)))}${campo("Outras despesas", m(nf, "VLROUT"))}${campo("Valor IPI", m(nf, "VLRIPI"))}${campo("Valor ISS", m(nf, "VLRISS"))}</tr>
<tr>${campo("IRRF", m(nf, "VLRIRF"))}${campo("INSS", m(nf, "VLRINS"))}${campo("PIS", m(nf, "VLRPIS"))}<th>Valor total da nota</th><td class="total">${m(nf, "VLRLIQ")}</td></tr></table>

<div class="faixa">Transportador / volumes</div>
<table><tr>${campo("Transportador", esc(v(t, "NOMTRA") || "-"))}${campo("Frete por conta", esc(ciffob || "-"))}${campo("Placa", esc(v(nf, "PLAVEI") || "-"))}</tr>
<tr>${campo("Quantidade", esc(v(nf, "QTDEMB") || "-"))}${campo("Peso bruto", esc(quantidade(n(nf, "PESBRU"))))}${campo("Peso líquido", esc(quantidade(n(nf, "PESLIQ"))))}</tr></table>

${tabelaProdutos}${tabelaServicos}${semItens}

<div class="faixa">Dados adicionais</div>
<table><tr><td class="obs">${esc(v(nf, "OBSNFC") || "Sem informações adicionais.")}</td></tr></table>

<div class="nota-rodape">Montada pelo sistema com os dados da nota lançada no ERP Senior (E440NFC/E440IPC/E440ISC). Não é o PDF oficial do emissor: o ERP não guarda o protocolo de autorização nem o XML.</div>
</div>`;
}
