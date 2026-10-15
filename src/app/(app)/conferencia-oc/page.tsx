"use client";

import { useEffect, useMemo, useState } from "react";
import MapaOC, { type Aprovacao, type TituloVinculado } from "@/components/MapaOC";

// Conferência de OC: todas as OCs da Senior com vencimento no período (com ou sem
// título). O financeiro confere, gera o título a partir da OC e baixa os dossiês.

type Oc = {
  numOcp: string;
  codFil: string;
  codFor: string;
  fornecedorNome: string | null;
  emissao: string | null;
  vencimento: string | null;
  valor: number;
  sitApr: string;
  numTit: string | null;
  tituloGeradoAqui: boolean;
  numNfc: string | null;
  descricao: string | null;
  dossieId: string | null;
};

const SIT_LABEL: Record<string, string> = {
  APR: "Aprovada",
  ANA: "Em análise",
  PRE: "Pré-aprovada",
  REP: "Reprovada",
  CAN: "Cancelada",
};
const SIT_CLASSE: Record<string, string> = {
  APR: "bg-emerald-100 text-emerald-800",
  ANA: "bg-amber-100 text-amber-800",
  PRE: "bg-sky-100 text-sky-800",
  REP: "bg-red-100 text-red-700",
  CAN: "bg-gray-200 text-gray-600",
};

const moeda = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const dataBr = (iso: string | null) => (iso ? iso.split("-").reverse().join("/") : "—");
const hojeIso = (dias = 0) => new Date(Date.now() + dias * 86_400_000).toISOString().slice(0, 10);

export default function ConferenciaOcPage() {
  const [de, setDe] = useState(hojeIso());
  const [ate, setAte] = useState(hojeIso(7));
  const [ocs, setOcs] = useState<Oc[]>([]);
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const [busca, setBusca] = useState("");
  const [sitSel, setSitSel] = useState<string[]>([]); // vazio = todas
  const [tituloFiltro, setTituloFiltro] = useState<"todos" | "sem" | "com">("todos");
  const [selecionadas, setSelecionadas] = useState<Set<string>>(new Set());
  const [gerando, setGerando] = useState<string | null>(null);
  const [baixando, setBaixando] = useState(false);

  const [ocAberta, setOcAberta] = useState<Aprovacao | null>(null);
  const [codToNomeOC, setCodToNomeOC] = useState<Record<string, string>>({});
  const [titulosDaOC, setTitulosDaOC] = useState<TituloVinculado[]>([]);
  const [carregandoOC, setCarregandoOC] = useState<string | null>(null);

  async function json(res: Response) {
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Erro na requisição");
    return data;
  }

  function carregar() {
    setLoading(true);
    setErro(null);
    fetch(`/api/conferencia-oc?de=${de}&ate=${ate}`)
      .then(json)
      .then((d) => {
        setOcs(d.ocs ?? []);
        setSelecionadas(new Set());
      })
      .catch((e) => setErro(e.message))
      .finally(() => setLoading(false));
  }

  useEffect(carregar, []); // eslint-disable-line react-hooks/exhaustive-deps

  function abrirOC(numOcp: string) {
    setCarregandoOC(numOcp);
    fetch(`/api/senior/aprovacoes/${numOcp}`)
      .then(json)
      .then((d) => {
        setOcAberta(d.aprovacao);
        setCodToNomeOC(d.codToNome ?? {});
        setTitulosDaOC(d.titulosVinculados ?? []);
      })
      .catch((e) => setAviso(`OC ${numOcp}: ${e.message}`))
      .finally(() => setCarregandoOC(null));
  }

  async function gerarTitulo(oc: Oc) {
    const numTit = window.prompt(`Número do título para a OC ${oc.numOcp} (${oc.fornecedorNome ?? oc.codFor}, ${moeda(oc.valor)}, venc. ${dataBr(oc.vencimento)}):`)?.trim();
    if (!numTit) return;
    if (!window.confirm(`Gerar na Senior o título OUT ${numTit} de ${moeda(oc.valor)} para a OC ${oc.numOcp}?`)) return;
    setGerando(oc.numOcp);
    setAviso(null);
    try {
      const r = await fetch("/api/conferencia-oc/gerar-titulo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ numOcp: oc.numOcp, codFil: oc.codFil, numTit }),
      }).then(json);
      setOcs((l) => l.map((o) => (o.numOcp === oc.numOcp && o.codFil === oc.codFil ? { ...o, numTit: r.numTit, tituloGeradoAqui: true } : o)));
      setAviso([`Título ${r.codTpt} ${r.numTit} gerado na Senior.`, ...(r.avisos ?? [])].join(" "));
    } catch (e) {
      setAviso(`OC ${oc.numOcp}: ${(e as Error).message}`);
    } finally {
      setGerando(null);
    }
  }

  async function baixarDossies() {
    setBaixando(true);
    try {
      const res = await fetch("/api/conferencia-oc/dossies-zip", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ocs: [...selecionadas] }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Erro ao gerar o ZIP");
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement("a");
      a.href = url;
      a.download = `dossies-oc-${hojeIso()}.zip`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setAviso((e as Error).message);
    } finally {
      setBaixando(false);
    }
  }

  const filtradas = useMemo(() => {
    const t = busca.trim().toLowerCase();
    return ocs
      .filter((o) => !sitSel.length || sitSel.includes(o.sitApr))
      .filter((o) => tituloFiltro === "todos" || (tituloFiltro === "com") === !!o.numTit)
      .filter((o) => !t || o.numOcp.includes(t) || (o.fornecedorNome ?? "").toLowerCase().includes(t) || (o.numTit ?? "").toLowerCase().includes(t));
  }, [ocs, busca, sitSel, tituloFiltro]);

  const total = useMemo(() => filtradas.reduce((s, o) => s + o.valor, 0), [filtradas]);
  const chave = (o: Oc) => o.numOcp;
  const todasMarcadas = filtradas.length > 0 && filtradas.every((o) => selecionadas.has(chave(o)));

  function alternar(o: Oc) {
    setSelecionadas((s) => {
      const n = new Set(s);
      n.has(chave(o)) ? n.delete(chave(o)) : n.add(chave(o));
      return n;
    });
  }

  return (
    <div className="p-6">
      <div className="mb-5">
        <h1 className="text-xl font-semibold">Conferência de OC</h1>
        <p className="mt-0.5 text-sm text-gray-500">
          Todas as ordens de compra da Senior com vencimento no período, com ou sem título. Confira a OC e a aprovação; estando
          aprovada, gere o título a partir dela.
        </p>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-gray-100 bg-white p-3.5 shadow-sm">
        <span className="text-[11px] font-medium uppercase tracking-wide text-gray-400">Vencimento</span>
        <input type="date" value={de} onChange={(e) => setDe(e.target.value)} className="rounded-lg border border-gray-200 px-2 py-1.5 text-sm" />
        <span className="text-sm text-gray-500">até</span>
        <input type="date" value={ate} onChange={(e) => setAte(e.target.value)} className="rounded-lg border border-gray-200 px-2 py-1.5 text-sm" />
        <button onClick={carregar} disabled={loading || !de || !ate || de > ate} className="rounded-lg bg-brand px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50">
          {loading ? "Consultando a Senior…" : "Buscar"}
        </button>
        <input type="text" placeholder="OC, fornecedor ou título…" value={busca} onChange={(e) => setBusca(e.target.value)} className="ml-2 w-56 rounded-lg border border-gray-200 px-3 py-1.5 text-sm" />
        <select value={tituloFiltro} onChange={(e) => setTituloFiltro(e.target.value as any)} className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm">
          <option value="todos">Com e sem título</option>
          <option value="sem">Sem título</option>
          <option value="com">Com título</option>
        </select>
        <div className="flex flex-wrap items-center gap-1.5">
          {Object.keys(SIT_LABEL).map((s) => (
            <button
              key={s}
              onClick={() => setSitSel((a) => (a.includes(s) ? a.filter((x) => x !== s) : [...a, s]))}
              className={`rounded-full border px-2.5 py-1 text-[11px] font-medium ${sitSel.includes(s) ? "border-brand bg-brand text-white" : "border-gray-200 bg-white text-gray-500 hover:bg-gray-50"}`}
            >
              {SIT_LABEL[s]}
            </button>
          ))}
        </div>
        <button
          onClick={baixarDossies}
          disabled={!selecionadas.size || baixando}
          className="ml-auto rounded-lg border border-brand px-3 py-1.5 text-sm font-medium text-brand disabled:opacity-40"
        >
          {baixando ? "Montando ZIP…" : `Baixar dossiês (${selecionadas.size})`}
        </button>
      </div>

      {erro && <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700">{erro}</div>}
      {aviso && (
        <div className="mb-4 cursor-pointer rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-900" onClick={() => setAviso(null)}>
          {aviso} <span className="text-amber-600">(clique pra fechar)</span>
        </div>
      )}

      <p className="mb-2 text-sm text-gray-500">
        {filtradas.length} OC{filtradas.length === 1 ? "" : "s"} · total {moeda(total)}
      </p>

      <div className="overflow-x-auto rounded-xl border border-gray-100 bg-white shadow-sm">
        <table className="w-full text-[13px]">
          <thead className="bg-gray-50 text-left text-[11px] uppercase tracking-wide text-gray-500">
            <tr>
              <th className="px-3 py-2">
                <input
                  type="checkbox"
                  checked={todasMarcadas}
                  onChange={() => setSelecionadas(todasMarcadas ? new Set() : new Set(filtradas.map(chave)))}
                  aria-label="Selecionar todas"
                />
              </th>
              <th className="px-3 py-2 font-medium">Vencimento</th>
              <th className="px-3 py-2 font-medium">OC</th>
              <th className="px-3 py-2 font-medium">Fornecedor</th>
              <th className="px-3 py-2 text-right font-medium">Valor</th>
              <th className="px-3 py-2 font-medium">Aprovação</th>
              <th className="px-3 py-2 font-medium">Título</th>
              <th className="px-3 py-2 font-medium">Dossiê</th>
            </tr>
          </thead>
          <tbody>
            {filtradas.map((o, i) => (
              <tr key={`${o.codFil}-${o.numOcp}`} className={i % 2 === 1 ? "bg-gray-50/60" : undefined}>
                <td className="px-3 py-1.5">
                  <input type="checkbox" checked={selecionadas.has(chave(o))} onChange={() => alternar(o)} aria-label={`Selecionar OC ${o.numOcp}`} />
                </td>
                <td className="px-3 py-1.5 tabular-nums text-gray-500">{dataBr(o.vencimento)}</td>
                <td className="px-3 py-1.5">
                  <button
                    onClick={() => abrirOC(o.numOcp)}
                    disabled={carregandoOC === o.numOcp}
                    title={o.descricao ?? "Abrir o descritivo da OC"}
                    className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-700 underline decoration-dotted underline-offset-2 disabled:opacity-50"
                  >
                    OC {o.numOcp}
                    {carregandoOC === o.numOcp && "…"}
                  </button>
                </td>
                <td className="max-w-[240px] truncate px-3 py-1.5" title={o.fornecedorNome ?? ""}>
                  {o.fornecedorNome || `Fornecedor ${o.codFor}`}
                </td>
                <td className="px-3 py-1.5 text-right tabular-nums">{moeda(o.valor)}</td>
                <td className="px-3 py-1.5">
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${SIT_CLASSE[o.sitApr] ?? "bg-gray-100 text-gray-700"}`}>
                    {SIT_LABEL[o.sitApr] ?? (o.sitApr || "—")}
                  </span>
                </td>
                <td className="px-3 py-1.5">
                  {o.numTit ? (
                    <span className="font-medium text-gray-800" title={o.tituloGeradoAqui ? "Gerado por esta tela" : "Informado na OC (USU_NUMTIT)"}>
                      {o.numTit}
                    </span>
                  ) : o.sitApr === "APR" && o.valor > 0 ? (
                    <button
                      onClick={() => gerarTitulo(o)}
                      disabled={gerando === o.numOcp}
                      className="rounded-lg bg-brand px-2.5 py-1 text-[11px] font-medium text-white disabled:opacity-50"
                    >
                      {gerando === o.numOcp ? "Gerando…" : "Gerar título"}
                    </button>
                  ) : (
                    <span className="text-gray-400" title={o.sitApr === "APR" ? "OC sem valor no cabeçalho (compra de itens): gere o título direto na Senior" : "Só gera título de OC totalmente aprovada"}>
                      {o.sitApr === "APR" ? "OC sem valor" : "aguarda aprovação"}
                    </span>
                  )}
                </td>
                <td className="px-3 py-1.5">
                  {o.dossieId ? (
                    <a href={`/api/dossies/${o.dossieId}/arquivo`} target="_blank" rel="noreferrer" className="text-brand underline decoration-dotted underline-offset-2">
                      abrir PDF
                    </a>
                  ) : (
                    <span className="text-gray-400">sem dossiê</span>
                  )}
                </td>
              </tr>
            ))}
            {!filtradas.length && (
              <tr>
                <td colSpan={8} className="px-4 py-6 text-center text-gray-400">
                  {loading ? "Consultando a Senior…" : "Nenhuma OC com vencimento nesse período/filtro."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {ocAberta && <MapaOC aprovacao={ocAberta} codToNome={codToNomeOC} titulosVinculados={titulosDaOC} onClose={() => setOcAberta(null)} />}
    </div>
  );
}
