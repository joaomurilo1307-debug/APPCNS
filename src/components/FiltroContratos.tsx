"use client";

// Filtro "Contratos" ao lado do Buscar: contratos incluidos e permitidos nos relatorios; lista completa nas obrigacoes financeiras.
// Os centros de custo (inclusive os administrativos) sao separados em Engenharia, Ambiental e Administrativo,
// para marcar quais ver. Atalhos "so' Engenharia / so' Ambiental / so' Administrativo" marcam o grupo inteiro; cada grupo e cada centro tem a sua caixinha, entao da' para
// comparar qualquer combinacao. A escolha vai para um cookie da sessao (o servidor le o mesmo cookie para filtrar as listas) e a pagina recarrega ao aplicar.
// So' visao: o acesso de cada pessoa continua valendo por cima, e sem escolha tudo fica como sempre (todos).

import { useEffect, useMemo, useRef, useState } from "react";
import { AREAS as AREAS_BASE, CENTROS as CENTROS_FINANCEIROS, areaDoCentro, gravarSelecao, selecaoDoCookie, type Area as AreaConhecida } from "@/lib/areas";

type Area = AreaConhecida | "SEM_AREA";
type Centro = { ccu: string; nome: string; area: Area };
const AREAS: ReadonlyArray<{ valor: Area; rotulo: string }> = [...AREAS_BASE, { valor: "SEM_AREA", rotulo: "Outros centros de custo" }];
const semAcento = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export default function FiltroContratos({ className = "", obrigacoesFinanceiras = false, incluirForaDosResultados = false, origemMedicao = false }: { className?: string; obrigacoesFinanceiras?: boolean; incluirForaDosResultados?: boolean; origemMedicao?: boolean }) {
  const [opcoes, setOpcoes] = useState<Centro[] | null>(obrigacoesFinanceiras ? [...CENTROS_FINANCEIROS] : null);
  const [erro, setErro] = useState("");
  const [tentativa, setTentativa] = useState(0);
  const CENTROS = useMemo(() => opcoes ?? [], [opcoes]);
  const TOTAL = CENTROS.length;
  const POR_AREA = useMemo(() => {
    const grupos: Record<Area, string[]> = { ENGENHARIA: [], AMBIENTAL: [], ADMINISTRATIVO: [], SEM_AREA: [] };
    for (const c of CENTROS) grupos[c.area].push(c.ccu);
    return grupos;
  }, [CENTROS]);
  const [aplicado, setAplicado] = useState<string[] | null | undefined>(undefined); // undefined = ainda nao leu o cookie (evita piscar)
  const [aberto, setAberto] = useState(false);
  const [marcados, setMarcados] = useState<Set<string>>(new Set());
  const [busca, setBusca] = useState("");
  const raiz = useRef<HTMLDivElement>(null);

  useEffect(() => setAplicado(selecaoDoCookie()), []);
  useEffect(() => {
    if (obrigacoesFinanceiras) return;
    const controller = new AbortController();
    setErro("");
    fetch(origemMedicao ? "/api/medicao?opcoes=1" : incluirForaDosResultados ? "/api/contratos?acompanhamento=todos&ignorarSelecao=1" : "/api/contratos?opcoes=1", { cache: "no-store", signal: controller.signal }).then(async (r) => {
      const j = await r.json();
      if (!r.ok || !Array.isArray(j.contratos)) throw new Error("Falha ao carregar os contratos.");
      setOpcoes(j.contratos.map((c: { codccu: string; nome: string }) => ({ ccu: c.codccu, nome: c.nome, area: areaDoCentro(c.codccu) ?? "SEM_AREA" })));
    }).catch((e) => { if (e.name !== "AbortError") setErro("Não foi possível carregar os contratos."); });
    return () => controller.abort();
  }, [obrigacoesFinanceiras, incluirForaDosResultados, origemMedicao, tentativa]);
  useEffect(() => {
    if (!aberto) return;
    const fora = (e: MouseEvent) => { if (raiz.current && !raiz.current.contains(e.target as Node)) setAberto(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setAberto(false); };
    document.addEventListener("mousedown", fora);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", fora); document.removeEventListener("keydown", esc); };
  }, [aberto]);

  const rotulo = useMemo(() => {
    if (!aplicado) return obrigacoesFinanceiras || incluirForaDosResultados ? "Todos os contratos" : "Contratos incluídos";
    const set = new Set(aplicado.filter((c) => CENTROS.some((o) => o.ccu === c)));
    for (const a of AREAS) if (POR_AREA[a.valor].length > 0 && POR_AREA[a.valor].length === set.size && POR_AREA[a.valor].every((c) => set.has(c))) return a.rotulo;
    return `${set.size} de ${TOTAL} contratos`;
  }, [aplicado, CENTROS, POR_AREA, TOTAL, obrigacoesFinanceiras, incluirForaDosResultados]);

  const termo = semAcento(busca.trim());
  const visiveis = (area: Area) => CENTROS.filter((c) => c.area === area && (!termo || semAcento(`${c.nome} ${c.ccu}`).includes(termo)));

  function abrir() {
    setMarcados(new Set(aplicado ? aplicado.filter((c) => CENTROS.some((o) => o.ccu === c)) : CENTROS.map((c) => c.ccu)));
    setBusca("");
    setAberto((v) => !v);
  }
  const alternar = (ccu: string) => setMarcados((m) => { const n = new Set(m); if (n.has(ccu)) n.delete(ccu); else n.add(ccu); return n; });
  const alternarGrupo = (area: Area) => setMarcados((m) => {
    const n = new Set(m); const todos = POR_AREA[area].every((c) => n.has(c));
    for (const c of POR_AREA[area]) { if (todos) n.delete(c); else n.add(c); }
    return n;
  });
  const soArea = (area: Area) => setMarcados(new Set(POR_AREA[area]));
  function aplicar() {
    if (marcados.size === 0) return;
    gravarSelecao(marcados.size === TOTAL ? null : Array.from(marcados));
    window.location.reload();
  }

  if (aplicado === undefined) return <div className={`h-[38px] w-44 ${className}`} aria-hidden />;
  const filtrando = !!aplicado;

  return (
    <div className={`relative ${className}`} ref={raiz}>
      <button
        type="button"
        onClick={abrir}
        aria-haspopup="dialog"
        aria-expanded={aberto}
        title="Escolher quais contratos (centros de custo) ver: Engenharia, Ambiental, Administrativo ou qualquer combinação"
        className={`flex h-[38px] items-center gap-2 whitespace-nowrap rounded-lg border px-3 text-sm transition-colors ${filtrando ? "border-brand bg-brand/10 font-medium text-brand-dark" : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50"}`}
      >
        <span>{rotulo}</span>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="m6 9 6 6 6-6" /></svg>
      </button>

      {aberto && (
        <div role="dialog" aria-label="Escolher contratos" className="absolute left-0 top-11 z-50 w-[25rem] max-w-[92vw] rounded-xl border border-gray-200 bg-white p-3 shadow-lg">
          {erro ? <div role="alert" className="p-3 text-sm text-red-700">{erro}<button type="button" onClick={() => setTentativa((t) => t + 1)} className="mt-2 block text-xs font-medium underline">Tentar novamente</button></div> : opcoes === null ? <p className="p-3 text-sm text-gray-500">Carregando contratos…</p> : <>
          {!obrigacoesFinanceiras && <p className="mb-2 text-xs text-gray-500">{incluirForaDosResultados ? "Contratos liberados para você, incluindo o histórico." : "Contratos incluídos nos resultados e liberados para você."}</p>}
          <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Procurar na lista…" autoFocus className="mb-2 w-full rounded-lg border border-gray-200 px-3 py-1.5 text-sm outline-none focus:border-brand" />

          <div className="mb-2 flex flex-wrap items-center gap-1.5">
            <button type="button" onClick={() => setMarcados(new Set(CENTROS.map((c) => c.ccu)))} className="rounded-full border border-gray-200 px-2.5 py-1 text-xs text-gray-700 hover:bg-gray-50">Todos</button>
            {AREAS.filter((a) => POR_AREA[a.valor].length > 0).map((a) => (
              <button key={a.valor} type="button" onClick={() => soArea(a.valor)} className="rounded-full border border-gray-200 px-2.5 py-1 text-xs text-gray-700 hover:bg-gray-50" title={`Ver só ${a.rotulo.toLowerCase()} (${POR_AREA[a.valor].length})`}>
                Só {a.rotulo.toLowerCase()} <span className="text-gray-400">{POR_AREA[a.valor].length}</span>
              </button>
            ))}
          </div>

          <div className="max-h-80 overflow-y-auto rounded-lg border border-gray-100">
            {AREAS.map((a) => {
              const linhas = visiveis(a.valor);
              if (linhas.length === 0) return null;
              const todos = POR_AREA[a.valor].every((c) => marcados.has(c));
              const algum = POR_AREA[a.valor].some((c) => marcados.has(c));
              return (
                <div key={a.valor}>
                  <label className="sticky top-0 z-10 flex cursor-pointer items-center gap-2 border-b border-gray-100 bg-gray-50 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-gray-600">
                    <input type="checkbox" checked={todos} ref={(el) => { if (el) el.indeterminate = algum && !todos; }} onChange={() => alternarGrupo(a.valor)} className="accent-teal-600" />
                    {a.rotulo} <span className="font-normal normal-case text-gray-400">({POR_AREA[a.valor].filter((c) => marcados.has(c)).length}/{POR_AREA[a.valor].length})</span>
                  </label>
                  {linhas.map((c) => (
                    <label key={c.ccu} className="flex cursor-pointer items-center gap-2 px-3 py-1 text-[13px] text-gray-800 hover:bg-gray-50" title={`${c.nome} (CCU ${c.ccu})`}>
                      <input type="checkbox" checked={marcados.has(c.ccu)} onChange={() => alternar(c.ccu)} className="accent-teal-600" />
                      <span className="min-w-0 flex-1 truncate">{c.nome}</span>
                      <span className="shrink-0 text-[11px] tabular-nums text-gray-400">{c.ccu}</span>
                    </label>
                  ))}
                </div>
              );
            })}
            {AREAS.every((a) => visiveis(a.valor).length === 0) && <p className="px-3 py-4 text-center text-xs text-gray-400">Nenhum contrato com esse texto.</p>}
          </div>

          <div className="mt-2 flex items-center justify-between gap-2">
            <span className="text-xs text-gray-500">{marcados.size} de {TOTAL} marcados{marcados.size === 0 ? " · marque ao menos um" : marcados.size === TOTAL ? " · sem filtro" : ""}</span>
            <div className="flex gap-1.5">
              <button type="button" onClick={() => setAberto(false)} className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50">Cancelar</button>
              <button type="button" onClick={aplicar} disabled={marcados.size === 0} className="rounded-lg bg-brand px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-dark disabled:cursor-not-allowed disabled:opacity-40">Aplicar</button>
            </div>
          </div>
          </>}
        </div>
      )}
    </div>
  );
}
