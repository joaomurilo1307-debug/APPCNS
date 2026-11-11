// Fatura de locacao no dossie (11/11/2026). Locacao de bens (veiculo, equipamento) costuma vir com fatura do locador, sem
// nota fiscal lancada na Senior; o dossie entao saia so' com o aviso "SEM NOTA FISCAL". Agora, quando a OC nao tem nota
// e algum item e' de locacao (pela descricao), entra no lugar da DANFE um espelho da fatura, no mesmo padrao, montado com
// os dados da Senior: locador (E095FOR), locatario (E070FIL), titulo(s) do contas a pagar (E501TCP, via fluxo) e itens da OC.
// Nao e' a fatura emitida pelo locador, e a pagina diz isso.

import type { LinhaSenior } from "@/lib/senior/getDbInfo";
import { cnpjCpf, esc, moeda, quantidade } from "./formatar";
import type { ItemOc } from "./itens";

const LOCACAO = /\b(LOCACAO|LOCACOES|LOCAR|LOCADO|LOCADA|LOCADOS|LOCADAS|ALUGUEL|ALUGUEIS|ALUGADO|ALUGADA)\b/;
const semAcento = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase();

/** Item de locacao pela descricao (ex.: "LOCACAO DE VEICULO", "ALUGUEL DE GERADOR"). */
export const itemDeLocacao = (i: Pick<ItemOc, "descricao">) => LOCACAO.test(semAcento(i.descricao ?? ""));

/** A OC precisa do espelho da fatura de locacao? So' quando nao ha nota fiscal e algum item e' de locacao. */
export function precisaFaturaLocacao(itens: Pick<ItemOc, "descricao">[], quantidadeDeNotas: number): boolean {
  return quantidadeDeNotas === 0 && itens.some(itemDeLocacao);
}

/** Titulo como o fluxo normaliza (Normalizar Titulos Financeiros). */
export type TituloDoFluxo = {
  numero?: string | null;
  tipo?: string | null;
  datas?: { emissao?: string | null; vencimentoAtual?: string | null; vencimentoOriginal?: string | null };
  valores?: { original?: number | null; aberto?: number | null };
  situacao?: { descricao?: string | null; codigo?: string | null } | string | null;
};

export type DadosFatura = {
  numOcp: number;
  locador: LinhaSenior;
  locatario: LinhaSenior | null;
  titulos: TituloDoFluxo[];
  itens: ItemOc[];
  observacao: string | null;
};

const v = (l: LinhaSenior | null | undefined, c: string) => (l?.[c] ?? "").trim();
const iso = (s: string | null | undefined) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s ?? "");
  return !m || Number(m[1]) < 1950 ? "-" : `${m[3]}/${m[2]}/${m[1]}`;
};
const campo = (rotulo: string, valor: string) => `<th>${esc(rotulo)}</th><td>${valor}</td>`;
const endereco = (partes: (string | undefined)[]) => partes.filter((p) => p && p.trim()).join(" — ") || "-";

export function montarFaturaLocacao(d: DadosFatura): string {
  const { locador: f, locatario: l } = d;
  const numeros = d.titulos.map((t) => (t.numero ?? "").trim()).filter(Boolean);
  const emissao = d.titulos.map((t) => t.datas?.emissao).find(Boolean) ?? null;
  const valorFatura = d.titulos.reduce((s, t) => s + (Number(t.valores?.original) || 0), 0);
  // OC que mistura locacao com outras compras (ex.: OC 16200, aluguel + materiais no mesmo titulo): so' a locacao entra
  // como "bens locados"; o resto aparece a parte, porque o titulo paga tudo.
  const locados = d.itens.filter(itemDeLocacao);
  const outros = d.itens.filter((i) => !itemDeLocacao(i));
  const soma = (l: ItemOc[]) => l.reduce((s, i) => s + i.total, 0);
  const situacao = (t: TituloDoFluxo) => (typeof t.situacao === "string" ? t.situacao : t.situacao?.descricao ?? t.situacao?.codigo ?? "-");

  const linhasTitulos = d.titulos.length
    ? d.titulos
        .map(
          (t) =>
            `<tr><td>${esc(t.numero ?? "-")}</td><td>${esc(t.tipo ?? "-")}</td><td>${esc(iso(t.datas?.emissao))}</td><td>${esc(iso(t.datas?.vencimentoAtual || t.datas?.vencimentoOriginal))}</td><td class="num">${esc(moeda(Number(t.valores?.original) || 0))}</td><td class="num">${esc(moeda(Number(t.valores?.aberto) || 0))}</td><td>${esc(situacao(t))}</td></tr>`
        )
        .join("")
    : `<tr><td colspan="7" class="vazio">Nenhum título encontrado no contas a pagar.</td></tr>`;
  const linhas = (itens: ItemOc[]) =>
    itens.length
      ? itens
          .map(
            (i) =>
              `<tr><td>${esc(i.codigo)}</td><td>${esc(i.descricao)}</td><td>${esc(i.unidade)}</td><td class="num">${esc(quantidade(i.quantidade))}</td><td class="num">${esc(moeda(i.unitario))}</td><td class="num">${esc(moeda(i.total))}</td></tr>`
          )
          .join("")
      : `<tr><td colspan="6" class="vazio">Nenhum item.</td></tr>`;
  const cabecalhoItens = `<thead><tr><th>Código</th><th>Descrição</th><th>Un.</th><th>Qtde</th><th>Vl. unit.</th><th>Vl. total</th></tr></thead>`;
  const tabelaOutros = outros.length
    ? `
<div class="faixa">Outros itens da mesma OC (pagos no mesmo título, não são locação)</div>
<table class="itens">${cabecalhoItens}<tbody>${linhas(outros)}</tbody></table>`
    : "";
  const totalOutros = outros.length ? campo("Outros itens da OC", esc(moeda(soma(outros)))) : "";

  return `
<div class="danfe">
<div class="topo">
<div><div style="font-size:7px;font-weight:bold">ANEXO FISCAL — LOCAÇÃO SEM NOTA FISCAL</div><div class="nome">Fatura de Locação (espelho)</div><div>Locador: ${esc(v(f, "NOMFOR") || "-")}</div></div>
<div class="num">FATURA<b>Nº ${esc(numeros.join(", ") || "-")}</b>OC ${esc(d.numOcp)}</div>
<div style="width:30%"><div style="font-size:6.5px;color:#444">EMISSÃO</div><div style="font-size:11px;font-weight:bold">${esc(iso(emissao))}</div></div>
</div>

<div class="faixa">Locador</div>
<table><tr>${campo("Razão social", esc(v(f, "NOMFOR") || "-"))}${campo("CNPJ/CPF", esc(cnpjCpf(v(f, "CGCCPF"))))}${campo("Insc. estadual", esc(v(f, "INSEST") || "-"))}</tr>
<tr><th>Endereço</th><td colspan="3">${esc(endereco([f.ENDFOR, f.CPLEND, f.BAIFOR, [f.CIDFOR, f.SIGUFS].filter(Boolean).join("/"), f.CEPFOR && `CEP ${f.CEPFOR}`]))}</td><th>Telefone</th><td>${esc(v(f, "FONFOR") || "-")}</td></tr></table>

<div class="faixa">Locatário</div>
<table><tr>${campo("Razão social", esc(v(l, "NOMFIL") || "-"))}${campo("CNPJ", esc(cnpjCpf(v(l, "NUMCGC"))))}${campo("Insc. estadual", esc(v(l, "INSEST") || "-"))}</tr>
<tr><th>Endereço</th><td colspan="5">${esc(l ? endereco([l.ENDENT || l.ENDFIL, l.BAIFIL, [l.CIDFIL, l.SIGUFS].filter(Boolean).join("/"), l.CEPFIL && `CEP ${l.CEPFIL}`]) : "-")}</td></tr></table>

<div class="faixa">Fatura / títulos no contas a pagar</div>
<table class="itens"><thead><tr><th>Título</th><th>Tipo</th><th>Emissão</th><th>Vencimento</th><th>Valor</th><th>Saldo</th><th>Situação</th></tr></thead><tbody>${linhasTitulos}</tbody></table>

<div class="faixa">Bens / serviços locados (itens da OC)</div>
<table class="itens">${cabecalhoItens}<tbody>${linhas(locados)}</tbody></table>
${tabelaOutros}

<div class="faixa">Totais</div>
<table><tr>${campo("Total da locação", esc(moeda(soma(locados))))}${totalOutros}<th>Valor da fatura (títulos)</th><td class="total">${esc(moeda(valorFatura))}</td></tr></table>

<div class="faixa">Observações da OC</div>
<table><tr><td class="obs">${esc(d.observacao && d.observacao.trim() ? d.observacao : "Sem observações.")}</td></tr></table>

<div class="nota-rodape">Espelho montado pelo sistema com os dados da OC e do contas a pagar na Senior (E420OCP, itens da OC e E501TCP), porque a locação não tem nota fiscal lançada no ERP. Não substitui a fatura emitida pelo locador.</div>
</div>`;
}
