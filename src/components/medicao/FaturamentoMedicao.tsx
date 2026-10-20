"use client";

// Receita x Faturamento de um centro de custo do contrato, mes a mes. Receita = pedidos de medicao + notas de debito (a ND que ainda nao e' um pedido);
// Faturado = notas fiscais + notas de debito emitidas. Tudo do Senior, somente leitura. A diferenca e o saldo a faturar mostram onde falta nota (ou sobra).
// Cada pedido mostra a nota a que pertence e como o vinculo foi feito (pelo Senior, pelo mesmo valor, pela soma ou pelo pedido dividido).

import { useEffect, useMemo, useState } from "react";
import type { Conciliacao, DocResultado, PedidoConc, Vinculo } from "@/lib/medicao/conciliacao";
import { mesCurto, mesLongo, moeda, moedaCompacta } from "@/lib/custos/formato";

type Resposta = {
  ccu: string | null; ccuNome?: string; ccus: { codccu: string; nome: string; principal: boolean }[];
  conciliacao: Conciliacao | null;
  outrosContratos: { numCtr: string; numOfi: string; valor: number }[];
  atualizadoEm: string | null; faturamentoErro: string | null; semFaturamento: boolean;
};

const rotuloDoc = (tipo: string, numero: string) => (tipo === "ND" && /^ND/i.test(numero) ? numero : `${tipo} ${numero}`);
const dataBr = (iso: string) => iso.slice(0, 10).split("-").reverse().join("/");
const vc = (v: number) => moedaCompacta(v).replace("R$ ", "");
const COMO: Record<Vinculo, { rotulo: string; dica: string; cor: string }> = {
  NOTA: { rotulo: "vínculo do Senior", dica: "O Senior liga a nota a este pedido (item da nota com o número do pedido).", cor: "bg-emerald-100 text-emerald-800" },
  VALOR: { rotulo: "mesmo valor", dica: "Sem vínculo no Senior: nota e pedido do mesmo centro de custo com o mesmo valor, ao centavo.", cor: "bg-teal-100 text-teal-800" },
  SOMA: { rotulo: "soma", dica: "O valor da nota é a soma de dois ou mais pedidos (ou o pedido é a soma de duas notas), ao centavo.", cor: "bg-sky-100 text-sky-800" },
  PEDIDO_DIVIDIDO: { rotulo: "pedido dividido", dica: "A nota tem o valor do pedido inteiro, mas o pedido está rateado entre centros de custo no Senior.", cor: "bg-amber-100 text-amber-800" },
};

function Chip({ children, cls, title }: { children: React.ReactNode; cls: string; title?: string }) {
  return <span title={title} className={`rounded-full px-1.5 py-0.5 text-[10.5px] font-semibold ${cls}`}>{children}</span>;
}

export default function FaturamentoMedicao({ numCtr, de, ate }: { numCtr: string; de: string; ate: string }) {
  const [dados, setDados] = useState<Resposta | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [ccu, setCcu] = useState<string | null>(null);
  const [mes, setMes] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    const p = new URLSearchParams({ de, ate });
    if (ccu) p.set("ccu", ccu);
    fetch(`/api/medicao/${encodeURIComponent(numCtr)}/faturamento?${p}`, { cache: "no-store" })
      .then(async (r) => { const j = await r.json().catch(() => ({})); if (!vivo) return; if (!r.ok) throw new Error(j.error || "Não foi possível carregar o faturamento."); setDados(j); setErro(null); })
      .catch((e) => { if (vivo) setErro(e.message); });
    return () => { vivo = false; };
  }, [numCtr, de, ate, ccu]);

  const c = dados?.conciliacao ?? null;
  const pedidos = useMemo(() => (c ? c.pedidos.filter((p) => !mes || p.competencia === mes) : []), [c, mes]);
  const docs = useMemo(() => (c ? c.docs.filter((d) => !mes || d.competencia === mes) : []), [c, mes]);

  if (erro && !dados) return <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{erro}</div>;
  if (!dados) return <div className="h-64 animate-pulse rounded-2xl bg-gray-200/70" aria-busy />;
  if (!c || !dados.ccu) return <section className="rounded-2xl border border-gray-100 bg-white p-5 text-sm text-gray-500 shadow-soft">Este contrato ainda não tem centro de custo identificado nos pedidos; sem ele não dá para ligar o faturamento.</section>;

  const semNota = pedidos.filter((p) => p.documentos.length === 0 && p.valor > 0.05 && p.competencia !== "0000-00").length;
  const semPedido = docs.filter((d) => !d.vinculo && d.tipo === "NF" && d.competencia !== "0000-00" && (!c.inicio || d.competencia >= c.inicio)).length;
  const th = "border-b border-gray-200 bg-gray-50 px-2.5 py-2 text-[11px] font-semibold uppercase tracking-wide text-gray-500";
  const thR = `${th} text-right`;
  const dif = c.totais.receita - c.totais.faturado;
  const nomeCc = (cod: string) => dados.ccus.find((x) => x.codccu === cod)?.nome ?? `CC ${cod}`;
  const situacaoMes = (m: Conciliacao["meses"][number]) => {
    if (Math.abs(m.dif) < 0.05) return m.receita > 0 || m.faturado > 0 ? <Chip cls="bg-emerald-100 text-emerald-800" title="Receita e faturamento fecham ao centavo">fecha</Chip> : <span className="text-gray-300">·</span>;
    return m.dif > 0 ? <Chip cls="bg-amber-100 text-amber-800" title="Há receita (pedidos + ND) sem nota emitida neste mês">a faturar</Chip> : <Chip cls="bg-rose-100 text-rose-800" title="Foram emitidas notas acima da receita deste mês">nota a mais</Chip>;
  };

  return (
    <section className="space-y-4 rounded-2xl border border-gray-100 bg-white p-5 shadow-soft" aria-label="Receita e faturamento">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-[15px] font-semibold text-gray-900">Receita × faturamento do Senior</h2>
          <p className="mt-0.5 max-w-3xl text-[13px] leading-relaxed text-gray-500">
            <b>Receita</b> é o pedido de medição mais a nota de débito que não é um pedido; <b>faturado</b> é o que foi emitido em nota fiscal e nota de débito. Cada pedido aparece ligado à sua nota. Tudo vem do Senior, sem ajuste manual.
          </p>
        </div>
        {dados.ccus.length > 1 && (
          <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Centro de custo">
            {dados.ccus.map((x) => (
              <button key={x.codccu} type="button" onClick={() => { setCcu(x.codccu); setMes(null); }} aria-pressed={dados.ccu === x.codccu} title={x.nome}
                className={`rounded-lg border px-2.5 py-1 text-[12px] font-medium ${dados.ccu === x.codccu ? "border-teal-600 bg-teal-50 text-teal-800" : "border-gray-200 text-gray-600 hover:bg-gray-50"}`}>CC {x.codccu}{x.principal ? " · principal" : ""}</button>
            ))}
          </div>
        )}
      </header>

      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="rounded-md bg-gray-100 px-2 py-1 font-medium text-gray-700">CC {dados.ccu} · {dados.ccuNome}</span>
        {c.inicio && <span className="rounded-md bg-gray-100 px-2 py-1 text-gray-600">Medido no Senior desde {mesLongo(c.inicio)}</span>}
        {dados.outrosContratos.length > 0 && <span className="rounded-md bg-amber-50 px-2 py-1 text-amber-900" title={dados.outrosContratos.map((o) => `${o.numOfi}: ${moeda(o.valor)}`).join("\n")}>O faturamento é do centro de custo: este CC também tem pedidos de {dados.outrosContratos.map((o) => o.numOfi).join(", ")}</span>}
      </div>

      {(dados.faturamentoErro || dados.semFaturamento) && (
        <p className="rounded-xl border border-amber-200 bg-amber-50/70 px-4 py-2.5 text-[13px] text-amber-950">
          {dados.semFaturamento ? "As notas ainda não foram lidas do Senior; a leitura acontece na próxima atualização da medição." : `A última leitura das notas falhou (${dados.faturamentoErro}); o faturamento mostrado é o da leitura anterior.`}
        </p>
      )}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { t: "Receita no período", v: moeda(c.totais.receita), s: `pedidos ${vc(c.totais.medido)} + ND avulsa ${vc(c.totais.ndAvulsa)}` },
          { t: "Faturado no período", v: moeda(c.totais.faturado), s: "notas fiscais + notas de débito" },
          { t: "Diferença no período", v: moeda(dif), s: Math.abs(dif) < 0.05 ? "receita e faturamento fecham" : dif > 0 ? "receita acima do faturado" : "faturado acima da receita", alerta: Math.abs(dif) >= 0.05 },
          { t: "Saldo a faturar no período", v: moeda(c.totais.saldoAcum), s: c.inicio ? `desde o início da medição no Senior (${mesCurto(c.inicio)}): ${moeda(c.totais.saldoDesdeInicio).replace(/\s/g, " ")}` : "sem medição no Senior", alerta: Math.abs(c.totais.saldoAcum) >= 0.05 },
        ].map((k) => (
          <div key={k.t} className="rounded-xl border border-gray-100 bg-white p-3.5">
            <p className="text-[12.5px] font-medium text-gray-500">{k.t}</p>
            <p className={`mt-0.5 text-lg font-semibold tabular-nums ${k.alerta ? "text-amber-700" : "text-gray-900"}`}>{k.v}</p>
            <p className="text-[11.5px] text-gray-400">{k.s}</p>
          </div>
        ))}
      </div>

      {/* ---------------- mes a mes */}
      <div className="overflow-x-auto rounded-xl border border-gray-100">
        <table className="w-full min-w-[860px] border-separate border-spacing-0 text-[12.5px] tabular-nums">
          <thead>
            <tr>
              <th className={`${th} text-left`}>Mês</th>
              <th className={thR}>Pedidos</th>
              <th className={thR} title="Nota de débito que não é um pedido: soma por cima dos pedidos">+ ND avulsa</th>
              <th className={`${thR} text-gray-900`}>= Receita</th>
              <th className={thR}>Notas fiscais</th>
              <th className={thR}>Notas de débito</th>
              <th className={`${thR} text-gray-900`}>= Faturado</th>
              <th className={`${thR} text-gray-900`}>Diferença</th>
              <th className={thR} title="Receita menos faturado, somado a partir do início do período escolhido (positivo = receita que ainda não virou nota)">Saldo a faturar</th>
              <th className={`${th} text-center`}>Situação</th>
            </tr>
          </thead>
          <tbody>
            {c.antes.receita > 0 || c.antes.faturado > 0 ? (
              <tr className="text-gray-500">
                <td className="border-b border-gray-100 px-2.5 py-1.5 text-left">Antes do período</td>
                <td className="border-b border-gray-100 px-2.5 py-1.5 text-right">{vc(c.antes.medido)}</td>
                <td className="border-b border-gray-100 px-2.5 py-1.5 text-right">{vc(c.antes.receita - c.antes.medido)}</td>
                <td className="border-b border-gray-100 px-2.5 py-1.5 text-right">{vc(c.antes.receita)}</td>
                <td colSpan={2} className="border-b border-gray-100 px-2.5 py-1.5" />
                <td className="border-b border-gray-100 px-2.5 py-1.5 text-right">{vc(c.antes.faturado)}</td>
                <td className="border-b border-gray-100 px-2.5 py-1.5 text-right">{vc(c.antes.receita - c.antes.faturado)}</td>
                <td className="border-b border-gray-100 px-2.5 py-1.5 text-right" title="Saldo acumulado dos meses anteriores ao período (fora do saldo do período)">({vc(c.antes.saldoAcum)})</td>
                <td className="border-b border-gray-100" />
              </tr>
            ) : null}
            {c.meses.map((m) => (
              <tr key={m.mes} onClick={() => setMes(mes === m.mes ? null : m.mes)} className={`cursor-pointer hover:bg-gray-50 ${mes === m.mes ? "bg-teal-50/60" : ""}`}>
                <td className="border-b border-gray-100 px-2.5 py-1.5 text-left font-medium text-gray-800">{mesCurto(m.mes)} <span className="text-[11px] font-normal text-gray-400">{m.pedidos} ped. · {m.docs} doc.</span></td>
                <td className="border-b border-gray-100 px-2.5 py-1.5 text-right text-gray-700">{m.medido ? vc(m.medido) : <span className="text-gray-300">·</span>}</td>
                <td className="border-b border-gray-100 px-2.5 py-1.5 text-right text-gray-700">{m.ndAvulsa ? vc(m.ndAvulsa) : <span className="text-gray-300">·</span>}</td>
                <td className="border-b border-gray-100 px-2.5 py-1.5 text-right font-semibold text-gray-900">{m.receita ? vc(m.receita) : <span className="font-normal text-gray-300">·</span>}</td>
                <td className="border-b border-gray-100 px-2.5 py-1.5 text-right text-gray-700">{m.nf ? vc(m.nf) : <span className="text-gray-300">·</span>}</td>
                <td className="border-b border-gray-100 px-2.5 py-1.5 text-right text-gray-700">{m.nd ? vc(m.nd) : <span className="text-gray-300">·</span>}</td>
                <td className="border-b border-gray-100 px-2.5 py-1.5 text-right font-semibold text-gray-900">{m.faturado ? vc(m.faturado) : <span className="font-normal text-gray-300">·</span>}</td>
                <td className={`border-b border-gray-100 px-2.5 py-1.5 text-right font-semibold ${Math.abs(m.dif) < 0.05 ? "text-gray-400" : m.dif > 0 ? "text-amber-700" : "text-rose-700"}`}>{Math.abs(m.dif) < 0.05 ? "0" : vc(m.dif)}</td>
                <td className={`border-b border-gray-100 px-2.5 py-1.5 text-right ${Math.abs(m.saldoAcum) < 0.05 ? "text-gray-400" : "text-gray-800"}`}>{Math.abs(m.saldoAcum) < 0.05 ? "0" : vc(m.saldoAcum)}</td>
                <td className="border-b border-gray-100 px-2.5 py-1.5 text-center">{situacaoMes(m)}</td>
              </tr>
            ))}
            <tr className="font-semibold">
              <td className="border-t-2 border-gray-200 bg-gray-50 px-2.5 py-2 text-left">Total do período</td>
              <td className="border-t-2 border-gray-200 bg-gray-50 px-2.5 py-2 text-right">{vc(c.totais.medido)}</td>
              <td className="border-t-2 border-gray-200 bg-gray-50 px-2.5 py-2 text-right">{vc(c.totais.ndAvulsa)}</td>
              <td className="border-t-2 border-gray-200 bg-gray-50 px-2.5 py-2 text-right">{vc(c.totais.receita)}</td>
              <td className="border-t-2 border-gray-200 bg-gray-50 px-2.5 py-2 text-right">{vc(c.meses.reduce((s, m) => s + m.nf, 0))}</td>
              <td className="border-t-2 border-gray-200 bg-gray-50 px-2.5 py-2 text-right">{vc(c.meses.reduce((s, m) => s + m.nd, 0))}</td>
              <td className="border-t-2 border-gray-200 bg-gray-50 px-2.5 py-2 text-right">{vc(c.totais.faturado)}</td>
              <td className="border-t-2 border-gray-200 bg-gray-50 px-2.5 py-2 text-right">{vc(dif)}</td>
              <td className="border-t-2 border-gray-200 bg-gray-50 px-2.5 py-2 text-right">{vc(c.totais.saldoAcum)}</td>
              <td className="border-t-2 border-gray-200 bg-gray-50" />
            </tr>
          </tbody>
        </table>
      </div>
      <p className="text-xs text-gray-400">Clique num mês para ver só os pedidos e as notas dele.{mes ? <> Mostrando <b>{mesLongo(mes)}</b>. <button type="button" onClick={() => setMes(null)} className="font-medium text-brand underline">Ver o período todo</button></> : ""}</p>

      {(c.acumulados.medido > 0 || c.notasAntesDoInicio.qtd > 0) && (
        <p className="rounded-xl bg-violet-50/70 px-4 py-2.5 text-[13px] leading-relaxed text-violet-950">
          Fora dos meses e do saldo: {c.acumulados.medido > 0 && <>cargas acumuladas de medição (“ACUMULADOS”, “BM01 A BM32”) somando <b>{moeda(c.acumulados.medido)}</b>; </>}
          {c.notasAntesDoInicio.qtd > 0 && <><b>{c.notasAntesDoInicio.qtd}</b> nota(s) ({moeda(c.notasAntesDoInicio.valor)}) de meses anteriores ao início da medição no Senior.</>}
        </p>
      )}

      {/* ---------------- pedidos e a nota de cada um */}
      <div>
        <h3 className="mb-2 text-sm font-semibold text-gray-900">Pedidos de medição e a nota de cada um <span className="font-normal text-gray-400">· {pedidos.length} pedido(s){semNota > 0 ? `, ${semNota} sem nota` : ""}</span></h3>
        <div className="max-h-[420px] overflow-auto rounded-xl border border-gray-100">
          <table className="w-full min-w-[820px] border-separate border-spacing-0 text-[12.5px]">
            <thead className="sticky top-0 z-10"><tr>
              <th className={`${th} text-left`}>Pedido</th><th className={`${th} text-left`}>Mês</th><th className={`${th} text-left`}>Boletim</th><th className={`${th} text-left`}>Situação</th><th className={thR}>Itens</th><th className={thR}>Valor</th><th className={`${th} text-left`}>Nota</th><th className={`${th} text-left`}>Observação</th>
            </tr></thead>
            <tbody>
              {pedidos.map((p: PedidoConc) => (
                <tr key={p.numPed} className="align-top">
                  <td className="whitespace-nowrap border-b border-gray-100 px-2.5 py-1.5 font-medium text-gray-800">{p.numPed}</td>
                  <td className="whitespace-nowrap border-b border-gray-100 px-2.5 py-1.5 text-gray-700">{p.competencia === "0000-00" ? <Chip cls="bg-violet-100 text-violet-800" title="Carga que junta vários boletins: não é de um mês">acumulado</Chip> : mesCurto(p.competencia)}</td>
                  <td className="whitespace-nowrap border-b border-gray-100 px-2.5 py-1.5 text-gray-600">{p.boletins.join(", ") || "—"}</td>
                  <td className="whitespace-nowrap border-b border-gray-100 px-2.5 py-1.5 text-gray-600">{p.situacoes.join(", ").toLowerCase() || "—"}</td>
                  <td className="border-b border-gray-100 px-2.5 py-1.5 text-right tabular-nums text-gray-500">{p.itens}</td>
                  <td className="whitespace-nowrap border-b border-gray-100 px-2.5 py-1.5 text-right font-medium tabular-nums text-gray-900">{moeda(p.valor)}</td>
                  <td className="border-b border-gray-100 px-2.5 py-1.5 text-gray-800">
                    {p.documentos.length ? p.documentos.map((d) => (
                      <div key={d.chave} className="whitespace-nowrap">{rotuloDoc(d.tipo, d.numero)} <span className="tabular-nums text-gray-500">{moeda(d.valor)}</span> <Chip cls={COMO[d.como].cor} title={COMO[d.como].dica}>{COMO[d.como].rotulo}</Chip></div>
                    )) : p.competencia === "0000-00" ? <span className="text-gray-400">carga fora dos meses</span> : <Chip cls="bg-amber-100 text-amber-800" title="Nenhuma nota deste centro de custo corresponde a este pedido">sem nota</Chip>}
                  </td>
                  <td className="border-b border-gray-100 px-2.5 py-1.5 text-[12px] leading-snug text-gray-600">
                    {p.divisao && <div>Pedido dividido: {p.divisao.map((x) => `CC ${x.codccu} ${moeda(x.valor)}`).join(" + ")}</div>}
                    {p.possivelOutroCc && <div className="text-amber-800">Existe {rotuloDoc(p.possivelOutroCc.tipo, p.possivelOutroCc.numero)} de {moeda(p.possivelOutroCc.valor)} no CC {p.possivelOutroCc.codccu} ({nomeCc(p.possivelOutroCc.codccu)}): confira o rateio no Senior.</div>}
                  </td>
                </tr>
              ))}
              {pedidos.length === 0 && <tr><td colSpan={8} className="px-3 py-8 text-center text-gray-400">Nenhum pedido neste período.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {/* ---------------- notas */}
      <div>
        <h3 className="mb-2 text-sm font-semibold text-gray-900">Notas fiscais e notas de débito <span className="font-normal text-gray-400">· {docs.length} documento(s){semPedido > 0 ? `, ${semPedido} sem pedido` : ""}</span></h3>
        <div className="max-h-[420px] overflow-auto rounded-xl border border-gray-100">
          <table className="w-full min-w-[820px] border-separate border-spacing-0 text-[12.5px]">
            <thead className="sticky top-0 z-10"><tr>
              <th className={`${th} text-left`}>Documento</th><th className={`${th} text-left`}>Emissão</th><th className={`${th} text-left`}>Mês da medição</th><th className={thR}>Valor</th><th className={`${th} text-left`}>Pedidos</th><th className={`${th} text-left`}>Observação</th>
            </tr></thead>
            <tbody>
              {docs.map((d: DocResultado) => (
                <tr key={d.chave} className="align-top">
                  <td className="whitespace-nowrap border-b border-gray-100 px-2.5 py-1.5 font-medium text-gray-800">{rotuloDoc(d.tipo, d.numero)}{d.tipo === "NF" && d.filial !== "1" ? <span className="ml-1 text-[11px] font-normal text-gray-400">filial {d.filial}</span> : null}</td>
                  <td className="whitespace-nowrap border-b border-gray-100 px-2.5 py-1.5 text-gray-600">{dataBr(d.dataEmissao)}</td>
                  <td className="whitespace-nowrap border-b border-gray-100 px-2.5 py-1.5 text-gray-700">{d.competencia === "0000-00" ? <Chip cls="bg-violet-100 text-violet-800">acumulado</Chip> : mesCurto(d.competencia)}
                    {d.competenciaOriginal !== d.competencia && <span className="ml-1 text-[11px] text-gray-400" title="Mês pela data de emissão; a nota foi levada ao mês do pedido a que corresponde">(emitida p/ {d.competenciaOriginal === "0000-00" ? "—" : mesCurto(d.competenciaOriginal)})</span>}
                    {d.origem === "EMISSAO" && d.competenciaOriginal === d.competencia && <Chip cls="ml-1 bg-gray-100 text-gray-600" title="Sem pedido ligado: mês da emissão menos 1 (regra do Rito)">emissão</Chip>}
                  </td>
                  <td className="whitespace-nowrap border-b border-gray-100 px-2.5 py-1.5 text-right font-medium tabular-nums text-gray-900">{moeda(d.valor)}{d.valor !== d.valorDoc && <div className="text-[11px] font-normal text-gray-400">de {moeda(d.valorDoc)}</div>}</td>
                  <td className="border-b border-gray-100 px-2.5 py-1.5 text-gray-700">
                    {d.vinculo ? <><span className="mr-1">{d.pedidosLigados.join(", ")}</span><Chip cls={COMO[d.vinculo].cor} title={COMO[d.vinculo].dica}>{COMO[d.vinculo].rotulo}</Chip></>
                      : d.tipo === "ND" && d.competencia !== "0000-00" ? <Chip cls="bg-violet-100 text-violet-800" title="Nota de débito que não é um pedido: soma por cima dos pedidos na receita">ND avulsa</Chip>
                        : d.competencia === "0000-00" ? <span className="text-gray-400">—</span> : <Chip cls="bg-amber-100 text-amber-800" title="Nenhum pedido deste centro de custo corresponde a esta nota">sem pedido</Chip>}
                  </td>
                  <td className="border-b border-gray-100 px-2.5 py-1.5 text-[12px] text-gray-500">{d.situacao ? d.situacao.toLowerCase() : ""}</td>
                </tr>
              ))}
              {docs.length === 0 && <tr><td colSpan={6} className="px-3 py-8 text-center text-gray-400">Nenhuma nota neste período.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
