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
  nfs: string[];
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
  const [detalhe, setDetalhe] = useState<any | null>(null);
  const [detalheOc, setDetalheOc] = useState<Oc | null>(null);
  const [notas, setNotas] = useState<any | null>(null);
  const [ocupadoNf, setOcupadoNf] = useState<string | null>(null);
  const [carregandoDetalhe, setCarregandoDetalhe] = useState<string | null>(null);

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

  function carregarNotas(oc: Oc) {
    setNotas(null);
    fetch(`/api/conferencia-oc/notas?numOcp=${oc.numOcp}&codFil=${oc.codFil}`)
      .then(json)
      .then((d) => {
        setNotas(d);
        setOcs((l) => l.map((o) => (o.numOcp === oc.numOcp && o.codFil === oc.codFil ? { ...o, nfs: d.associadas.map((a: any) => a.numeroNf) } : o)));
      })
      .catch((e) => setNotas({ erro: e.message, associadas: [], sugestoes: [] }));
  }

  async function mudarAssociacao(oc: Oc, chaveAcesso: string, metodo: "POST" | "DELETE") {
    setOcupadoNf(chaveAcesso);
    try {
      await fetch("/api/conferencia-oc/associar-nf", {
        method: metodo,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ numOcp: oc.numOcp, codFil: oc.codFil, chaveAcesso }),
      }).then(json);
      carregarNotas(oc);
    } catch (e) {
      setAviso(`OC ${oc.numOcp}: ${(e as Error).message}`);
    } finally {
      setOcupadoNf(null);
    }
  }

  function conferir(oc: Oc) {
    setCarregandoDetalhe(oc.numOcp);
    setAviso(null);
    fetch(`/api/conferencia-oc/detalhe?numOcp=${oc.numOcp}&codFil=${oc.codFil}`)
      .then(json)
      .then((d) => {
        setDetalhe(d);
        setDetalheOc(oc);
        carregarNotas(oc);
      })
      .catch((e) => setAviso(`OC ${oc.numOcp}: ${e.message}`))
      .finally(() => setCarregandoDetalhe(null));
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
      setDetalhe(null);
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
              <th className="px-3 py-2 font-medium">NF</th>
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
                <td className="px-3 py-1.5 text-gray-600">{o.nfs.length ? o.nfs.join(", ") : <span className="text-gray-300">—</span>}</td>
                <td className="px-3 py-1.5">
                  {o.numTit ? (
                    <span className="font-medium text-gray-800" title={o.tituloGeradoAqui ? "Gerado por esta tela" : "Informado na OC (USU_NUMTIT)"}>
                      {o.numTit}
                    </span>
                  ) : (
                    <button
                      onClick={() => conferir(o)}
                      disabled={carregandoDetalhe === o.numOcp}
                      className="rounded-lg border border-brand px-2.5 py-1 text-[11px] font-medium text-brand disabled:opacity-50"
                    >
                      {carregandoDetalhe === o.numOcp ? "Consultando…" : "Conferir / gerar título"}
                    </button>
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
                <td colSpan={9} className="px-4 py-6 text-center text-gray-400">
                  {loading ? "Consultando a Senior…" : "Nenhuma OC com vencimento nesse período/filtro."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {detalhe && detalheOc && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4" onClick={() => setDetalhe(null)}>
          <div className="my-6 w-full max-w-3xl rounded-xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">
                  OC {detalhe.oc.numOcp} — {detalhe.oc.fornecedorNome ?? `Fornecedor ${detalhe.oc.codFor}`}
                </h2>
                <p className="text-sm text-gray-500">
                  Vencimento {dataBr(detalhe.oc.vencimento)} · {moeda(detalhe.oc.valor)} · filial {detalhe.oc.codFil}
                </p>
              </div>
              <button onClick={() => setDetalhe(null)} className="text-gray-400 hover:text-gray-600" aria-label="Fechar">
                ✕
              </button>
            </div>
            {detalhe.oc.descricao && <p className="mb-3 rounded-lg bg-gray-50 p-2.5 text-[13px] text-gray-700">{detalhe.oc.descricao}</p>}

            <h3 className="mb-1.5 text-sm font-semibold">Aprovação multinível</h3>
            {detalhe.aprovacao ? (
              <div className="mb-4 text-[13px]">
                <p className={`mb-2 rounded-lg px-3 py-2 font-medium ${detalhe.aprovacao.completa ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-900"}`}>
                  {detalhe.aprovacao.completa
                    ? `Totalmente aprovada (níveis exigidos: ${detalhe.aprovacao.nivelExigido ?? "—"})`
                    : detalhe.aprovacao.motivoIncompleta}
                </p>
                {detalhe.aprovacao.eventos.length > 0 && (
                  <table className="mb-2 w-full">
                    <thead className="text-left text-[11px] uppercase text-gray-500">
                      <tr>
                        <th className="py-1">Nível</th>
                        <th>Centro de custo</th>
                        <th>Aprovador</th>
                        <th>Data</th>
                        <th>Situação</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detalhe.aprovacao.eventos.map((e: any, i: number) => (
                        <tr key={i} className="border-t border-gray-100">
                          <td className="py-1">{e.nivel}</td>
                          <td>{e.codCcu}</td>
                          <td>{e.por.nome}</td>
                          <td>{dataBr(e.data)}</td>
                          <td className={e.situacao === "APR" ? "text-emerald-700" : "text-red-700"}>{e.situacao === "APR" ? "Aprovou" : "Reprovou"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
                {detalhe.aprovacao.niveisPendentes.length > 0 && (
                  <p className="mb-2 text-amber-800">Nível(is) sem aprovação: {detalhe.aprovacao.niveisPendentes.join(", ")}</p>
                )}
                <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-gray-400">Aprovadores cadastrados por centro de custo</p>
                {detalhe.aprovacao.ccus.map((c: any) => (
                  <p key={c.codCcu} className="text-gray-600">
                    <strong>{c.codCcu}</strong> {c.descricao ?? ""} ({c.percentual}%):{" "}
                    {c.aprovadoresCadastrados.map((n: any) => `N${n.nivel} ${n.pessoas.map((p: any) => p.nome).join("/") || "—"}`).join(" · ")}
                  </p>
                ))}
              </div>
            ) : (
              <p className="mb-4 text-sm text-red-700">Não foi possível ler a aprovação desta OC.</p>
            )}

            <h3 className="mb-1.5 text-sm font-semibold">Nota fiscal</h3>
            <div className="mb-4 text-[13px]">
              {!notas ? (
                <p className="text-gray-500">Buscando notas no eDocs…</p>
              ) : (
                <>
                  {notas.erro && <p className="mb-2 text-red-700">{notas.erro}</p>}
                  {notas.avisoEdocs && <p className="mb-2 text-amber-800">{notas.avisoEdocs}</p>}
                  {notas.associadas.length > 0 && (
                    <div className="mb-2">
                      <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-gray-400">Associadas a esta OC</p>
                      {notas.associadas.map((a: any) => (
                        <div key={a.chaveAcesso} className="flex flex-wrap items-center justify-between gap-2 border-t border-gray-100 py-1.5">
                          <span>
                            <strong>NF {a.numeroNf}</strong> série {a.serie} · {a.emitente} · {moeda(a.valor)} · emitida {dataBr(a.emissao ? String(a.emissao).slice(0, 10) : null)}
                            <br />
                            <span className="text-gray-500">
                              {a.naSenior?.lancada ? "Lançada no Senior" : "Ainda não lançada no Senior"}
                              {a.naSenior?.tituloDaNf ? ` · título gerado pela NF: ${a.naSenior.tituloDaNf}` : ""} · associada por {a.associadoPor}
                            </span>
                          </span>
                          <button onClick={() => mudarAssociacao(detalheOc, a.chaveAcesso, "DELETE")} disabled={ocupadoNf === a.chaveAcesso} className="text-[12px] text-red-700 underline disabled:opacity-50">
                            desfazer
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-gray-400">Sugestões do eDocs (você escolhe)</p>
                  {notas.sugestoes.length === 0 && <p className="text-gray-500">Nenhuma nota recebida bate com o fornecedor desta OC. Sem NF ainda (compra pela internet ou fatura internacional), gere o título e associe depois.</p>}
                  {notas.sugestoes.map((s: any) => (
                    <div key={s.nota.chave} className="flex flex-wrap items-center justify-between gap-2 border-t border-gray-100 py-1.5">
                      <span>
                        <strong>NF {s.nota.numero}</strong> série {s.nota.serie} · {s.nota.emitente} · {moeda(s.nota.valor)} · {dataBr(s.nota.emissao)}
                        <br />
                        <span className="text-gray-500">
                          {s.motivos.join(" · ")} ({s.pontos} pts)
                          {s.tambemAssociadaA.length ? ` · já associada à OC ${s.tambemAssociadaA.join(", ")}` : ""}
                        </span>
                      </span>
                      <button onClick={() => mudarAssociacao(detalheOc, s.nota.chave, "POST")} disabled={ocupadoNf === s.nota.chave} className="rounded-lg border border-brand px-2.5 py-1 text-[12px] font-medium text-brand disabled:opacity-50">
                        Associar
                      </button>
                    </div>
                  ))}
                </>
              )}
            </div>

            <h3 className="mb-1.5 text-sm font-semibold">Dados de pagamento que vão no título</h3>
            <div className="mb-4 space-y-0.5 text-[13px] text-gray-700">
              <p>Forma de pagamento: {detalhe.pagamento.formaPagamento ?? detalhe.pagamento.codFpg ?? "—"}</p>
              <p>
                Conta:{" "}
                {detalhe.pagamento.conta
                  ? `banco ${detalhe.pagamento.conta.banco} · ag. ${detalhe.pagamento.conta.agencia} · conta ${detalhe.pagamento.conta.conta} (${detalhe.pagamento.conta.fonte === "oc" ? "digitada na OC" : "cadastro do fornecedor"})`
                  : "não identificada"}
              </p>
              <p>PIX: {detalhe.pagamento.pix ? `${detalhe.pagamento.pix.valor} (tipo ${detalhe.pagamento.pix.tipo})` : "não informado"}</p>
              <p>Favorecido (CPF/CNPJ, só para conferência — não vai no título): {detalhe.pagamento.documentoFavorecido ?? "—"}</p>
              {detalhe.pagamento.avisos.map((a: string, i: number) => (
                <p key={i} className="text-amber-800">
                  ⚠ {a}
                </p>
              ))}
            </div>

            {(() => {
              const assoc: any[] = notas?.associadas ?? [];
              const comTitulo = assoc.find((a) => a.naSenior?.tituloDaNf);
              const naoLancada = assoc.filter((a) => !a.naSenior?.lancada);
              if (comTitulo)
                return <p className="mb-2 rounded-lg bg-emerald-50 px-3 py-2 text-[13px] text-emerald-800">A NF {comTitulo.numeroNf} já gerou o título {comTitulo.naSenior.tituloDaNf} na Senior — siga na Programação de Pagamento.</p>;
              if (naoLancada.length)
                return <p className="mb-2 rounded-lg bg-amber-50 px-3 py-2 text-[13px] text-amber-900">NF {naoLancada.map((a) => a.numeroNf).join(", ")} ainda não lançada na Senior. Lance a NF na Senior (o título nasce da entrada) antes de gerar título por aqui.</p>;
              return null;
            })()}
            <div className="flex items-center justify-end gap-2">
              {detalhe.numTit ? (
                <span className="text-sm text-gray-600">
                  Título já existente: <strong>{detalhe.numTit}</strong>
                </span>
              ) : (
                <button
                  onClick={() => gerarTitulo(detalheOc)}
                  disabled={!detalhe.podeGerar || gerando === detalheOc.numOcp || !!notas?.associadas?.some((a: any) => a.naSenior?.tituloDaNf)}
                  title={detalhe.podeGerar ? "" : "Só gera com aprovação completa e valor na OC"}
                  className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
                >
                  {gerando === detalheOc.numOcp ? "Gerando…" : "Gerar título"}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {ocAberta && <MapaOC aprovacao={ocAberta} codToNome={codToNomeOC} titulosVinculados={titulosDaOC} onClose={() => setOcAberta(null)} />}
    </div>
  );
}
