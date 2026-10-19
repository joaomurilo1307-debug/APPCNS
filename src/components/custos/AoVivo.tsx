"use client";

// "Ao vivo" no fim do Custo por Centro de Custo: tudo que o Senior tem ligado ao centro de custo, para o coordenador acompanhar -- cada titulo
// (com OC ou sem, pago ou nao) e cada OC que ainda nao virou titulo (em analise, aprovada, reprovada). Filtra por linha de custo.
// Somente leitura; atualiza sozinho a cada 3 minutos com o que o sistema ja sincronizou do Senior (que roda a cada ~30 min).

import { useCallback, useEffect, useRef, useState } from "react";
import { moeda, moedaCompacta } from "@/lib/custos/formato";

type Item = {
  chave: string; origem: "TITULO" | "OC"; ccu: string; ccuNome: string | null; ctaFin: string | null; linhaCusto: string | null; data: string;
  numTit: string | null; tipoTitulo: string | null; fornecedor: string; descricao: string | null; numOcp: string | null; ocSituacao: string | null; ocRotulo: string;
  pagamento: "pago" | "a_pagar" | "vencido" | "previsao" | "sem_titulo"; dataPagamento: string | null; vencimento: string | null; valor: number; origemCcu: string | null;
};
type Resposta = {
  total: number; pagina: number; paginas: number; itens: Item[];
  resumo: Record<string, { n: number; valor: number }>;
  linhasDeCusto: { cod: string; nome: string; n: number; valor: number }[];
  centros: { codccu: string; nome: string; n: number }[];
  filtros: { chave: string; rotulo: string }[];
  atualizadoEm: { titulos: string | null; rateios: string | null; ocs: string | null };
  rateiosLidos: boolean; ocsSemRateioLegivel: number; foraDoCusto?: { n: number; valor: number };
};

const dataBr = (iso: string | null) => (iso ? iso.slice(0, 10).split("-").reverse().join("/") : "");
const hora = (iso: string | null) => (iso ? new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" }) : "—");
const PAGAMENTO: Record<Item["pagamento"], { rotulo: string; cor: string }> = {
  pago: { rotulo: "Pago", cor: "bg-emerald-100 text-emerald-800" },
  a_pagar: { rotulo: "A pagar", cor: "bg-sky-100 text-sky-800" },
  vencido: { rotulo: "Vencido", cor: "bg-red-100 text-red-700" },
  previsao: { rotulo: "Previsão", cor: "bg-violet-100 text-violet-800" },
  sem_titulo: { rotulo: "Sem título ligado", cor: "bg-gray-100 text-gray-600" },
};
const OC_COR: Record<string, string> = { ANA: "bg-amber-100 text-amber-800", PRE: "bg-amber-100 text-amber-800", APR: "bg-emerald-100 text-emerald-800", REP: "bg-red-100 text-red-700", CAN: "bg-gray-200 text-gray-700" };

export default function AoVivo({ codccu }: { codccu?: string }) {
  const [dados, setDados] = useState<Resposta | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [situacao, setSituacao] = useState("todas");
  const [conta, setConta] = useState("");
  const [centro, setCentro] = useState("");
  const [busca, setBusca] = useState("");
  const [buscaAplicada, setBuscaAplicada] = useState("");
  const [pagina, setPagina] = useState(1);
  const filtrosRef = useRef("");

  const ccu = codccu ?? centro;
  const consulta = useCallback(() => {
    const p = new URLSearchParams();
    if (ccu) p.set("ccu", ccu);
    if (conta) p.set("conta", conta);
    if (situacao !== "todas") p.set("situacao", situacao);
    if (buscaAplicada) p.set("q", buscaAplicada);
    if (pagina > 1) p.set("pagina", String(pagina));
    return p.toString();
  }, [ccu, conta, situacao, buscaAplicada, pagina]);

  const carregar = useCallback(async () => {
    const qs = consulta();
    filtrosRef.current = qs;
    try {
      const r = await fetch(`/api/custos-conta/ao-vivo${qs ? `?${qs}` : ""}`, { cache: "no-store" });
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
  // a cada minuto, so' com a aba visivel
  useEffect(() => {
    const t = setInterval(() => { if (document.visibilityState === "visible") void carregar(); }, 180_000);
    return () => clearInterval(t);
  }, [carregar]);
  // busca com pequena espera para nao consultar a cada tecla
  useEffect(() => {
    const t = setTimeout(() => { setBuscaAplicada(busca.trim()); setPagina(1); }, 350);
    return () => clearTimeout(t);
  }, [busca]);

  const mudar = (fn: () => void) => { fn(); setPagina(1); };

  return (
    <section className="mt-8 rounded-2xl border border-gray-100 bg-white p-5 shadow-soft">
      <header className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold text-gray-900">
            <span className="relative flex h-2.5 w-2.5"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" /><span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" /></span>
            Ao vivo
          </h2>
          <p className="mt-0.5 max-w-3xl text-[13.5px] text-gray-500">Tudo que o Senior tem neste centro de custo: títulos com ou sem OC, pagos ou não, e as OCs que ainda não viraram título (em análise, aprovadas ou reprovadas). Atualiza sozinho a cada poucos minutos.</p>
        </div>
        {dados && <p className="text-xs text-gray-400">Senior sincronizado — títulos {hora(dados.atualizadoEm.titulos)} · OCs {hora(dados.atualizadoEm.ocs)} · centro de custo dos títulos {hora(dados.atualizadoEm.rateios)}</p>}
      </header>

      {erro && <div className="mb-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{erro}</div>}
      {!dados && !erro && <div className="py-10 text-center text-sm text-gray-500">Lendo os lançamentos do Senior…</div>}

      {dados && (
        <>
          {!dados.rateiosLidos && (
            <div className="mb-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-[13px] text-amber-900">
              O centro de custo e a linha de custo de cada título ainda não foram lidos do Senior. Eles chegam na próxima atualização do custo (use “Atualizar” no alto da tela). Por enquanto aparecem só os títulos que já trazem o centro de custo no cadastro.
            </div>
          )}

          <div className="mb-4 flex flex-wrap gap-2">
            {dados.filtros.map((f) => {
              const r = f.chave === "todas" ? null : dados.resumo[f.chave];
              const ativo = situacao === f.chave;
              return (
                <button key={f.chave} type="button" onClick={() => mudar(() => setSituacao(f.chave))}
                  className={`rounded-xl border px-3 py-2 text-left text-[13px] transition ${ativo ? "border-brand bg-brand/5" : "border-gray-200 hover:border-gray-300"}`}>
                  <span className="block font-medium text-gray-800">{f.rotulo}</span>
                  <span className="block text-xs tabular-nums text-gray-500">{r ? `${r.n} · ${moedaCompacta(r.valor)}` : `${dados.total} lançamentos`}</span>
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
            {(conta || situacao !== "todas" || busca) && <button type="button" onClick={() => { setConta(""); setSituacao("todas"); setBusca(""); setPagina(1); }} className="text-[13px] font-medium text-brand hover:text-brand-dark">Limpar filtros</button>}
          </div>

          <div className="overflow-x-auto rounded-xl border border-gray-100">
            <table className="w-full min-w-[980px] text-[13px]">
              <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
                <tr><th className="px-3 py-2">Data</th>{!codccu && <th className="px-3 py-2">Centro de custo</th>}<th className="px-3 py-2">Lançamento</th><th className="px-3 py-2">Linha de custo</th><th className="px-3 py-2">OC</th><th className="px-3 py-2">Pagamento</th><th className="px-3 py-2 text-right">Valor</th></tr>
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
                        {i.numOcp ? <span className="mr-1.5 text-gray-600">OC {i.numOcp}</span> : null}
                        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${i.ocSituacao ? OC_COR[i.ocSituacao] ?? "bg-gray-100 text-gray-600" : "bg-gray-100 text-gray-500"}`}>{i.ocRotulo}</span>
                      </td>
                      <td className="whitespace-nowrap px-3 py-2">
                        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${pg.cor}`}>{pg.rotulo}</span>
                        <div className="mt-0.5 text-xs text-gray-400">{i.pagamento === "pago" ? (i.dataPagamento ? `em ${dataBr(i.dataPagamento)}` : "") : i.vencimento ? `vence ${dataBr(i.vencimento)}` : i.pagamento === "a_pagar" ? "sem data de vencimento" : ""}</div>
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-right font-medium tabular-nums text-gray-900">{moeda(i.valor)}</td>
                    </tr>
                  );
                })}
                {dados.itens.length === 0 && <tr><td colSpan={codccu ? 6 : 7} className="px-3 py-8 text-center text-gray-400">Nenhum lançamento com esses filtros.</td></tr>}
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
    </section>
  );
}
