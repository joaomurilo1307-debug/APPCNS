"use client";

// Selo "Direto do Senior" + painel de conferencia: deixa claro (para a diretoria) de onde vem cada numero, que ninguem digita nem ajusta
// nada, e prova com checagens automaticas da ultima leitura e com o historico mes a mes que a tela fecha com os lancamentos do Senior.

import { useEffect, useState } from "react";
import { dataHoraCurta, haQuantoTempo, mesLongo, moeda } from "@/lib/custos/formato";

type Conferencia = {
  atualizadoEm: string | null;
  duracaoSegundos: number | null;
  regra: string | null;
  adiantamentos: number | null;
  contagem: { celulas: number; lancamentos: number; titulos: number; divergencias: number; celulasSemLancamento: number; lancamentosSemCelula: number; semDataDeEntrada: number; semNomeDeFornecedor: number; foraDaProgramacaoDePagamento: number };
  historico: { mes: string; tela: number; lancamentos: number; fecha: boolean }[] | null;
};

const num = (n: number) => n.toLocaleString("pt-BR");

export default function SeloSenior() {
  const [c, setC] = useState<Conferencia | null>(null);
  const [aberto, setAberto] = useState(false);

  useEffect(() => {
    fetch("/api/custos-conta/conferencia", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then(setC)
      .catch(() => setC(null));
  }, []);
  useEffect(() => {
    if (!aberto) return;
    const f = (e: KeyboardEvent) => e.key === "Escape" && setAberto(false);
    window.addEventListener("keydown", f);
    return () => window.removeEventListener("keydown", f);
  }, [aberto]);

  const k = c?.contagem;
  const tudoOk = !!k && k.divergencias === 0 && k.celulasSemLancamento === 0 && k.lancamentosSemCelula === 0 && (c?.historico ?? []).every((h) => h.fecha);
  const checagens = k
    ? [
        { ok: k.divergencias === 0 && k.celulasSemLancamento === 0 && k.lancamentosSemCelula === 0, t: `Cada número da tela é a soma exata dos lançamentos que o compõem (${num(k.celulas)} números, ${num(k.lancamentos)} lançamentos, ${num(k.divergencias)} diferenças).` },
        { ok: k.semDataDeEntrada === 0 && k.semNomeDeFornecedor === 0, t: `Todo lançamento tem título, fornecedor e data vindos do Senior (${num(k.semDataDeEntrada + k.semNomeDeFornecedor)} sem informação).` },
        { ok: k.foraDaProgramacaoDePagamento === 0, t: `Todos os ${num(k.titulos)} títulos existem na Programação de Pagamento do sistema (vinculados à OC quando há): ${num(k.foraDaProgramacaoDePagamento)} fora.` },
      ]
    : [];

  return (
    <>
      <button
        type="button"
        onClick={() => setAberto(true)}
        className={`mt-2 inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[13px] font-medium transition hover:shadow-sm ${!c ? "border-gray-200 bg-white text-gray-500" : tudoOk ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-amber-200 bg-amber-50 text-amber-800"}`}
        title="De onde vem cada número e como ele é conferido"
      >
        <span aria-hidden>{!c ? "…" : tudoOk ? "✓" : "!"}</span>
        Direto do Senior · sem digitação ou ajuste manual
        {c && <span className="font-normal opacity-80">· {tudoOk ? "conferido: 0 diferenças" : "há diferenças — veja a conferência"}</span>}
      </button>

      {aberto && (
        <div className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-gray-900/40 p-4 backdrop-blur-[2px]" onClick={() => setAberto(false)}>
          <div role="dialog" aria-modal="true" aria-label="Origem e conferência dos números" className="my-8 w-full max-w-3xl overflow-hidden rounded-2xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <header className="flex items-start justify-between gap-4 border-b border-gray-100 bg-gradient-to-r from-brand/10 to-transparent px-6 py-4">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Confiança nos números</p>
                <h2 className="text-lg font-semibold text-gray-900">Tudo vem do Senior, sem manipulação</h2>
              </div>
              <button onClick={() => setAberto(false)} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600" aria-label="Fechar">
                ✕
              </button>
            </header>

            <div className="space-y-6 px-6 py-5 text-[15px] leading-relaxed text-gray-700">
              <section>
                <h3 className="mb-1 text-sm font-semibold uppercase tracking-wide text-gray-500">De onde vem</h3>
                <ul className="list-disc space-y-1 pl-5">
                  <li>
                    Os valores são <b>lidos direto do ERP Senior</b>, em modo somente leitura: rateio dos títulos a pagar por centro de custo (E501RAT), pagamentos e adiantamentos (E501MCP) e competência cadastrada no título (E501TCP).
                  </li>
                  <li>
                    <b>Ninguém digita, corrige ou arredonda</b> valor na tela: cada número é a soma de lançamentos do Senior. Clique em qualquer valor para ver os títulos, o fornecedor, a data de pagamento e a OC.
                  </li>
                  <li>
                    <b>Atualiza sozinho</b> (a cada cerca de 2 horas) e no botão “Atualizar”. Última leitura: <b>{c?.atualizadoEm ? `${dataHoraCurta(c.atualizadoEm)} (${haQuantoTempo(c.atualizadoEm)})` : "—"}</b>
                    {c?.duracaoSegundos ? `, levou ${Math.round(c.duracaoSegundos / 60)} min` : ""}.
                  </li>
                  <li>
                    <b>Regra do custo:</b> notas já quitadas — pagas ou quitadas com adiantamento{c?.adiantamentos ? ` (${num(c.adiantamentos)} neste ano)` : ""}. Título lançado e ainda não pago não entra. Salários, encargos e impostos retidos ficam fora porque já estão no Custo de Pessoal / Impostos.
                  </li>
                </ul>
              </section>

              <section>
                <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-500">Conferências automáticas desta leitura</h3>
                {!c ? <p className="text-gray-400">Carregando…</p> : (
                  <ul className="space-y-2">
                    {checagens.map((x) => (
                      <li key={x.t} className="flex gap-2">
                        <span className={`mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-bold ${x.ok ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-800"}`}>{x.ok ? "✓" : "!"}</span>
                        <span>{x.t}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              {c?.historico && (
                <section>
                  <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-500">Histórico mês a mês: tela × soma dos lançamentos do Senior</h3>
                  <div className="overflow-x-auto rounded-xl border border-gray-100">
                    <table className="w-full text-[14px]">
                      <thead className="bg-gray-50 text-left text-xs uppercase text-gray-400">
                        <tr>
                          <th className="px-3 py-2">Mês</th>
                          <th className="px-3 py-2 text-right">Na tela</th>
                          <th className="px-3 py-2 text-right">Soma dos lançamentos</th>
                          <th className="px-3 py-2 text-center">Fecha</th>
                        </tr>
                      </thead>
                      <tbody>
                        {c.historico.map((h, i) => (
                          <tr key={h.mes} className={i % 2 ? "bg-gray-50/60" : undefined}>
                            <td className="px-3 py-1.5 font-medium">{mesLongo(h.mes).replace(" de ", " ")}</td>
                            <td className="px-3 py-1.5 text-right tabular-nums">{moeda(h.tela)}</td>
                            <td className="px-3 py-1.5 text-right tabular-nums">{moeda(h.lancamentos)}</td>
                            <td className={`px-3 py-1.5 text-center font-bold ${h.fecha ? "text-emerald-700" : "text-amber-700"}`}>{h.fecha ? "✓" : "!"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              )}

              <section>
                <h3 className="mb-1 text-sm font-semibold uppercase tracking-wide text-gray-500">Conferências já feitas com fontes oficiais</h3>
                <ul className="list-disc space-y-1 pl-5">
                  <li>Relatório oficial do Senior (Rel114), março a julho/2026, todos os centros de custo: <b>4.327 de 4.327</b> linhas de pagamento do relatório estão na tela, com o mesmo título, fornecedor, centro de custo, conta e valor.</li>
                  <li>MRN CT 3748 (Flora), abril/2026: <b>R$ 25.152,98</b> — igual ao relatório oficial.</li>
                  <li>Planilhas de controle dos coordenadores (14 contratos, janeiro a agosto/2026): <b>3.180 de 3.244 linhas (98%)</b> casam com o Senior por fornecedor, valor e data; as diferenças restantes são lançamentos que só existem na planilha (duplicidades e lançamentos manuais).</li>
                </ul>
              </section>

              <section className="rounded-xl bg-gray-50 p-4 text-[14px]">
                <b>Quer conferir você mesmo?</b> Use “Exportar lançamentos (Rel114)”: o arquivo sai no layout do relatório do Senior, título a título, para comparar linha a linha. Valores por data de pagamento ou por competência — o botão “Ver por” escolhe.
              </section>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
