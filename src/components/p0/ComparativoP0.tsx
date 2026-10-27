"use client";

// Comparativo do REALIZADO do Senior com o PREVISTO no P0, mes a mes e conta a conta (o que subiu, o que caiu e o que ficou fora do P0).
// Usado na aba Custos (logo abaixo de "O que variou do mes anterior") e na aba P0. So' dado do Senior e da planilha do P0; nada estimado.
// Reembolsaveis: enquanto o Senior lanca numa conta so', as contas R do P0 sao somadas; quando ja' lanca nas contas R, compara linha a linha
// (regra em src/lib/p0/comparar.ts).

import { Fragment, useMemo, useState } from "react";
import type { ContaDoContrato, Filtros } from "@/lib/custos/agregacao";
import { mesCurto, mesLongo, moeda, moedaCompacta, percentual } from "@/lib/custos/formato";
import { compararMes, type LinhaComparacao, type StatusComparacao } from "@/lib/p0/comparar";
import type { P0Custos } from "@/lib/p0/montar";
import BotaoExcel from "@/components/BotaoExcel";
import { abaDeLinhas } from "@/lib/exportarExcel";
import { Cartao, SeloReembolsavel } from "@/components/custos/ui";

type Filtro = "todas" | Exclude<StatusComparacao, "igual">;

const SELO: Record<StatusComparacao, { t: string; c: string }> = {
  acima: { t: "Acima do P0", c: "bg-red-100 text-red-700" },
  abaixo: { t: "Abaixo do P0", c: "bg-emerald-100 text-emerald-800" },
  igual: { t: "Igual ao P0", c: "bg-gray-100 text-gray-600" },
  sem_previsao: { t: "Sem previsão", c: "bg-violet-100 text-violet-800" },
  nao_realizado: { t: "Não realizado", c: "bg-slate-200 text-slate-700" },
};

const pctTexto = (p: number | null) => (p === null ? "" : `(${p > 0 ? "+" : "−"}${percentual(Math.abs(p), Math.abs(p) < 0.1 ? 1 : 0)})`);
const corDelta = (d: number) => (d > 0.005 ? "text-red-600" : d < -0.005 ? "text-emerald-700" : "text-gray-500");
const dinheiroComSinal = (d: number) => `${d > 0.005 ? "+" : d < -0.005 ? "−" : ""}${moeda(Math.abs(d))}`;

export default function ComparativoP0({
  p0,
  realizado,
  mes,
  mesesEscolha,
  onMes,
  filtros,
  busca = "",
  mesCorrente,
  baseRotulo,
  nomeArquivo,
}: {
  p0: P0Custos;
  realizado: ContaDoContrato[];
  mes: string;
  /** meses que podem ser escolhidos (aaaa-mm, do mais antigo ao mais novo) */
  mesesEscolha: string[];
  onMes: (mes: string) => void;
  filtros: Pick<Filtros, "tipo" | "grupo">;
  busca?: string;
  mesCorrente: string;
  /** "data de pagamento" ou "competência da nota": como o realizado esta' sendo colocado em cada mes */
  baseRotulo: string;
  nomeArquivo: string;
}) {
  const [filtro, setFiltro] = useState<Filtro>("todas");
  const [fechados, setFechados] = useState<Set<string>>(new Set());

  const c = useMemo(() => compararMes({ p0: p0.contas, realizado, mes, periodo: { mesIni: p0.mesIni, mesFim: p0.mesFim }, filtros, busca }), [p0, realizado, mes, filtros, busca]);
  const parcial = mes === mesCorrente;
  const semPrevisaoValor = c.grupos.flatMap((g) => g.linhas).filter((l) => l.status === "sem_previsao").reduce((s, l) => s + l.realizado, 0);
  const todasLinhas = c.grupos.flatMap((g) => g.linhas);
  const maxAbs = Math.max(1, ...todasLinhas.map((l) => Math.abs(l.delta)));
  const visivel = (l: LinhaComparacao) => filtro === "todas" || l.status === filtro;
  const abas: [Filtro, string, number][] = [
    ["todas", "Todas", todasLinhas.length],
    ["acima", "Acima do P0", c.contagem.acima],
    ["abaixo", "Abaixo do P0", c.contagem.abaixo],
    ["sem_previsao", "Sem previsão", c.contagem.sem_previsao],
    ["nao_realizado", "Não realizadas", c.contagem.nao_realizado],
  ];
  const temReembolsavel = todasLinhas.some((l) => l.reembolsavel);

  function linhasExcel(): (string | number)[][] {
    const cab = ["Tipo de custo", "Conta", "Situação", "Previsto (P0)", "Realizado (Senior)", "Diferença", "Diferença %"];
    const corpo: (string | number)[][] = [];
    for (const g of c.grupos) for (const l of g.linhas) corpo.push([g.grupoNome, l.nome, SELO[l.status].t, l.previsto, l.realizado, l.delta, l.pct ?? ""]);
    corpo.push(["", "TOTAL", "", c.previsto, c.realizado, c.delta, c.pct ?? ""]);
    return [cab, ...corpo];
  }

  const alternar = (g: string) =>
    setFechados((a) => {
      const n = new Set(a);
      if (n.has(g)) n.delete(g);
      else n.add(g);
      return n;
    });

  return (
    <Cartao
      titulo={`Comparativo com o P0: ${mesCurto(mes)}`}
      subtitulo={`O realizado do Senior (por ${baseRotulo}) contra o previsto no P0, conta a conta · vermelho = gastou mais que o P0, verde = gastou menos${parcial ? " · mês em andamento: só o já pago" : ""}`}
      acao={
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-1.5 text-[13px] text-gray-600">
            Mês
            <select value={mes} onChange={(e) => onMes(e.target.value)} className="rounded-lg border border-gray-200 px-2 py-1.5 text-[13px] focus:border-brand focus:outline-none" aria-label="Mês do comparativo com o P0">
              {mesesEscolha.map((m) => (
                <option key={m} value={m}>
                  {mesLongo(m).replace(" de ", " ")}
                  {m === mesCorrente ? " (em andamento)" : ""}
                </option>
              ))}
            </select>
          </label>
          {c.temP0 && (
            <BotaoExcel
              arquivo={`comparativo_p0_${nomeArquivo}_${mes}`}
              rotulo="Exportar Excel"
              className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-[13px] font-medium text-emerald-800 transition hover:bg-emerald-100 disabled:opacity-50"
              gerar={() => [abaDeLinhas(`P0 x realizado ${mes}`, linhasExcel(), `Comparativo com o P0 · ${mesLongo(mes)} · realizado por ${baseRotulo}${parcial ? " · mês em andamento (só o já pago)" : ""}`, true)]}
            />
          )}
        </div>
      }
    >
      {!c.temP0 ? (
        <p className="rounded-xl bg-gray-50 px-4 py-6 text-center text-sm text-gray-600">
          O P0 deste contrato cobre de <b>{mesLongo(p0.mesIni)}</b> a <b>{mesLongo(p0.mesFim)}</b>. Em {mesLongo(mes)} não há previsão para comparar; o realizado do Senior neste mês foi de <b>{moeda(c.realizado)}</b>.
        </p>
      ) : (
        <>
          <div className="mb-3 grid grid-cols-2 gap-2 text-[13px] sm:grid-cols-4">
            <div className="rounded-xl bg-gray-50 px-3 py-2">
              <p className="text-gray-600">Previsto no P0</p>
              <p className="text-lg font-semibold tabular-nums text-gray-900">{moedaCompacta(c.previsto)}</p>
            </div>
            <div className="rounded-xl bg-gray-50 px-3 py-2">
              <p className="text-gray-600">Realizado no Senior{parcial ? " (parcial)" : ""}</p>
              <p className="text-lg font-semibold tabular-nums text-gray-900">{moedaCompacta(c.realizado)}</p>
            </div>
            <div className={`rounded-xl px-3 py-2 ${c.delta > 0.005 ? "bg-red-50" : c.delta < -0.005 ? "bg-emerald-50" : "bg-gray-50"}`}>
              <p className={corDelta(c.delta)}>{c.delta > 0.005 ? "Acima do P0" : c.delta < -0.005 ? "Abaixo do P0" : "Igual ao P0"}</p>
              <p className={`text-lg font-semibold tabular-nums ${corDelta(c.delta)}`}>
                {c.delta > 0.005 ? "+" : c.delta < -0.005 ? "−" : ""}
                {moedaCompacta(Math.abs(c.delta))} <span className="text-xs font-normal">{pctTexto(c.pct)}</span>
              </p>
            </div>
            <div className="rounded-xl bg-violet-50 px-3 py-2">
              <p className="text-violet-800">Fora do P0</p>
              <p className="text-lg font-semibold tabular-nums text-violet-800">
                {moedaCompacta(semPrevisaoValor)} <span className="text-xs font-normal">{c.contagem.sem_previsao} {c.contagem.sem_previsao === 1 ? "conta" : "contas"}</span>
              </p>
            </div>
          </div>

          {temReembolsavel && (
            <p className="mb-3 rounded-xl border border-sky-100 bg-sky-50/70 px-3 py-2 text-[13px] text-sky-900">
              {c.modoReembolsavel === "agregado" ? (
                <>
                  <b>Reembolsáveis em conta única.</b> Neste mês o Senior ainda lança o reembolsável numa conta só; por isso as contas R do P0 foram <b>somadas</b> para comparar.
                </>
              ) : (
                <>
                  <b>Reembolsáveis nas contas R.</b> Neste mês o Senior já lança nas contas R: a comparação é feita <b>linha a linha</b>. O que ainda caiu na conta antiga aparece à parte.
                </>
              )}
            </p>
          )}

          <div className="mb-3 flex flex-wrap gap-1.5">
            {abas.map(([k, nome, n]) => (
              <button key={k} type="button" onClick={() => setFiltro(k)} className={`rounded-full border px-3 py-1 text-[13px] font-medium transition ${filtro === k ? "border-brand bg-brand text-white" : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"}`}>
                {nome} <span className="opacity-70">{n}</span>
              </button>
            ))}
          </div>

          {todasLinhas.length === 0 ? (
            <p className="py-6 text-center text-sm text-gray-500">Sem previsão nem realizado neste mês com os filtros escolhidos.</p>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-gray-100">
              <table className="w-full text-[14px]">
                <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
                  <tr>
                    <th className="px-3 py-2">Tipo de custo / conta</th>
                    <th className="px-3 py-2 text-center">Situação</th>
                    <th className="px-3 py-2 text-right">Previsto (P0)</th>
                    <th className="px-3 py-2 text-right">Realizado</th>
                    <th className="px-3 py-2 text-right">Diferença</th>
                    <th className="hidden px-3 py-2 md:table-cell">Tamanho do desvio</th>
                  </tr>
                </thead>
                <tbody>
                  {c.grupos.map((g) => {
                    const linhas = g.linhas.filter(visivel);
                    if (linhas.length === 0) return null;
                    const fechado = fechados.has(g.grupoCodigo);
                    return (
                      <Fragment key={g.grupoCodigo}>
                        <tr className="cursor-pointer bg-gray-50/80" onClick={() => alternar(g.grupoCodigo)}>
                          <td className="px-3 py-2 font-semibold text-gray-800">
                            <span className="mr-2 inline-block w-3 text-xs text-gray-400">{fechado ? "▶" : "▼"}</span>
                            {g.grupoNome} <span className="text-xs font-normal text-gray-400">{linhas.length} {linhas.length === 1 ? "conta" : "contas"}</span>
                          </td>
                          <td />
                          <td className="px-3 py-2 text-right font-semibold tabular-nums text-gray-700">{g.previsto ? moeda(g.previsto) : "–"}</td>
                          <td className="px-3 py-2 text-right font-semibold tabular-nums text-gray-900">{g.realizado ? moeda(g.realizado) : "–"}</td>
                          <td className={`px-3 py-2 text-right font-semibold tabular-nums ${corDelta(g.delta)}`}>
                            {dinheiroComSinal(g.delta)} <span className="text-xs font-normal text-gray-400">{pctTexto(g.pct)}</span>
                          </td>
                          <td className="hidden md:table-cell" />
                        </tr>
                        {!fechado &&
                          linhas.map((l) => (
                            <tr key={l.chave} className="border-t border-gray-50">
                              <td className="py-1.5 pl-9 pr-3 font-medium text-gray-800">
                                {l.nome} {l.reembolsavel && !g.grupoCodigo.startsWith("reemb") && <SeloReembolsavel curto />}
                                {l.nota && <span className="mt-0.5 block text-xs font-normal text-gray-500">{l.nota}</span>}
                              </td>
                              <td className="px-3 py-1.5 text-center">
                                <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold ${SELO[l.status].c}`}>{SELO[l.status].t}</span>
                              </td>
                              <td className="px-3 py-1.5 text-right tabular-nums text-gray-600">{l.previsto ? moeda(l.previsto) : "–"}</td>
                              <td className="px-3 py-1.5 text-right tabular-nums text-gray-800">{l.realizado ? moeda(l.realizado) : "–"}</td>
                              <td className={`px-3 py-1.5 text-right font-semibold tabular-nums ${corDelta(l.delta)}`}>
                                {dinheiroComSinal(l.delta)} <span className="text-xs font-normal text-gray-400">{pctTexto(l.pct)}</span>
                              </td>
                              <td className="hidden px-3 py-1.5 md:table-cell">
                                <div className="h-2 w-40 rounded-full bg-gray-100">
                                  <div className="h-full rounded-full" style={{ width: `${Math.max(3, (Math.abs(l.delta) / maxAbs) * 100)}%`, background: l.delta > 0 ? "#e5675f" : "#0e9f94" }} />
                                </div>
                              </td>
                            </tr>
                          ))}
                      </Fragment>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="bg-gray-100 font-semibold">
                    <td className="px-3 py-2 text-gray-800">Total do mês</td>
                    <td />
                    <td className="px-3 py-2 text-right tabular-nums text-gray-700">{moeda(c.previsto)}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-gray-900">{moeda(c.realizado)}</td>
                    <td className={`px-3 py-2 text-right tabular-nums ${corDelta(c.delta)}`}>
                      {dinheiroComSinal(c.delta)} <span className="text-xs font-normal text-gray-500">{pctTexto(c.pct)}</span>
                    </td>
                    <td className="hidden md:table-cell" />
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </>
      )}
    </Cartao>
  );
}
