"use client";

// Composicao da RECEITA do contrato, mes a mes: medicao faturada em nota fiscal + notas de debito (reembolsaveis), bruta e liquida, conferida com as linhas
// dos pedidos. O mes e' o do trabalho (a medicao e' enviada ate o dia 3 do mes seguinte, a nota sai depois e vence 30 dias apos a emissao).
// Tudo do Senior, somente leitura. A conferencia pedido a pedido com as notas fica recolhida (para o financeiro); a tela principal e' a dos diretores.

import { useEffect, useMemo, useState } from "react";
import type { Conciliacao, MesConc, Vinculo } from "@/lib/medicao/conciliacao";
import { origemNoSenior } from "@/lib/medicao/origem";
import { mesCurto, mesLongo, moeda, moedaCompacta } from "@/lib/custos/formato";

type Resposta = {
  ccu: string | null; ccuNome?: string; conciliacao: Conciliacao | null; contratos: string[];
  atualizadoEm: string | null; faturamentoErro: string | null; semFaturamento: boolean;
};

const vc = (v: number) => moedaCompacta(v).replace("R$ ", "");
const dataBr = (iso: string) => iso.slice(0, 10).split("-").reverse().join("/");
const rotuloDoc = (tipo: string, numero: string) => (tipo === "ND" && /^ND/i.test(numero) ? numero : `${tipo === "NF" ? "NF" : "ND"} ${numero}`);
const COMO: Record<Vinculo, string> = { NOTA: "ligada pelo Senior", VALOR: "mesmo valor", SOMA: "soma de pedidos", APROX: "valor quase igual" };
const hojeIso = () => new Date().toLocaleDateString("sv-SE");
const chip = "rounded-full px-2 py-0.5 text-[10.5px] font-semibold whitespace-nowrap";

/**
 * Recebimento de UMA nota (titulo a receber no Senior). Valor LIQUIDO (depois das retencoes). E' so' informacao: o pagamento nunca entra na receita; a nota conta no mes do
 * trabalho mesmo que seja paga em outro mes.
 */
function ChipNota({ d, duplicada }: { d: { valorAberto?: number | null; vencimento?: string | null; dataPagamento?: string | null }; duplicada?: boolean }) {
  if (duplicada) return <span className="text-gray-300">·</span>;
  if (d.valorAberto == null) return <span className={`${chip} bg-gray-100 text-gray-600`} title="Esta nota não tem título a receber no Senior">sem título no Senior</span>;
  if (d.valorAberto <= 0.05) return <span className={`${chip} bg-emerald-100 text-emerald-800`} title="Título liquidado no Senior">{d.dataPagamento ? `pago em ${dataBr(d.dataPagamento)}` : "pago"}</span>;
  const atraso = !!d.vencimento && d.vencimento < hojeIso();
  const venc = d.vencimento ? dataBr(d.vencimento) : "sem vencimento";
  return atraso
    ? <span className={`${chip} bg-rose-100 text-rose-800`} title={`Falta o pagamento da nota: ${moeda(d.valorAberto)} (líquido, depois das retenções). Venceu em ${venc}.`}>falta pagamento · venceu {venc} · {vc(d.valorAberto)}</span>
    : <span className={`${chip} bg-amber-100 text-amber-800`} title={`Falta o pagamento da nota: ${moeda(d.valorAberto)} (líquido, depois das retenções). Vence em ${venc}.`}>falta pagamento · vence {venc} · {vc(d.valorAberto)}</span>;
}

/** Barras empilhadas por mes: medicao faturada em NF (verde-azulado) e notas de debito (violeta). Um eixo, valores brutos. */
function BarrasReceita({ meses, selecionado, onSelecionar }: { meses: MesConc[]; selecionado: string | null; onSelecionar: (m: string) => void }) {
  const n = Math.max(1, meses.length);
  const largura = Math.max(560, n * 58), alt = 210, topo = 24, base = 30;
  const passo = largura / n;
  const max = Math.max(1e-9, ...meses.map((m) => m.receita));
  const barra = Math.min(36, passo * 0.62);
  const h = (v: number) => ((alt - topo - base) * v) / max;
  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${largura} ${alt}`} style={{ minWidth: Math.min(largura, 560), width: "100%", height: "auto" }} role="img" aria-label="Receita bruta por mês: medição em nota fiscal e notas de débito">
        {[0.5, 1].map((f) => <line key={f} x1={0} x2={largura} y1={alt - base - (alt - topo - base) * f} y2={alt - base - (alt - topo - base) * f} className="stroke-gray-100" strokeDasharray="3 4" />)}
        <line x1={0} x2={largura} y1={alt - base} y2={alt - base} className="stroke-gray-200" />
        {meses.map((m, i) => {
          const cx = passo * i + passo / 2, hNf = h(m.nf), hNd = h(m.nd), hSn = h(m.semNota), ativo = selecionado === m.mes;
          return (
            <g key={m.mes} className="cursor-pointer" role="button" tabIndex={0} aria-label={`${mesLongo(m.mes)}: receita bruta ${moeda(m.receita)}`} onClick={() => onSelecionar(m.mes)} onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onSelecionar(m.mes)}>
              <title>{`${mesLongo(m.mes)}\nMedição (nota fiscal): ${moeda(m.nf)}\nNotas de débito: ${moeda(m.nd)}\nMedido sem nota: ${moeda(m.semNota)}\nReceita bruta: ${moeda(m.receita)}`}</title>
              <rect x={cx - passo / 2 + 2} y={topo - 12} width={passo - 4} height={alt - topo - base + 12 + 24} rx={8} className={ativo ? "fill-teal-500/10" : "fill-transparent hover:fill-gray-100/70"} />
              {m.nf > 0 && <rect x={cx - barra / 2} y={alt - base - hNf} width={barra} height={Math.max(1.5, hNf)} rx={m.nd > 0 ? 0 : 3} className="fill-teal-600" />}
              {m.nd > 0 && <rect x={cx - barra / 2} y={alt - base - hNf - hNd} width={barra} height={Math.max(1.5, hNd)} rx={m.semNota > 0 ? 0 : 3} className="fill-violet-500" />}
              {m.semNota > 0 && <rect x={cx - barra / 2} y={alt - base - hNf - hNd - hSn} width={barra} height={Math.max(1.5, hSn)} rx={3} className="fill-amber-400" />}
              {m.receita > 0 && <text x={cx} y={alt - base - hNf - hNd - hSn - 5} textAnchor="middle" fontSize={10.5} className="fill-gray-700 font-medium">{vc(m.receita)}</text>}
              <text x={cx} y={alt - base + 15} textAnchor="middle" fontSize={11} className={ativo ? "fill-gray-900 font-semibold" : "fill-gray-500"}>{mesCurto(m.mes)}</text>
            </g>
          );
        })}
      </svg>
      <div className="mt-1 flex flex-wrap items-center gap-4 text-xs text-gray-500">
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-teal-600" /> Medição (nota fiscal)</span>
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-violet-500" /> Notas de débito (reembolsáveis)</span>
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-amber-400" /> Medido ainda sem nota</span>
      </div>
    </div>
  );
}

export default function ReceitaContrato({ numCtr, de, ate }: { numCtr: string; de: string; ate: string }) {
  const [dados, setDados] = useState<Resposta | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [mes, setMes] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    fetch(`/api/medicao/${encodeURIComponent(numCtr)}/faturamento?${new URLSearchParams({ de, ate })}`, { cache: "no-store" })
      .then(async (r) => { const j = await r.json().catch(() => ({})); if (!vivo) return; if (!r.ok) throw new Error(j.error || "Não foi possível carregar a receita."); setDados(j); setErro(null); })
      .catch((e) => { if (vivo) setErro(e.message); });
    return () => { vivo = false; };
  }, [numCtr, de, ate]);

  const c = dados?.conciliacao ?? null;
  const pedidosMes = useMemo(() => (c ? c.pedidos.filter((p) => p.competencia === mes) : []), [c, mes]);
  const docsMes = useMemo(() => (c ? c.docs.filter((d) => d.competencia === mes) : []), [c, mes]);
  const notaAcimaNoMes = !!c && !!mes && (c.meses.find((x) => x.mes === mes)?.dif ?? 0) < -0.05; // mes em que a nota passou do pedido: pedido sem nota ligada nao quer dizer "nota nao entrada"
  const origem = useMemo(() => (c && mes ? origemNoSenior(c, mes) : null), [c, mes]); // fatos do Senior quando o mes nao fecha (nota sem pedido lancado, pedido sem nota)

  if (erro && !dados) return <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{erro}</div>;
  if (!dados) return <div className="h-72 animate-pulse rounded-2xl bg-gray-200/70" aria-busy />;
  if (!c) return <section className="rounded-2xl border border-gray-100 bg-white p-5 text-sm text-gray-500 shadow-soft">Este contrato ainda não tem pedido de medição no Senior; a receita aparece quando houver.</section>;

  const th = "border-b border-gray-200 bg-gray-50 px-2.5 py-2 text-[11px] font-semibold uppercase tracking-wide text-gray-500";
  const td = "border-b border-gray-100 px-2.5 py-1.5";
  const t = c.totais;
  const conferencia = (m: MesConc) => {
    if (!m.medido && !m.faturado) return <span className="text-gray-300">·</span>;
    if (Math.abs(m.dif) < 0.05) return <span className={`${chip} bg-emerald-100 text-emerald-800`} title={m.ndAvulsa > 0 ? `As linhas dos pedidos (${moeda(m.medido)}) mais a nota de débito sem pedido (${moeda(m.ndAvulsa)}) estão todas em nota` : "Tudo que foi medido no mês está em nota"}>nota entrada</span>;
    return m.dif > 0
      ? <span className={`${chip} bg-amber-100 text-amber-800`} title={`Pedido feito em ${mesLongo(m.mes)}: ${moeda(m.semNota)} ainda sem nota no Senior. Esse valor conta na receita.`}>pedido feito, nota não entrada {vc(m.semNota)}</span>
      : <span className={`${chip} bg-slate-100 text-slate-700`} title={`Notas emitidas: ${moeda(m.faturado)}. Linhas medidas no Senior: ${moeda(m.receita)}. A nota conta na receita; o pedido segue como está no Senior.`}>nota entrada, pedido não lançado {vc(-m.dif)}</span>;
  };
  const recebimento = (m: MesConc) => {
    const r = m.recebimento;
    if (!r || r.notas === 0) return <span className="text-gray-300">·</span>;
    if (r.abertas === 0 && r.semTitulo === 0) return <span className={`${chip} bg-emerald-100 text-emerald-800`} title={`Todas as notas do mês estão pagas${r.ultimoPagamento ? ` (último pagamento em ${dataBr(r.ultimoPagamento)})` : ""}. O pagamento não entra na receita.`}>recebido</span>;
    if (r.abertas === 0) return <span className={`${chip} bg-gray-100 text-gray-600`} title="As notas do mês não têm título a receber no Senior">sem título no Senior</span>;
    const parte = `${r.pagas} de ${r.notas} nota(s) paga(s). Falta ${moeda(r.valorAberto)} (líquido, depois das retenções).`;
    return r.atrasadas > 0
      ? <span className={`${chip} bg-rose-100 text-rose-800`} title={`${parte} ${moeda(r.valorAtrasado)} já venceu.`}>falta pagamento · em atraso {vc(r.valorAtrasado)}</span>
      : <span className={`${chip} bg-amber-100 text-amber-800`} title={`${parte} Próximo vencimento: ${r.vencimento ? dataBr(r.vencimento) : "—"}.`}>falta pagamento · {vc(r.valorAberto)}{r.vencimento ? ` · vence ${dataBr(r.vencimento).slice(0, 5)}` : ""}</span>;
  };

  return (
    <section className="space-y-4 rounded-2xl border border-gray-100 bg-white p-5 shadow-soft" aria-label="Composição da receita">
      <header>
        <h2 className="text-[15px] font-semibold text-gray-900">Composição da receita, mês a mês</h2>
        <p className="mt-0.5 max-w-3xl text-[13px] leading-relaxed text-gray-500">
          Valores brutos, como estão na nota e nas linhas dos pedidos (as retenções ficam à parte, em cinza). Receita = medição faturada em nota fiscal + notas de débito (os reembolsáveis do contrato, que também são linhas da medição) + o que foi medido e ainda está sem nota (conta na receita e aparece marcado). O mês é o do trabalho: a medição é enviada até o dia 3 do mês seguinte, a nota sai depois e vence 30 dias após a emissão.
        </p>
      </header>

      {(dados.faturamentoErro || dados.semFaturamento) && (
        <p className="rounded-xl border border-amber-200 bg-amber-50/70 px-4 py-2.5 text-[13px] text-amber-950">
          {dados.semFaturamento ? "As notas ainda não foram lidas do Senior; a leitura acontece na próxima atualização." : `A última leitura das notas falhou (${dados.faturamentoErro}); o que aparece é a leitura anterior.`}
        </p>
      )}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {[
          { t: "Receita bruta", v: moeda(t.receita), s: "medição em nota + notas de débito + medido sem nota, no período" },
          { t: "Medição (nota fiscal)", v: moeda(t.nf), s: t.receita ? `${Math.round((t.nf / t.receita) * 100)}% da receita` : "" },
          { t: "Notas de débito (reembolsáveis)", v: moeda(t.nd), s: t.receita ? `${Math.round((t.nd / t.receita) * 100)}% da receita` : "" },
          { t: "Medido ainda sem nota", v: moeda(t.semNota), s: t.semNota > 0 ? "já conta na receita; falta emitir a nota" : "tudo que foi medido tem nota", aviso: t.semNota > 0 },
          { t: "Receita líquida (informativo)", v: moeda(t.liquido), s: `retenções das notas fiscais: ${moeda(t.retencoes)}` },
        ].map((k) => (
          <div key={k.t} className="rounded-xl border border-gray-100 bg-white p-3.5">
            <p className="text-[12.5px] font-medium text-gray-500">{k.t}</p>
            <p className={`mt-0.5 text-lg font-semibold tabular-nums ${(k as { aviso?: boolean }).aviso ? "text-amber-700" : "text-gray-900"}`}>{k.v}</p>
            <p className="text-[11.5px] text-gray-400">{k.s}</p>
          </div>
        ))}
      </div>

      <BarrasReceita meses={c.meses} selecionado={mes} onSelecionar={(m) => setMes(mes === m ? null : m)} />

      <div className="overflow-x-auto rounded-xl border border-gray-100">
        <table className="w-full min-w-[820px] border-separate border-spacing-0 text-[12.5px] tabular-nums">
          <thead>
            <tr>
              <th className={`${th} text-left`}>Mês</th>
              <th className={`${th} text-right`}>Medição (NF)</th>
              <th className={`${th} text-right`}>Notas de débito</th>
              <th className={`${th} text-right`} title="Medido nos pedidos e ainda sem nota fiscal: conta na receita">Medido sem nota</th>
              <th className={`${th} text-right text-gray-900`}>Receita bruta</th>
              <th className={`${th} text-right`} title="Retenções da nota fiscal (PIS, COFINS, CSLL, IRRF, ISS…); a nota de débito não tem retenção">Retenções</th>
              <th className={`${th} text-right`}>Receita líquida</th>
              <th className={`${th} text-right`} title="Soma das linhas dos pedidos de medição do mês">Soma das linhas medidas</th>
              <th className={`${th} text-center`} title="Tudo que foi medido (pedido) tem nota? Pedido feito sem nota, ou nota sem pedido lançado, aparece aqui">Medição × nota</th>
              <th className={`${th} text-center`} title="Situação do título da nota no Senior (valor líquido). É só informação: o pagamento nunca entra na receita">Recebimento</th>
            </tr>
          </thead>
          <tbody>
            {c.meses.map((m) => (
              <tr key={m.mes} onClick={() => setMes(mes === m.mes ? null : m.mes)} className={`cursor-pointer hover:bg-gray-50 ${mes === m.mes ? "bg-teal-50/60" : ""}`}>
                <td className={`${td} text-left font-medium text-gray-800`}>{mesCurto(m.mes)}</td>
                <td className={`${td} text-right text-gray-700`}>{m.nf ? vc(m.nf) : <span className="text-gray-300">·</span>}</td>
                <td className={`${td} text-right text-gray-700`}>{m.nd ? vc(m.nd) : <span className="text-gray-300">·</span>}</td>
                <td className={`${td} text-right ${m.semNota ? "font-semibold text-amber-700" : "text-gray-700"}`}>{m.semNota ? vc(m.semNota) : <span className="text-gray-300">·</span>}</td>
                <td className={`${td} text-right font-semibold text-gray-900`}>{m.receita ? vc(m.receita) : <span className="font-normal text-gray-300">·</span>}</td>
                <td className={`${td} text-right text-gray-500`}>{m.retencoes ? vc(m.retencoes) : <span className="text-gray-300">·</span>}</td>
                <td className={`${td} text-right text-gray-500`}>{m.liquido ? vc(m.liquido) : <span className="text-gray-300">·</span>}</td>
                <td className={`${td} text-right text-gray-700`}>{m.medido ? vc(m.medido) : <span className="text-gray-300">·</span>}</td>
                <td className={`${td} text-center`}>{conferencia(m)}</td>
                <td className={`${td} text-center`}>{recebimento(m)}</td>
              </tr>
            ))}
            <tr className="font-semibold">
              <td className="border-t-2 border-gray-200 bg-gray-50 px-2.5 py-2 text-left">Total do período</td>
              <td className="border-t-2 border-gray-200 bg-gray-50 px-2.5 py-2 text-right">{vc(t.nf)}</td>
              <td className="border-t-2 border-gray-200 bg-gray-50 px-2.5 py-2 text-right">{vc(t.nd)}</td>
              <td className="border-t-2 border-gray-200 bg-gray-50 px-2.5 py-2 text-right text-amber-700">{vc(t.semNota)}</td>
              <td className="border-t-2 border-gray-200 bg-gray-50 px-2.5 py-2 text-right">{vc(t.receita)}</td>
              <td className="border-t-2 border-gray-200 bg-gray-50 px-2.5 py-2 text-right text-gray-500">{vc(t.retencoes)}</td>
              <td className="border-t-2 border-gray-200 bg-gray-50 px-2.5 py-2 text-right text-gray-500">{vc(t.liquido)}</td>
              <td className="border-t-2 border-gray-200 bg-gray-50 px-2.5 py-2 text-right">{vc(t.medido)}</td>
              <td className="border-t-2 border-gray-200 bg-gray-50" />
              <td className="border-t-2 border-gray-200 bg-gray-50 px-2.5 py-2 text-center text-[11.5px] font-medium text-amber-700">{c.meses.reduce((a, m) => a + (m.recebimento?.valorAberto ?? 0), 0) > 0.05 ? `a receber ${vc(c.meses.reduce((a, m) => a + (m.recebimento?.valorAberto ?? 0), 0))}` : ""}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p className="text-xs text-gray-400">Clique num mês (na tabela ou no gráfico) para ver os pedidos e as notas dele. Recebimento é a situação do título no Senior (valor líquido, depois das retenções) e é só informação: a nota conta na receita do mês do trabalho, mesmo que o pagamento caia em outro mês, e o pagamento nunca soma na receita.{dados.contratos.length > 1 ? ` Inclui os contratos do mesmo centro de custo: ${dados.contratos.join(", ")}.` : ""}</p>

      {/* ---------------- o mes escolhido: pedidos e notas */}
      {mes && (
        <div className="rounded-xl border border-teal-200 bg-teal-50/30 p-4">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-gray-900">{mesLongo(mes)}: pedidos de medição e a nota de cada um</h3>
            <button type="button" onClick={() => setMes(null)} className="rounded-lg border border-gray-200 bg-white px-3 py-1 text-[12.5px] text-gray-600 hover:bg-gray-50">Fechar</button>
          </div>
          {origem && (
            <div className="mb-3 rounded-lg border border-gray-200 bg-white px-3.5 py-3 text-[12.5px] leading-relaxed text-gray-700">
              <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-gray-500">O que o Senior mostra neste mês{dados.atualizadoEm ? ` · leitura de ${new Date(dados.atualizadoEm).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}` : ""}</p>
              <ul className="space-y-1">
                {[...origem.notas, ...origem.pedidos].map((l) => (
                  <li key={`${l.titulo}-${l.texto}`} className="flex gap-2"><span className="w-24 shrink-0 font-medium text-gray-900">{l.titulo}</span><span>{l.texto}</span></li>
                ))}
              </ul>
              <p className="mt-2 border-t border-gray-100 pt-2 text-gray-800">{origem.resumo}</p>
            </div>
          )}
          <div className="overflow-x-auto rounded-lg border border-gray-100 bg-white">
            <table className="w-full min-w-[640px] border-separate border-spacing-0 text-[12.5px]">
              <thead><tr><th className={`${th} text-left`}>Pedido</th><th className={`${th} text-left`}>Boletim</th><th className={`${th} text-right`}>Linhas</th><th className={`${th} text-right`}>Valor do pedido</th><th className={`${th} text-left`}>Nota</th><th className={`${th} text-right`}>Bruto</th><th className={`${th} text-right`}>Líquido</th><th className={`${th} text-left`}>Recebimento</th></tr></thead>
              <tbody>
                {pedidosMes.map((p) => (p.documentos.length ? p.documentos : [null]).map((d, i) => {
                  const doc = d ? c.docs.find((x) => x.chave === d.chave) : null;
                  return (
                    <tr key={`${p.numPed}-${d?.chave ?? i}`}>
                      <td className={`${td} font-medium text-gray-800`}>{i === 0 ? p.numPed : ""}</td>
                      <td className={`${td} text-gray-600`}>{i === 0 ? p.boletins.join(", ") || "—" : ""}</td>
                      <td className={`${td} text-right text-gray-500`}>{i === 0 ? p.itens : ""}</td>
                      <td className={`${td} text-right font-medium tabular-nums text-gray-900`}>{i === 0 ? moeda(p.valor) : ""}</td>
                      <td className={`${td} text-gray-800`}>{d ? <>{rotuloDoc(d.tipo, d.numero)} <span className="text-[11px] text-gray-400">{COMO[d.como]}</span></> : notaAcimaNoMes ? <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10.5px] font-semibold text-slate-700">sem nota ligada</span> : <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10.5px] font-semibold text-amber-800">ainda sem nota</span>}</td>
                      <td className={`${td} text-right tabular-nums text-gray-700`}>{d ? moeda(d.valor) : ""}</td>
                      <td className={`${td} text-right tabular-nums text-gray-700`}>{doc ? moeda(doc.valorLiquido) : ""}</td>
                      <td className={td}>{doc ? <ChipNota d={doc} duplicada={!!doc.duplicadaDe} /> : d ? "" : notaAcimaNoMes ? <span className={`${chip} bg-slate-100 text-slate-700`}>nota do mês acima do pedido</span> : <span className={`${chip} bg-amber-100 text-amber-800`}>pedido feito, nota não entrada</span>}</td>
                    </tr>
                  );
                }))}
                {docsMes.filter((d) => !d.vinculo && !d.duplicadaDe).map((d) => (
                  <tr key={d.chave}>
                    <td className={`${td} text-gray-400`} colSpan={4}>{d.tipo === "ND" ? "Nota de débito sem pedido no Senior (entra na receita)" : "Nota fiscal sem pedido no Senior"}</td>
                    <td className={`${td} text-gray-800`}>{rotuloDoc(d.tipo, d.numero)}</td>
                    <td className={`${td} text-right tabular-nums text-gray-700`}>{moeda(d.valor)}</td>
                    <td className={`${td} text-right tabular-nums text-gray-700`}>{moeda(d.valorLiquido)}</td>
                    <td className={td}><ChipNota d={d} /></td>
                  </tr>
                ))}
                {pedidosMes.length === 0 && docsMes.length === 0 && <tr><td colSpan={8} className="px-3 py-6 text-center text-gray-400">Nada neste mês.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ---------------- conferencia detalhada (financeiro) */}
      <details className="rounded-xl border border-gray-100 bg-gray-50/50 px-4 py-3 text-[13px] text-gray-600">
        <summary className="cursor-pointer text-sm font-medium text-gray-800">Conferência de todos os pedidos e notas do período (para o financeiro)</summary>
        <div className="mt-3 space-y-4">
          {(c.acumulados.medido > 0 || c.notasAntesDoInicio.qtd > 0) && (
            <p className="rounded-lg bg-violet-50/70 px-3 py-2 leading-relaxed text-violet-950">
              Fora dos meses: {c.acumulados.medido > 0 && <>cargas acumuladas de medição (“ACUMULADOS”, “BM01 A BM32”) somando <b>{moeda(c.acumulados.medido)}</b>; </>}
              {c.notasAntesDoInicio.qtd > 0 && <><b>{c.notasAntesDoInicio.qtd}</b> nota(s) ({moeda(c.notasAntesDoInicio.valor)}) de meses anteriores ao primeiro pedido no Senior.</>}
            </p>
          )}
          <div className="max-h-[360px] overflow-auto rounded-lg border border-gray-100 bg-white">
            <table className="w-full min-w-[760px] border-separate border-spacing-0 text-[12.5px]">
              <thead className="sticky top-0 z-10"><tr><th className={`${th} text-left`}>Pedido</th><th className={`${th} text-left`}>Mês</th><th className={`${th} text-left`}>Boletim</th><th className={`${th} text-right`}>Valor</th><th className={`${th} text-left`}>Nota</th><th className={`${th} text-left`}>Observação</th></tr></thead>
              <tbody>
                {c.pedidos.map((p) => (
                  <tr key={p.numPed} className="align-top">
                    <td className={`${td} font-medium text-gray-800`}>{p.numPed}</td>
                    <td className={`${td} whitespace-nowrap text-gray-700`}>{p.competencia === "0000-00" ? "carga acumulada" : mesCurto(p.competencia)}</td>
                    <td className={`${td} text-gray-600`}>{p.boletins.join(", ") || "—"}</td>
                    <td className={`${td} text-right font-medium tabular-nums text-gray-900`}>{moeda(p.valor)}</td>
                    <td className={`${td} text-gray-800`}>{p.documentos.length ? p.documentos.map((d) => `${rotuloDoc(d.tipo, d.numero)} (${COMO[d.como]})`).join(" + ") : p.competencia === "0000-00" ? "—" : <span className="text-amber-700">ainda sem nota</span>}</td>
                    <td className={`${td} text-[12px] text-amber-800`}>{p.possivelOutroCc ? `Há ${rotuloDoc(p.possivelOutroCc.tipo, p.possivelOutroCc.numero)} de ${moeda(p.possivelOutroCc.valor)} no CC ${p.possivelOutroCc.codccu}: conferir o rateio no Senior.` : ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="max-h-[360px] overflow-auto rounded-lg border border-gray-100 bg-white">
            <table className="w-full min-w-[760px] border-separate border-spacing-0 text-[12.5px]">
              <thead className="sticky top-0 z-10"><tr><th className={`${th} text-left`}>Documento</th><th className={`${th} text-left`}>Emissão</th><th className={`${th} text-left`}>Mês do trabalho</th><th className={`${th} text-right`}>Bruto</th><th className={`${th} text-right`}>Líquido</th><th className={`${th} text-left`}>Pedidos</th><th className={`${th} text-left`}>Recebimento</th></tr></thead>
              <tbody>
                {c.docs.map((d) => (
                  <tr key={d.chave}>
                    <td className={`${td} whitespace-nowrap font-medium text-gray-800`}>{rotuloDoc(d.tipo, d.numero)}{d.tipo === "NF" && d.filial !== "1" ? <span className="ml-1 text-[11px] font-normal text-gray-400">filial {d.filial}</span> : null}</td>
                    <td className={`${td} whitespace-nowrap text-gray-600`}>{dataBr(d.dataEmissao)}</td>
                    <td className={`${td} whitespace-nowrap text-gray-700`}>{d.competencia === "0000-00" ? "carga acumulada" : mesCurto(d.competencia)}{d.competenciaOriginal !== d.competencia && d.competenciaOriginal !== "0000-00" ? <span className="ml-1 text-[11px] text-gray-400">(emitida p/ {mesCurto(d.competenciaOriginal)})</span> : null}</td>
                    <td className={`${td} text-right tabular-nums text-gray-900`}>{moeda(d.valor)}</td>
                    <td className={`${td} text-right tabular-nums text-gray-700`}>{moeda(d.valorLiquido)}</td>
                    <td className={`${td} text-gray-700`}>{d.duplicadaDe ? <span className="text-gray-500">duplicada da NF {d.duplicadaDe}: não conta na receita</span> : d.vinculo ? `${d.pedidosLigados.join(", ")} (${COMO[d.vinculo]})` : d.competencia === "0000-00" ? "—" : d.tipo === "ND" ? <span className="text-violet-700">sem pedido (entra na receita)</span> : <span className="text-amber-700">sem pedido no Senior</span>}</td>
                    <td className={td}><ChipNota d={d} duplicada={!!d.duplicadaDe} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </details>
    </section>
  );
}
