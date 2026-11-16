// Historico do fornecedor no dossie: os 3 PAGAMENTOS mais recentes (11/11/2026).
//
// Antes o historico vinha do fluxo herdado do n8n: as 3 ultimas OCs aprovadas (e so' as com SITOCP = 1) e, para cada uma,
// o titulo achado pelo texto livre USU_NUMTIT. Nao era "ultimos pagamentos": OC paga saia da lista, OC sem titulo digitado
// ficava sem pagamento e o prazo vinha da data da OC. Agora a fonte e' o proprio contas a pagar (E501TCP) do fornecedor,
// ordenado pela data do ultimo pagamento (ULTPGT):
//   - entra todo titulo com pagamento registrado (saldo menor que o valor e ULTPGT valida), de qualquer filial e de qualquer
//     cadastro do mesmo grupo de empresas do fornecedor (marketplace);
//   - sai titulo cancelado (CA) e os titulos da propria OC do dossie;
//   - "prazo" = dias entre a emissao do titulo e o pagamento; "em dia" = pago ate o vencimento (prorrogado, se houver).
// So' leitura na Senior, pela fila unica.

import type { LinhaSenior } from "@/lib/senior/getDbInfo";
import { numeroSenior } from "@/lib/senior/ocsConferencia";
import { esc, moeda } from "./formatar";

export const PAGAMENTOS_NO_HISTORICO = 3;

export type PagamentoHistorico = {
  codFil: string;
  codFor: string;
  numTit: string;
  tipo: string;
  situacao: string;
  emissao: string | null; // aaaa-mm-dd
  vencimento: string | null;
  pagamento: string; // ULTPGT
  valor: number; // VLRORI
  pago: number; // VLRORI - VLRABE
  aberto: number;
  nf: string | null;
  oc: string | null;
  prazoDias: number | null;
  emDia: boolean | null;
};

/** dd/mm/aaaa da Senior -> aaaa-mm-dd; sentinelas de "sem data" (1899/1900) e lixo -> null. */
export function dataSenior(v: string | undefined): string | null {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})/.exec((v ?? "").trim());
  if (!m) return null;
  const ano = Number(m[3]);
  return ano < 1950 || ano > 2100 ? null : `${m[3]}-${m[2]}-${m[1]}`;
}

const dias = (de: string, ate: string) => Math.round((Date.parse(`${ate}T12:00:00Z`) - Date.parse(`${de}T12:00:00Z`)) / 86_400_000);
const chave = (codFil: unknown, codFor: unknown, numTit: unknown) => `${Number(codFil) || 0}|${Number(codFor) || 0}|${String(numTit ?? "").trim().toUpperCase()}`;

/** Os `quantidade` pagamentos mais recentes entre os titulos lidos (linhas da E501TCP), sem os titulos de `excluir`. */
export function ultimosPagamentos(
  linhas: LinhaSenior[],
  excluir: { codFil?: unknown; codFor?: unknown; numTit: unknown }[],
  quantidade = PAGAMENTOS_NO_HISTORICO
): PagamentoHistorico[] {
  const fora = new Set(excluir.map((t) => chave(t.codFil, t.codFor, t.numTit)));
  const foraSemFilial = new Set(excluir.filter((t) => !Number(t.codFil)).map((t) => chave(0, t.codFor, t.numTit)));
  const vistos = new Set<string>();
  const pagamentos: PagamentoHistorico[] = [];
  for (const l of linhas) {
    const numTit = (l.NUMTIT ?? "").trim();
    const k = chave(l.CODFIL, l.CODFOR, numTit);
    if (!numTit || fora.has(k) || foraSemFilial.has(chave(0, l.CODFOR, numTit)) || vistos.has(`${k}|${(l.CODTPT ?? "").trim()}`)) continue;
    const situacao = (l.SITTIT ?? "").trim().toUpperCase();
    const pagamento = dataSenior(l.ULTPGT);
    const valor = numeroSenior(l.VLRORI);
    const aberto = numeroSenior(l.VLRABE);
    if (situacao === "CA" || !pagamento || valor - aberto < 0.005) continue;
    vistos.add(`${k}|${(l.CODTPT ?? "").trim()}`);
    const emissao = dataSenior(l.DATEMI);
    const vencimento = dataSenior(l.VCTPRO) ?? dataSenior(l.VCTORI);
    const numNf = numeroSenior(l.NUMNFC);
    const oc = numeroSenior(l.USU_NUMOCP);
    const prazo = emissao ? dias(emissao, pagamento) : null;
    pagamentos.push({
      codFil: (l.CODFIL ?? "").trim(),
      codFor: (l.CODFOR ?? "").trim(),
      numTit,
      tipo: (l.CODTPT ?? "").trim(),
      situacao,
      emissao,
      vencimento,
      pagamento,
      valor,
      pago: Math.round((valor - aberto) * 100) / 100,
      aberto,
      nf: numNf > 0 ? [numNf, (l.SNFNFC ?? "").trim()].filter(Boolean).join(" / ") : null,
      oc: oc > 0 ? String(oc) : null,
      prazoDias: prazo !== null && prazo >= 0 && prazo <= 3650 ? prazo : null,
      emDia: vencimento ? pagamento <= vencimento : null,
    });
  }
  return pagamentos
    .sort((a, b) => b.pagamento.localeCompare(a.pagamento) || (b.emissao ?? "").localeCompare(a.emissao ?? "") || b.numTit.localeCompare(a.numTit))
    .slice(0, quantidade);
}

export type IndicadoresHistorico = { quantidade: number; prazoMedioDias: number | null; pagosEmDia: number; comVencimento: number; ultimoPagamento: string | null };

export function indicadoresDoHistorico(p: PagamentoHistorico[]): IndicadoresHistorico {
  const prazos = p.map((x) => x.prazoDias).filter((x): x is number => x !== null);
  return {
    quantidade: p.length,
    prazoMedioDias: prazos.length ? Math.round(prazos.reduce((s, x) => s + x, 0) / prazos.length) : null,
    pagosEmDia: p.filter((x) => x.emDia === true).length,
    comVencimento: p.filter((x) => x.emDia !== null).length,
    ultimoPagamento: p[0]?.pagamento ?? null,
  };
}

/** SQL dos titulos dos fornecedores (codigos ja validados como inteiros). */
export function sqlHistorico(codEmp: number, fornecedores: number[]): string {
  const codigos = [...new Set(fornecedores.filter((n) => Number.isInteger(n) && n > 0))];
  if (!codigos.length) throw new Error("Fornecedor da OC não identificado para o histórico de pagamentos.");
  return `SELECT CODFIL, NUMTIT, CODTPT, CODFOR, SITTIT, DATEMI, VCTORI, VCTPRO, VLRORI, VLRABE, ULTPGT, NUMNFC, SNFNFC, USU_NUMOCP FROM E501TCP WHERE CODEMP = ${codEmp} AND CODFOR IN (${codigos.join(", ")})`;
}

// ---------------------------------------------------------------- HTML

const br = (iso: string | null) => (iso ? iso.split("-").reverse().join("/") : "-");

export const CSS_HISTORICO = `
.historico-fonte { margin-top: 4px; font-size: 8.5px; color: #555; }
`;

export function montarHtmlHistorico(p: PagamentoHistorico[], varios: boolean): string {
  const ind = indicadoresDoHistorico(p);
  const card = (rotulo: string, valor: string) => `<div class="historico-card"><div class="rotulo">${esc(rotulo)}</div><div class="valor">${valor}</div></div>`;
  const linhas = p.length
    ? p
        .map(
          (x) =>
            `<tr><td>${esc(x.tipo ? `${x.numTit} (${x.tipo})` : x.numTit)}${varios ? `<br><span style="color:#666">forn. ${esc(x.codFor)}</span>` : ""}</td><td>${esc(x.nf ?? "-")}</td><td>${esc(x.oc ?? "-")}</td><td>${esc(br(x.emissao))}</td><td>${esc(br(x.vencimento))}</td><td>${esc(br(x.pagamento))}</td>` +
            `<td class="num">${esc(moeda(x.valor))}</td><td class="num">${esc(moeda(x.pago))}${x.aberto > 0.005 ? `<br><span style="color:#666">resta ${esc(moeda(x.aberto))}</span>` : ""}</td>` +
            `<td class="num">${x.prazoDias === null ? "-" : esc(`${x.prazoDias} dias`)}</td><td>${x.emDia === null ? "-" : x.emDia ? "Sim" : "Não"}</td></tr>`
        )
        .join("")
    : `<tr><td colspan="10" class="vazio">Nenhum pagamento anterior encontrado para este fornecedor na Senior.</td></tr>`;
  return `
<h2>Histórico do Fornecedor — últimos ${PAGAMENTOS_NO_HISTORICO} pagamentos</h2>
<div class="historico-resumo">
${card("Pagamentos analisados", esc(String(ind.quantidade)))}
${card("Prazo médio (emissão → pagamento)", ind.prazoMedioDias === null ? "&mdash;" : esc(`${ind.prazoMedioDias} dias`))}
${card("Pagos até o vencimento", ind.comVencimento ? esc(`${ind.pagosEmDia} de ${ind.comVencimento}`) : "&mdash;")}
${card("Último pagamento", esc(br(ind.ultimoPagamento)))}
</div>
<table>
<thead><tr><th>Título</th><th>NF</th><th>OC</th><th>Emissão</th><th>Vencimento</th><th>Pago em</th><th>Valor do título</th><th>Valor pago</th><th>Prazo</th><th>Em dia</th></tr></thead>
<tbody>${linhas}</tbody>
</table>
<div class="historico-fonte">Fonte: contas a pagar do fornecedor na Senior (E501TCP), pela data do último pagamento de cada título; todas as filiais${varios ? " e todos os cadastros do mesmo grupo de empresas" : ""}; sem os títulos desta OC e sem títulos cancelados.</div>`;
}
