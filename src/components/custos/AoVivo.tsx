"use client";

// "Ao vivo" no fim do Custo por Centro de Custo: tudo que o Senior tem ligado ao centro de custo, para o coordenador acompanhar -- cada titulo
// (com OC ou sem, pago ou nao) e cada OC que ainda nao virou titulo (em analise, aprovada, reprovada). Escolhe o periodo, ve mes a mes (clicando
// num mes a lista mostra so' aquele mes), filtra por linha de custo e abre a OC. Somente leitura; atualiza sozinho a cada 3 minutos com o que
// o sistema ja sincronizou do Senior (que roda a cada ~30 min).

import { ROTULO_NO_LANCAMENTO, type StatusContestacao } from "@/lib/contestacoes";
import { useCallback, useEffect, useRef, useState } from "react";
import SeletorPeriodo from "@/components/contratos/SeletorPeriodo";
import { useAbrirOC } from "./AbrirOC";
import ContestarCusto, { type LancamentoContestavel } from "./ContestarCusto";
import { mesCurto, mesLongo, moeda, moedaCompacta } from "@/lib/custos/formato";

type Item = {
  chave: string; origem: "TITULO" | "OC"; ccu: string; ccuNome: string | null; ctaFin: string | null; linhaCusto: string | null; data: string;
  numTit: string | null; tipoTitulo: string | null; fornecedor: string; descricao: string | null; numOcp: string | null; ocSituacao: string | null; ocRotulo: string;
  pagamento: "pago" | "a_pagar" | "vencido" | "previsao" | "sem_titulo"; dataPagamento: string | null; vencimento: string | null; valor: number; origemCcu: string | null;
};
type Resposta = {
  total: number; pagina: number; paginas: number; itens: Item[];
  resumo: Record<string, { n: number; valor: number }>;
  meses: { mes: string; n: number; valor: number; pagos: number; emAberto: number }[];
  linhasDeCusto: { cod: string; nome: string; n: number; valor: number }[];
  centros: { codccu: string; nome: string; n: number }[];
  filtros: { chave: string; rotulo: string }[];
  atualizadoEm: { titulos: string | null; rateios: string | null; ocs: string | null };
  rateiosLidos: boolean; ocsSemRateioLegivel: number; foraDoCusto?: { n: number; valor: number };
};

const dataBr = (iso: string | null) => (iso ? iso.slice(0, 10).split("-").reverse().join("/") : "");
const hora = (iso: string | null) => (iso ? new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" }) : "—");
const mesDeHoje = () => new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" }).slice(0, 7);
const menosMeses = (mes: string, n: number) => {
  const [a, m] = mes.split("-").map(Number);
  const d = new Date(Date.UTC(a, m - 1 - n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
};
const PAGAMENTO: Record<Item["pagamento"], { rotulo: string; cor: string }> = {
  pago: { rotulo: "Pago", cor: "bg-emerald-100 text-emerald-800" },
  a_pagar: { rotulo: "A pagar", cor: "bg-sky-100 text-sky-800" },
  vencido: { rotulo: "Vencido", cor: "bg-red-100 text-red-700" },
  previsao: { rotulo: "Previsão", cor: "bg-violet-100 text-violet-800" },
  sem_titulo: { rotulo: "Sem título ligado", cor: "bg-gray-100 text-gray-600" },
};
const OC_COR: Record<string, string> = { ANA: "bg-amber-100 text-amber-800", PRE: "bg-amber-100 text-amber-800", APR: "bg-emerald-100 text-emerald-800", REP: "bg-red-100 text-red-700", CAN: "bg-gray-200 text-gray-700" };

export default function AoVivo({ codccu }: { codccu?: string }) {
  const mesAtual = mesDeHoje();
  const [dados, setDados] = useState<Resposta | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [periodo, setPeriodo] = useState({ de: menosMeses(mesAtual, 2), ate: mesAtual });
  const [mes, setMes] = useState<string | null>(null);
  const [situacao, setSituacao] = useState("todas");
  const [conta, setConta] = useState("");
  const [centro, setCentro] = useState("");
  const [busca, setBusca] = useState("");
  const [buscaAplicada, setBuscaAplicada] = useState("");
  const [pagina, setPagina] = useState(1);
  const filtrosRef = useRef("");
  const { abrirOC, janelaOC } = useAbrirOC();
  // contestacao de custo: o lancamento aberto na janela, o estado de cada contestacao da pagina e o aviso depois de enviar
  const [contestando, setContestando] = useState<LancamentoContestavel | null>(null);
  const [contestadas, setContestadas] = useState<Record<string, { id: string; status: string; indicado: string | null }>>({});
  const [avisoContestacao, setAvisoContestacao] = useState("");

  const ccu = codccu ?? centro;
  const consulta = useCallback(() => {
    const p = new URLSearchParams();
    p.set("de", periodo.de);
    p.set("ate", periodo.ate);
    if (mes) p.set("mes", mes);
    if (ccu) p.set("ccu", ccu);
    if (conta) p.set("conta", conta);
    if (situacao !== "todas") p.set("situacao", situacao);
    if (buscaAplicada) p.set("q", buscaAplicada);
    if (pagina > 1) p.set("pagina", String(pagina));
    return p.toString();
  }, [periodo, mes, ccu, conta, situacao, buscaAplicada, pagina]);

  const carregar = useCallback(async () => {
    const qs = consulta();
    filtrosRef.current = qs;
    try {
      const r = await fetch(`/api/custos-conta/ao-vivo?${qs}`, { cache: "no-store" });
      const j = await r.json().catch(() => ({}));
      if (filtrosRef.current !== qs) return; // chegou uma resposta velha: ignora
      if (!r.ok) throw new Error(j.error || "Não foi possível carregar o Ao vivo.");
      setDados(j);
      setErro(null);
    } catch (e: any) {
      setErro(e?.message || "Não foi possível carregar o Ao vivo.");
    }
  }, [consulta]);

  useEffect(() => { void carregar(); }, [carregar]);
  const chavesDaPagina = dados?.itens.map((i) => i.chave).join(",") ?? "";
  const carregarContestacoes = useCallback(async () => {
    if (!chavesDaPagina) return setContestadas({});
    const r = await fetch(`/api/contestacoes?${new URLSearchParams({ chaves: chavesDaPagina })}`, { cache: "no-store" }).catch(() => null);
    if (r?.ok) setContestadas((await r.json()).porChave ?? {});
  }, [chavesDaPagina]);
  useEffect(() => { void carregarContestacoes(); }, [carregarContestacoes]);
  useEffect(() => {
    const t = setInterval(() => { if (document.visibilityState === "visible") void carregar(); }, 180_000);
    return () => clearInterval(t);
  }, [carregar]);
  useEffect(() => {
    const t = setTimeout(() => { setBuscaAplicada(busca.trim()); setPagina(1); }, 350);
    return () => clearTimeout(t);
  }, [busca]);

  const mudar = (fn: () => void) => { fn(); setPagina(1); };
  const maiorMes = Math.max(1, ...(dados?.meses.map((m) => m.valor) ?? [0]));

  return (
    <section className="mt-8 rounded-2xl border border-gray-100 bg-white p-5 shadow-soft">
      <header className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold text-gray-900">
            <span className="relative flex h-2.5 w-2.5"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" /><span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" /></span>
            Ao vivo
          </h2>
          <p className="mt-0.5 max-w-3xl text-[13.5px] text-gray-500">Tudo que o Senior tem {codccu ? "neste centro de custo" : "nos centros de custo que você acompanha"}: títulos com ou sem OC, pagos ou não, e as OCs que ainda não viraram título (em análise, aprovadas ou reprovadas). Escolha o período, veja mês a mês e clique numa OC para abri-la.</p>
        </div>
        {dados && <p className="text-xs text-gray-400">Senior sincronizado — títulos {hora(dados.atualizadoEm.titulos)} · OCs {hora(dados.atualizadoEm.ocs)} · centro de custo dos títulos {hora(dados.atualizadoEm.rateios)}</p>}
      </header>

      <div className="mb-4">
        <SeletorPeriodo de={periodo.de} ate={periodo.ate} mesAtual={mesAtual} modo="passado" onMudar={(de, ate) => mudar(() => { setPeriodo({ de, ate }); setMes(null); })} />
      </div>

      {erro && <div className="mb-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{erro}</div>}
      {!dados && !erro && <div className="py-10 text-center text-sm text-gray-500">Lendo os lançamentos do Senior…</div>}

      {dados && (
        <>
          {!dados.rateiosLidos && (
            <div className="mb-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-[13px] text-amber-900">
              O centro de custo e a linha de custo de cada título ainda não foram lidos do Senior. Eles chegam na próxima atualização do custo (use “Atualizar” no alto da tela). Por enquanto aparecem só os títulos que já trazem o centro de custo no cadastro.
            </div>
          )}

          {/* ---------------- mes a mes */}
          <div className="mb-4">
            <p className="mb-1.5 text-[13px] font-medium text-gray-600">Mês a mês <span className="font-normal text-gray-400">(mês do pagamento, do lançamento ou da OC) · clique num mês para ver só ele</span></p>
            <div className="flex gap-2 overflow-x-auto pb-1">
              {dados.meses.map((m, k) => {
                const ativo = mes === m.mes;
                const ant = k > 0 ? dados.meses[k - 1].valor : null;
                const v = ant !== null && ant > 0 ? (m.valor - ant) / ant : null;
                return (
                  <button key={m.mes} type="button" onClick={() => mudar(() => setMes(ativo ? null : m.mes))}
                    className={`min-w-[132px] shrink-0 rounded-xl border px-3 py-2 text-left transition ${ativo ? "border-brand bg-brand/5" : "border-gray-200 hover:border-gray-300"}`} aria-pressed={ativo} title={mesLongo(m.mes)}>
                    <span className="flex items-center justify-between text-[13px] font-semibold text-gray-800">{mesCurto(m.mes)}{v !== null && Math.abs(v) >= 0.005 && <span className={`text-[11px] font-medium ${v > 0 ? "text-red-700" : "text-emerald-700"}`}>{v > 0 ? "▲" : "▼"} {Math.round(Math.abs(v) * 100)}%</span>}</span>
                    <span className="block text-[13px] tabular-nums text-gray-700">{m.n > 0 ? moedaCompacta(m.valor) : "–"}</span>
                    <span className="block text-[11px] text-gray-400">{m.n} lançamento{m.n === 1 ? "" : "s"}</span>
                    <span className="mt-1 flex h-1.5 overflow-hidden rounded-full bg-gray-100" aria-hidden>
                      <span className="bg-emerald-500" style={{ width: `${(m.pagos / maiorMes) * 100}%` }} />
                      <span className="bg-sky-400" style={{ width: `${(m.emAberto / maiorMes) * 100}%` }} />
                    </span>
                  </button>
                );
              })}
            </div>
            <p className="mt-1 flex gap-4 text-[11px] text-gray-400"><span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-emerald-500" />pago</span><span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-sky-400" />ainda em aberto</span></p>
          </div>

          <div className="mb-4 flex flex-wrap gap-2">
            {dados.filtros.map((f) => {
              const r = dados.resumo[f.chave];
              const ativo = situacao === f.chave;
              return (
                <button key={f.chave} type="button" onClick={() => mudar(() => setSituacao(f.chave))}
                  className={`rounded-xl border px-3 py-2 text-left text-[13px] transition ${ativo ? "border-brand bg-brand/5" : "border-gray-200 hover:border-gray-300"}`}>
                  <span className="block font-medium text-gray-800">{f.rotulo}</span>
                  <span className="block text-xs tabular-nums text-gray-500">{r ? `${r.n} · ${moedaCompacta(r.valor)}` : ""}</span>
                </button>
              );
            })}
          </div>

          <div className="mb-3 flex flex-wrap items-center gap-2">
            {!codccu && (
              <select value={centro} onChange={(e) => mudar(() => { setCentro(e.target.value); setConta(""); })} className="max-w-[260px] rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm">
                <option value="">Todos os centros de custo</option>
                {dados.centros.map((c) => <option key={c.codccu} value={c.codccu}>{c.codccu} · {c.nome} ({c.n})</option>)}
              </select>
            )}
            <select value={conta} onChange={(e) => mudar(() => setConta(e.target.value))} className="max-w-[340px] rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm" aria-label="Linha de custo">
              <option value="">Todas as linhas de custo</option>
              {dados.linhasDeCusto.map((l) => <option key={l.cod} value={l.cod}>{l.nome} ({l.n} · {moedaCompacta(l.valor)})</option>)}
              {conta && !dados.linhasDeCusto.some((l) => l.cod === conta) && <option value={conta}>{conta}</option>}
            </select>
            <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar fornecedor, descrição, título ou OC" className="min-w-[240px] flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-brand" />
            {(conta || situacao !== "todas" || busca || mes) && <button type="button" onClick={() => { setConta(""); setSituacao("todas"); setBusca(""); setMes(null); setPagina(1); }} className="text-[13px] font-medium text-brand hover:text-brand-dark">Limpar filtros</button>}
          </div>

          {mes && <p className="mb-2 text-[13px] text-gray-600">Mostrando só <b>{mesLongo(mes)}</b>.</p>}

          <div className="overflow-x-auto rounded-xl border border-gray-100">
            <table className="w-full min-w-[980px] text-[13px]">
              <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
                <tr><th className="px-3 py-2">Data</th>{!codccu && <th className="px-3 py-2">Centro de custo</th>}<th className="px-3 py-2">Lançamento</th><th className="px-3 py-2">Linha de custo</th><th className="px-3 py-2">OC</th><th className="px-3 py-2">Pagamento</th><th className="px-3 py-2 text-right">Valor</th><th className="px-3 py-2"><span className="sr-only">Contestar</span></th></tr>
              </thead>
              <tbody>
                {dados.itens.map((i) => {
                  const pg = PAGAMENTO[i.pagamento];
                  return (
                    <tr key={i.chave} className="border-t border-gray-100 align-top">
                      <td className="whitespace-nowrap px-3 py-2 tabular-nums text-gray-600">{dataBr(i.data)}</td>
                      {!codccu && <td className="px-3 py-2 text-gray-600"><span className="text-gray-400">{i.ccu}</span> {i.ccuNome}</td>}
                      <td className="px-3 py-2">
                        <div className="font-medium text-gray-800">{i.fornecedor}</div>
                        <div className="text-xs text-gray-500">{i.origem === "TITULO" ? `Título ${i.numTit}${i.tipoTitulo ? ` · ${i.tipoTitulo}` : ""}` : "Ordem de compra, sem título ligado no Senior"}</div>
                        {i.descricao && <div className="mt-0.5 line-clamp-2 max-w-[420px] text-xs text-gray-400" title={i.descricao}>{i.descricao}</div>}
                      </td>
                      <td className="px-3 py-2 text-gray-600">{i.linhaCusto ?? <span className="text-gray-300">não informada</span>}</td>
                      <td className="whitespace-nowrap px-3 py-2">
                        {i.numOcp ? <button type="button" onClick={() => abrirOC(i.numOcp as string)} className="mr-1.5 rounded-md border border-brand/40 px-1.5 py-0.5 text-xs font-medium text-brand hover:bg-brand/10" title="Abrir a OC">OC {i.numOcp}</button> : null}
                        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${i.ocSituacao ? OC_COR[i.ocSituacao] ?? "bg-gray-100 text-gray-600" : "bg-gray-100 text-gray-500"}`}>{i.ocRotulo}</span>
                      </td>
                      <td className="whitespace-nowrap px-3 py-2">
                        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${pg.cor}`}>{pg.rotulo}</span>
                        <div className="mt-0.5 text-xs text-gray-400">{i.pagamento === "pago" ? (i.dataPagamento ? `em ${dataBr(i.dataPagamento)}` : "") : i.vencimento ? `vence ${dataBr(i.vencimento)}` : i.pagamento === "a_pagar" ? "sem data de vencimento" : ""}</div>
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-right font-medium tabular-nums text-gray-900">{moeda(i.valor)}</td>
                      <td className="whitespace-nowrap px-3 py-2 text-right">
                        {contestadas[i.chave] ? (
                          <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${contestadas[i.chave].status === "REALOCADA" ? "bg-emerald-100 text-emerald-800" : contestadas[i.chave].status === "ACEITA" ? "bg-sky-100 text-sky-800" : contestadas[i.chave].status === "REJEITADA" ? "bg-gray-200 text-gray-700" : "bg-amber-100 text-amber-800"}`}
                            title={contestadas[i.chave].indicado ? `Responsável indicado: ${contestadas[i.chave].indicado}` : undefined}>
                            {ROTULO_NO_LANCAMENTO[contestadas[i.chave].status as StatusContestacao] ?? "Contestado"}
                          </span>
                        ) : (
                          <button type="button" onClick={() => { setAvisoContestacao(""); setContestando({ chave: i.chave, fornecedor: i.fornecedor, numTit: i.numTit, numOcp: i.numOcp, valor: i.valor, linhaCusto: i.linhaCusto, ccu: i.ccu, ccuNome: i.ccuNome ?? (dados?.centros.find((c) => c.codccu === i.ccu)?.nome ?? null) }); }}
                            className="rounded-lg border border-amber-300 px-2.5 py-1 text-xs font-medium text-amber-800 hover:bg-amber-50" title="Este custo não é do meu contrato">Contestar</button>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {dados.itens.length === 0 && <tr><td colSpan={codccu ? 7 : 8} className="px-3 py-8 text-center text-gray-400">Nenhum lançamento com esses filtros neste período.</td></tr>}
              </tbody>
            </table>
          </div>

          <footer className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[13px] text-gray-500">
            <span>{dados.total} lançamento{dados.total === 1 ? "" : "s"}{dados.ocsSemRateioLegivel > 0 ? ` · ${dados.ocsSemRateioLegivel} OC(s) com rateio ilegível ficaram de fora` : ""}{dados.foraDoCusto && dados.foraDoCusto.n > 0 ? ` · ${dados.foraDoCusto.n} lançamento(s) de pessoal e impostos (${moeda(dados.foraDoCusto.valor)}) ficam de fora, como no custo` : ""}</span>
            <span className="flex items-center gap-3">
              <button type="button" disabled={dados.pagina <= 1} onClick={() => setPagina(dados.pagina - 1)} className="rounded-lg border border-gray-200 px-3 py-1.5 disabled:opacity-40">Anterior</button>
              <span>Página {dados.pagina} de {dados.paginas}</span>
              <button type="button" disabled={dados.pagina >= dados.paginas} onClick={() => setPagina(dados.pagina + 1)} className="rounded-lg border border-gray-200 px-3 py-1.5 disabled:opacity-40">Próxima</button>
            </span>
          </footer>
        </>
      )}
      {avisoContestacao && <p role="status" className="mt-3 rounded-lg bg-emerald-50 px-4 py-2 text-sm text-emerald-800">{avisoContestacao}</p>}
      {contestando && (
        <ContestarCusto item={contestando} onFechar={() => setContestando(null)}
          onEnviada={() => { setContestando(null); setAvisoContestacao("Contestação enviada ao financeiro. Acompanhe em Aprovações."); void carregarContestacoes(); }} />
      )}
      {janelaOC}
    </section>
  );
}
