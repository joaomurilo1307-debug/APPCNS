"use client";

import { useCallback, useEffect, useId, useState } from "react";
import Link from "next/link";
import { alvoPorReducao, CATEGORIAS, FONTES, STATUS_ACAO, STATUS_META } from "@/lib/contractGoals/calculo";
import type { MetaContrato, PessoaMeta, MedicaoMeta } from "@/lib/contractGoals/tipos";
import { AnelProgresso, diaAtual, precisaAtencao, QuadroAcoes, ResumoMetas, type FocoMetas } from "./VisaoMetasContrato";

type Contrato = { id: string; codccu: string; nome: string; canCreate: boolean };
const campo = "rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800 focus:border-brand focus:outline-none";
const botao = "rounded-lg bg-brand px-3 py-2 text-sm font-medium text-white disabled:opacity-50";
const secundario = "rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50";
const data = (valor: string | null) => valor ? valor.slice(0, 10).split("-").reverse().join("/") : "Sem prazo";
const iso = (valor: FormDataEntryValue | null) => valor ? `${valor}T12:00:00.000Z` : null;
const titulo = (tabela: Record<string, string>, chave: string) => tabela[chave] ?? chave;
const modelos = [
  { id: "custo", title: "Reduzir o custo do contrato", category: "CUSTO", kind: "INDICADOR" as const, source: "CUSTO", unit: "R$", nome: "Reduzir custos", texto: "Defina o budget, o período e quanto quer reduzir.", description: "" },
  { id: "glosa", title: "Reduzir glosas das medições", category: "GLOSA", kind: "INDICADOR" as const, source: "MANUAL", unit: "%", nome: "Melhorar a medição", texto: "Acompanhe glosas com indicador e ações de melhoria.", description: "" },
  { id: "livre", title: "Melhorar a rotina do contrato", category: "GERAL", kind: "PLANO" as const, source: "MANUAL", unit: "R$", nome: "Organizar um plano livre", texto: "Comece pelas ações, sem precisar definir números.", description: "" },
];
const numero = (valor: number | null, unidade: string | null) => valor === null ? "Sem medição" : unidade === "R$" ? valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : `${valor.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}${unidade === "%" ? "%" : unidade ? ` ${unidade}` : ""}`;

export default function PainelMetasContrato({ codccu, modo = "metas", goalId, onChange }: { codccu?: string; modo?: "metas" | "acoes"; goalId?: string; onChange?: () => void }) {
  const [metas, setMetas] = useState<MetaContrato[]>([]);
  const [contratos, setContratos] = useState<Contrato[]>([]);
  const [pessoas, setPessoas] = useState<PessoaMeta[]>([]);
  const [filtro, setFiltro] = useState("");
  const [categoria, setCategoria] = useState("");
  const [erro, setErro] = useState("");
  const [carregando, setCarregando] = useState(true);
  const [ocupado, setOcupado] = useState(false);
  const [editor, setEditor] = useState<MetaContrato | "nova" | null>(null);
  const [fonte, setFonte] = useState("MANUAL");
  const [tipo, setTipo] = useState<"INDICADOR" | "PLANO">("INDICADOR");
  const [unidade, setUnidade] = useState("R$");
  const [linhaBase, setLinhaBase] = useState("");
  const [alvo, setAlvo] = useState("");
  const [reducao, setReducao] = useState("");
  const [direcao, setDirecao] = useState("REDUZIR");
  const unidadesId = useId();
  const [historicos, setHistoricos] = useState<Record<string, MedicaoMeta[] | undefined>>({});
  const [acaoEditada, setAcaoEditada] = useState<string | null>(null);
  const [metasArquivadas, setMetasArquivadas] = useState(false);
  const [visao, setVisao] = useState<"metas" | "acoes">(modo === "acoes" ? "acoes" : "metas");
  const [pesquisa, setPesquisa] = useState("");
  const [responsavel, setResponsavel] = useState("");
  const [situacao, setSituacao] = useState("");
  const [tipoFiltro, setTipoFiltro] = useState("");
  const [foco, setFoco] = useState<FocoMetas>("todas");
  const [abertaId, setAbertaId] = useState<string | null>(null);
  const [modelo, setModelo] = useState<typeof modelos[number] | null>(null);
  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const r = await fetch(`/api/contract-goals${codccu ? `?codccu=${encodeURIComponent(codccu)}` : ""}`, { cache: "no-store" });
      const d = await r.json(); if (!r.ok) throw new Error(d.error || "Não foi possível carregar as metas.");
      setMetas(d.goals); setContratos(d.contratos); setErro("");
    } catch (e) { setErro(e instanceof Error ? e.message : "Falha ao carregar as metas."); }
    finally { setCarregando(false); }
  }, [codccu]);
  useEffect(() => { void carregar(); }, [carregar]);
  useEffect(() => { setAbertaId(null); }, [filtro, categoria, responsavel, situacao, tipoFiltro, metasArquivadas]);

  async function carregarPessoas() {
    if (pessoas.length) return;
    const r = await fetch("/api/pessoas");
    if (r.ok) { const d = await r.json(); if (Array.isArray(d)) setPessoas(d); }
  }
  async function alterar(id: string, corpo: unknown) {
    setOcupado(true); setErro("");
    try {
      const r = await fetch(`/api/contract-goals/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo) });
      const d = await r.json(); if (!r.ok) throw new Error(d.error || "Não foi possível salvar.");
      setHistoricos((h) => ({ ...h, [id]: undefined })); await carregar(); onChange?.(); return true;
    } catch (e) { setErro(e instanceof Error ? e.message : "Falha ao salvar."); return false; }
    finally { setOcupado(false); }
  }
  async function salvarMeta(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); const f = new FormData(e.currentTarget);
    const corpo = {
      title: f.get("title"), description: f.get("description") || null, category: f.get("category"), kind: tipo, unit: tipo === "PLANO" ? null : fonte === "MANUAL" ? f.get("unit") : "R$",
      baselineValue: tipo === "PLANO" ? null : Number(f.get("baselineValue")), targetValue: tipo === "PLANO" ? null : Number(f.get("targetValue")), direction: tipo === "PLANO" ? null : f.get("direction"),
      source: tipo === "PLANO" ? "MANUAL" : fonte, sourceAccount: f.get("sourceAccount") || null, periodStart: f.get("periodStart") || null, periodEnd: f.get("periodEnd") || null,
      dueDate: iso(f.get("dueDate")), ownerId: f.get("ownerId") || null, status: f.get("status") || "ATIVA",
    };
    if (editor && editor !== "nova") { if (await alterar(editor.id, { operation: "goal", ...corpo })) setEditor(null); return; }
    setOcupado(true); setErro("");
    try {
      const r = await fetch("/api/contract-goals", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...corpo, codccu: codccu || f.get("codccu") }) });
      const d = await r.json(); if (!r.ok) throw new Error(d.error || "Não foi possível criar a meta.");
      setEditor(null); await carregar();
    } catch (e) { setErro(e instanceof Error ? e.message : "Falha ao criar a meta."); }
    finally { setOcupado(false); }
  }
  async function historico(id: string) {
    if (historicos[id]) { setHistoricos((h) => ({ ...h, [id]: undefined })); return; }
    try {
      const r = await fetch(`/api/contract-goals/${id}`, { cache: "no-store" }); const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Não foi possível ler o histórico.");
      setHistoricos((h) => ({ ...h, [id]: d.measurements }));
    } catch (e) { setErro(e instanceof Error ? e.message : "Falha no histórico."); }
  }
  const editando = editor && editor !== "nova" ? editor : null;
  const termo = pesquisa.trim().toLocaleLowerCase("pt-BR").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const base = metas.filter((m) => (!goalId || m.id === goalId) && (!filtro || m.contrato.codccu === filtro) && (!categoria || m.category === categoria) && (goalId || metasArquivadas || m.status !== "ARQUIVADA") && (!tipoFiltro || m.kind === tipoFiltro) && (!situacao || m.status === situacao) && (!responsavel || m.ownerId === responsavel || m.actions.some((a) => a.ownerId === responsavel)) && (!termo || `${m.title} ${m.description ?? ""} ${m.contrato.nome} ${m.contrato.codccu} ${m.actions.map((a) => a.title).join(" ")}`.toLocaleLowerCase("pt-BR").normalize("NFD").replace(/[\u0300-\u036f]/g, "").includes(termo)));
  const visiveis = base.filter((m) => foco === "todas" || (foco === "ativas" && m.status === "ATIVA") || (foco === "atingidas" && m.kind === "INDICADOR" && m.fraction === 1) || (foco === "atencao" && precisaAtencao(m, diaAtual())));
  const responsaveis = [...new Map(metas.flatMap((m) => [m.owner, ...m.actions.map((a) => a.owner)]).filter((p): p is PessoaMeta => p !== null).map((p) => [p.id, p])).values()].sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  const abrir = (meta: MetaContrato | "nova", sugestao: typeof modelos[number] | null = null) => {
    setModelo(sugestao); setEditor(meta); setFonte(meta === "nova" ? sugestao?.source ?? "MANUAL" : meta.source);
    setTipo(meta === "nova" ? sugestao?.kind ?? (modo === "acoes" ? "PLANO" : "INDICADOR") : meta.kind);
    setUnidade(meta === "nova" ? sugestao?.unit ?? "R$" : meta.unit ?? "R$");
    setLinhaBase(meta === "nova" || meta.baselineValue === null ? "" : String(meta.baselineValue));
    setAlvo(meta === "nova" || meta.targetValue === null ? "" : String(meta.targetValue));
    setDirecao(meta === "nova" ? "REDUZIR" : meta.direction ?? "REDUZIR"); setReducao("");
    void carregarPessoas();
  };
  const abrirIniciativa = (id: string) => { setAbertaId(id); setVisao("metas"); };
  useEffect(() => {
    if (abertaId && visao === "metas") document.getElementById(`meta-contrato-${abertaId}`)?.scrollIntoView({ block: "start", behavior: "smooth" });
  }, [abertaId, visao]);
  const limparFiltros = () => { setFiltro(""); setCategoria(""); setPesquisa(""); setResponsavel(""); setSituacao(""); setTipoFiltro(""); setFoco("todas"); setAbertaId(null); };
  const calcularReducao = (base: string, percentual: string) => {
    if (base === "" || percentual === "") return;
    const valor = alvoPorReducao(Number(base), Number(percentual));
    if (valor !== null) setAlvo(String(valor));
  };
  const pessoasSelect = (id: string | null, nome?: string) => <select key={`${id ?? "vazio"}:${pessoas.length}`} name={nome ?? "ownerId"} defaultValue={id ?? ""} className={campo}><option value="">Sem responsável</option>{pessoas.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>;

  return <section className="space-y-5">
    <header className="flex flex-wrap items-start justify-between gap-4 rounded-2xl border border-teal-100 bg-gradient-to-br from-teal-50 via-white to-sky-50/70 p-6">
      <div><p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-teal-700">Objetivos · ações · resultados</p><h2 className="text-2xl font-semibold tracking-tight text-gray-900">{modo === "acoes" ? "Planos de Ação" : "Metas e Planos de Ação"}</h2><p className="mt-2 max-w-2xl text-sm leading-relaxed text-gray-500">Defina a melhoria, combine os próximos passos e acompanhe o resultado. Use indicadores de Custos e Medição, registre seu próprio indicador ou organize um plano livre.</p></div>
      {contratos.some((c) => c.canCreate) && <button className={`${botao} shadow-sm`} onClick={() => abrir("nova")}>+ {modo === "acoes" ? "Novo plano" : "Nova meta ou plano"}</button>}
    </header>
    {erro && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{erro}</p>}
    <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-gray-100 bg-white p-4">
      <input aria-label="Buscar metas e ações" value={pesquisa} onChange={(e) => { setPesquisa(e.target.value); setAbertaId(null); }} placeholder="Buscar meta, ação ou contrato…" className={`${campo} min-w-52 flex-1`} />
      {!codccu && <select aria-label="Filtrar contrato" value={filtro} onChange={(e) => setFiltro(e.target.value)} className={campo}><option value="">Todos os contratos acompanhados</option>{contratos.map((c) => <option key={c.id} value={c.codccu}>CCU {c.codccu} · {c.nome}</option>)}</select>}
      <select aria-label="Filtrar categoria" value={categoria} onChange={(e) => setCategoria(e.target.value)} className={campo}><option value="">Todas as categorias</option>{Object.entries(CATEGORIAS).map(([id, nome]) => <option key={id} value={id}>{nome}</option>)}</select>
      <select aria-label="Filtrar pessoa envolvida" value={responsavel} onChange={(e) => setResponsavel(e.target.value)} className={campo}><option value="">Todas as pessoas envolvidas</option>{responsaveis.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
      <select aria-label="Filtrar tipo de iniciativa" value={tipoFiltro} onChange={(e) => setTipoFiltro(e.target.value)} className={campo}><option value="">Metas e planos</option><option value="INDICADOR">Com indicador</option><option value="PLANO">Planos livres</option></select>
      <select aria-label="Filtrar situação da iniciativa" value={situacao} onChange={(e) => setSituacao(e.target.value)} className={campo}><option value="">Todas as situações</option>{Object.entries(STATUS_META).filter(([id]) => id !== "ARQUIVADA" || metasArquivadas).map(([id, nome]) => <option key={id} value={id}>{nome}</option>)}</select>
      <label className="flex items-center gap-2 text-sm text-gray-600"><input type="checkbox" checked={metasArquivadas} onChange={(e) => { setMetasArquivadas(e.target.checked); if (!e.target.checked && situacao === "ARQUIVADA") setSituacao(""); }} />Incluir arquivadas</label>
      <button onClick={() => void carregar()} disabled={carregando} className={`${secundario} ml-auto`}>Recarregar</button>
      {(pesquisa || filtro || categoria || responsavel || situacao || tipoFiltro || foco !== "todas") && <button onClick={limparFiltros} className="text-xs font-medium text-teal-700 hover:underline">Limpar filtros</button>}
    </div>
    {!goalId && (!carregando || metas.length > 0) && <><ResumoMetas metas={base} foco={foco} onFoco={(novo) => { setFoco(novo); setAbertaId(null); }} /><nav className="flex flex-wrap items-center gap-2" aria-label="Visualização das iniciativas">{([["metas", "Metas e resultados"], ["acoes", "Quadro de ações"]] as const).map(([id, nome]) => <button key={id} type="button" aria-pressed={visao === id} onClick={() => { setVisao(id); setAbertaId(null); }} className={`rounded-xl px-4 py-2.5 text-sm font-medium transition ${visao === id ? "bg-slate-900 text-white shadow-sm" : "border border-gray-200 bg-white text-gray-600 hover:bg-gray-50"}`}>{nome}</button>)}<span className="ml-auto text-xs text-gray-400">{visiveis.length} iniciativas no recorte</span></nav></>}
    {abertaId && <div className="flex items-center gap-3 rounded-xl bg-teal-50 px-4 py-3 text-sm text-teal-800"><span>Iniciativa selecionada no quadro</span><button onClick={() => setAbertaId(null)} className="ml-auto font-medium underline">Ver todas as metas</button></div>}
    {editor && <form key={editando?.id ?? modelo?.id ?? "nova"} onSubmit={salvarMeta} className="grid gap-3 rounded-2xl border border-brand/20 bg-white p-5 shadow-soft sm:grid-cols-2">
      <h3 className="font-semibold sm:col-span-2">{editando ? "Editar meta ou plano" : "Nova iniciativa do contrato"}</h3>
      <label className="grid gap-1 text-sm sm:col-span-2">Como acompanhar<select value={tipo} onChange={(e) => { setTipo(e.target.value as "INDICADOR" | "PLANO"); if (e.target.value === "PLANO") setFonte("MANUAL"); }} className={campo}><option value="INDICADOR">Meta com indicador</option><option value="PLANO">Plano de ação livre (sem números)</option></select></label>
      {!codccu && !editando && <label className="grid gap-1 text-sm">Contrato<select name="codccu" required defaultValue={filtro} className={campo}><option value="">Selecione</option>{contratos.filter((c) => c.canCreate).map((c) => <option key={c.id} value={c.codccu}>CCU {c.codccu} · {c.nome}</option>)}</select></label>}
      <label className="grid gap-1 text-sm">Nome<input name="title" required minLength={2} maxLength={200} defaultValue={editando?.title ?? modelo?.title} className={campo} /></label>
      <label className="grid gap-1 text-sm">Categoria<select name="category" defaultValue={editando?.category ?? modelo?.category ?? "GERAL"} className={campo}>{Object.entries(CATEGORIAS).map(([id, nome]) => <option key={id} value={id}>{nome}</option>)}</select></label>
      {tipo === "INDICADOR" && <><label className="grid gap-1 text-sm">Fonte<select value={fonte} onChange={(e) => { setFonte(e.target.value); if (e.target.value !== "MANUAL") setUnidade("R$"); }} className={campo}>{Object.entries(FONTES).map(([id, nome]) => <option key={id} value={id}>{nome}</option>)}</select></label>
      <label className="grid gap-1 text-sm">Unidade<input name="unit" required maxLength={40} list={unidadesId} disabled={fonte !== "MANUAL"} value={unidade} onChange={(e) => setUnidade(e.target.value)} placeholder="R$, %, dias, pontos..." className={campo} /><datalist id={unidadesId}>{["R$", "%", "quantidade", "dias", "horas", "pontos"].map((u) => <option key={u} value={u} />)}</datalist>{fonte !== "MANUAL" && <span className="text-xs text-gray-500">Fonte automática em R$.</span>}</label>
      <label className="grid gap-1 text-sm">Direção<select name="direction" value={direcao} onChange={(e) => { setDirecao(e.target.value); setReducao(""); }} className={campo}><option value="REDUZIR">Reduzir (menor é melhor)</option><option value="AUMENTAR">Aumentar (maior é melhor)</option></select></label>
      <label className="grid gap-1 text-sm">Linha de base<input name="baselineValue" type="number" step="any" required value={linhaBase} onChange={(e) => { setLinhaBase(e.target.value); calcularReducao(e.target.value, reducao); }} className={campo} /></label>
      <label className="grid gap-1 text-sm">Alvo<input name="targetValue" type="number" step="any" required value={alvo} onChange={(e) => { setAlvo(e.target.value); setReducao(""); }} className={campo} /></label>
      {direcao === "REDUZIR" && <label className="grid gap-1 text-sm">Calcular redução (%) · opcional<input type="number" min={0} max={100} step="any" value={reducao} onChange={(e) => { setReducao(e.target.value); calcularReducao(linhaBase, e.target.value); }} placeholder="Ex.: 10 para reduzir 10% da linha de base" className={campo} /><span className="text-xs text-gray-500">Preenche o alvo. Você pode ajustá-lo livremente.</span></label>}</>}
      <label className="grid gap-1 text-sm">Responsável{pessoasSelect(editando?.ownerId ?? null)}</label>
      <label className="grid gap-1 text-sm">Prazo<input name="dueDate" type="date" defaultValue={editando?.dueDate?.slice(0, 10)} className={campo} /></label>
      <label className="grid gap-1 text-sm">Situação<select name="status" defaultValue={editando?.status ?? "ATIVA"} className={campo}>{Object.entries(STATUS_META).map(([id, nome]) => <option key={id} value={id}>{nome}</option>)}</select></label>
      {tipo === "INDICADOR" && fonte !== "MANUAL" && <><label className="grid gap-1 text-sm">Mês inicial<input name="periodStart" type="month" required defaultValue={editando?.periodStart ?? ""} className={campo} /></label><label className="grid gap-1 text-sm">Mês final<input name="periodEnd" type="month" required defaultValue={editando?.periodEnd ?? ""} className={campo} /></label>{fonte === "CUSTO" && <label className="grid gap-1 text-sm sm:col-span-2">Conta financeira (opcional; vazio soma todas)<input name="sourceAccount" defaultValue={editando?.sourceAccount ?? ""} className={campo} placeholder="Nome da conta no plano financeiro" /></label>}<p className="text-xs text-gray-500 sm:col-span-2">O valor vem da cópia local do Senior e exige acesso ao módulo financeiro correspondente. Glosas e faltas são medidas manualmente.</p></>}
      <label className="grid gap-1 text-sm sm:col-span-2">Descrição<textarea name="description" defaultValue={editando?.description ?? modelo?.description ?? ""} maxLength={4000} className={campo} /></label>
      <div className="flex gap-2 sm:col-span-2"><button disabled={ocupado} className={botao}>{ocupado ? "Salvando…" : "Salvar meta"}</button><button type="button" onClick={() => setEditor(null)} className={secundario}>Cancelar</button></div>
    </form>}
    {carregando && metas.length === 0 ? <div className="h-40 animate-pulse rounded-xl bg-gray-100" aria-label="Carregando metas" /> : visiveis.length === 0 ? <div className="space-y-5 rounded-2xl border border-dashed border-teal-200 bg-white p-8 text-center"><div><h3 className="text-lg font-semibold text-gray-800">{metas.length ? "Nenhuma iniciativa neste recorte" : "Um objetivo claro. Um próximo passo."}</h3><p className="mx-auto mt-2 max-w-xl text-sm leading-relaxed text-gray-500">{metas.length ? "Ajuste os filtros para encontrar suas metas e ações." : "Comece com uma melhoria do contrato. Depois, organize as ações e acompanhe o que está mudando. As metas anteriores seguem em Metas gerais e projetos."}</p></div>{metas.length ? <button onClick={limparFiltros} className={secundario}>Limpar filtros</button> : contratos.some((c) => c.canCreate) && <div className="grid gap-3 text-left md:grid-cols-3">{modelos.map((m) => <button key={m.id} type="button" onClick={() => abrir("nova", m)} className="rounded-xl border border-gray-100 bg-gradient-to-br from-teal-50/70 to-white p-5 transition hover:border-teal-300 hover:shadow-soft"><span className="mb-3 block text-xl text-teal-600">↗</span><span className="block text-sm font-semibold text-gray-800">{m.nome}</span><span className="mt-2 block text-xs leading-relaxed text-gray-500">{m.texto}</span><span className="mt-4 block text-xs font-medium text-teal-700">Usar como ponto de partida →</span></button>)}</div>}</div> : visao === "acoes" && !goalId ? <QuadroAcoes metas={visiveis} ocupado={ocupado} onAlterar={(metaId, acaoId, status) => alterar(metaId, { operation: "updateAction", actionId: acaoId, status })} onAbrir={abrirIniciativa} /> : visiveis.filter((g) => !abertaId || g.id === abertaId).map((g) => <article key={g.id} id={`meta-contrato-${g.id}`} className="scroll-mt-6 space-y-4 rounded-2xl border border-gray-100 bg-white p-5 shadow-soft sm:p-6">
      <header className="flex flex-wrap items-start gap-4"><AnelProgresso valor={g.kind === "PLANO" ? g.executionFraction : g.fraction} titulo={g.kind === "PLANO" ? "Execução do plano" : "Avanço até o alvo"} /><div className="min-w-0 flex-1"><p className="text-xs text-gray-500">CCU {g.contrato.codccu} · {g.contrato.nome}</p><h3 className="mt-1 text-lg font-semibold text-gray-900">{g.title}</h3><div className="mt-2 flex flex-wrap items-center gap-2 text-[11px]"><span className="rounded-md bg-slate-100 px-2 py-1 text-slate-600">{titulo(CATEGORIAS, g.category)}</span><span className={`rounded-md px-2 py-1 ${g.status === "CONCLUIDA" ? "bg-teal-50 text-teal-700" : g.status === "ATIVA" ? "bg-sky-50 text-sky-700" : "bg-gray-100 text-gray-500"}`}>{titulo(STATUS_META, g.status)}</span><span className="text-gray-500">{g.owner?.name ?? "Sem responsável"} · {data(g.dueDate)}</span>{precisaAtencao(g, diaAtual()) && <span className="rounded-md bg-amber-50 px-2 py-1 font-medium text-amber-800">Atenção ao plano</span>}</div></div>{g.canManage && <button onClick={() => abrir(g)} className={secundario}>Editar meta</button>}</header>
      {g.description && <p className="text-sm text-gray-600">{g.description}</p>}
      {g.kind === "INDICADOR" ? <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">{[["Linha de base", numero(g.baselineValue, g.unit)], [g.direction === "REDUZIR" ? "Alvo: reduzir para" : "Alvo: aumentar para", numero(g.targetValue, g.unit)], ["Último valor medido", numero(g.currentValue, g.unit)], ["Avanço até o alvo", g.fraction === null ? "Sem medição" : `${Math.round(g.fraction * 100)}%`]].map(([nome, valor]) => <div key={nome} className="rounded-lg bg-gray-50 p-3"><p className="text-xs text-gray-500">{nome}</p><p className="mt-1 font-semibold tabular-nums">{valor}</p></div>)}</div> : <div className="rounded-lg bg-teal-50 p-4 text-sm text-teal-900"><p className="font-medium">Plano de ação livre</p><p className="mt-1">{g.executionFraction === null ? "Defina as ações para acompanhar a execução." : `${Math.round(g.executionFraction * 100)}% das ações concluídas · execução do plano`}</p></div>}
      {g.fraction !== null && <div className="h-2 overflow-hidden rounded-full bg-gray-100"><div className="h-full bg-brand" style={{ width: `${g.fraction * 100}%` }} /></div>}
      {g.kind === "INDICADOR" && <p className="text-xs text-gray-500">{g.source === "CUSTO" ? "Custo pago no mês" : titulo(FONTES, g.source)}{g.periodStart && g.periodEnd ? ` · ${g.periodStart} a ${g.periodEnd}` : ""}{g.sourceUpdatedAt ? ` · atualizado em ${data(g.sourceUpdatedAt)}` : ""}</p>}
      {g.sourceError && <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">{g.sourceError}</p>}
      {g.projects.length > 0 && <div className="flex flex-wrap gap-2 text-xs"><span className="text-gray-500">Projetos associados:</span>{g.projects.map((p) => <Link key={p.id} href={`/projetos/${p.id}`} className="text-brand hover:underline">{p.name}</Link>)}</div>}
      {g.canRecord && <details className="rounded-xl border border-teal-100 bg-teal-50/30 p-3"><summary className="cursor-pointer text-sm font-medium text-teal-800">Registrar nova medição</summary><form className="mt-3 flex flex-wrap items-end gap-2 rounded-lg bg-gray-50 p-3" onSubmit={async (e) => { e.preventDefault(); const form = e.currentTarget; const f = new FormData(form); if (await alterar(g.id, { operation: "measurement", value: Number(f.get("value")), measuredAt: iso(f.get("measuredAt")), period: f.get("period") || null, note: f.get("note") || null })) form.reset(); }}>
        <label className="grid gap-1 text-xs">Valor medido<input name="value" type="number" step="any" required className={`${campo} w-36`} /></label><label className="grid gap-1 text-xs">Data<input name="measuredAt" type="date" required defaultValue={new Date().toLocaleDateString("sv-SE")} className={campo} /></label><label className="grid gap-1 text-xs">Competência<input name="period" type="month" className={campo} /></label><label className="grid min-w-40 flex-1 gap-1 text-xs">Observação<input name="note" maxLength={4000} className={campo} /></label><button disabled={ocupado} className={botao}>Registrar medição</button>
      </form></details>}
      {g.kind === "INDICADOR" && <button onClick={() => void historico(g.id)} className="text-sm font-medium text-brand">{historicos[g.id] ? "Fechar histórico" : "Histórico de medições manuais"}</button>}
      {historicos[g.id] && <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr className="border-b text-xs text-gray-500"><th className="p-2">Data / competência</th><th className="p-2">Valor</th><th className="p-2">Registrado por</th><th className="p-2">Observação</th></tr></thead><tbody>{historicos[g.id]!.map((m) => <tr key={m.id} className="border-b border-gray-100"><td className="p-2">{data(m.measuredAt)}{m.period ? ` · ${m.period}` : ""}</td><td className="p-2">{numero(m.value, g.unit)}</td><td className="p-2">{m.createdBy.name}</td><td className="p-2">{m.note}</td></tr>)}</tbody></table>{historicos[g.id]!.length === 0 && <p className="py-3 text-sm text-gray-500">Nenhuma medição manual registrada.</p>}</div>}
      <section className="space-y-3 border-t border-gray-100 pt-4"><h4 className="font-semibold">Plano de ação <span className="font-normal text-gray-500">· {g.actions.filter((a) => a.status === "CONCLUIDA").length}/{g.actions.length} concluídas</span></h4>
        {g.actions.map((a) => <div key={a.id} className="rounded-lg border border-gray-100 p-3">
          {acaoEditada === a.id ? <form className="flex flex-wrap gap-2" onSubmit={async (e) => { e.preventDefault(); const f = new FormData(e.currentTarget); if (await alterar(g.id, { operation: "updateAction", actionId: a.id, title: f.get("title"), description: f.get("description") || null, status: f.get("status"), ownerId: f.get("ownerId") || null, dueDate: iso(f.get("dueDate")) })) setAcaoEditada(null); }}><input name="title" required minLength={2} defaultValue={a.title} className={`${campo} flex-1`} /><input name="description" aria-label="Descrição da ação" placeholder="Detalhes" defaultValue={a.description ?? ""} maxLength={4000} className={campo} />{pessoasSelect(a.ownerId)}<input name="dueDate" type="date" defaultValue={a.dueDate?.slice(0, 10)} className={campo} /><select name="status" defaultValue={a.status} className={campo}>{Object.entries(STATUS_ACAO).map(([id, nome]) => <option key={id} value={id}>{nome}</option>)}</select><button disabled={ocupado} className={botao}>Salvar</button><button type="button" onClick={() => setAcaoEditada(null)} className={secundario}>Cancelar</button></form> : <div className="flex flex-wrap items-center justify-between gap-2"><div><p className="text-sm font-medium">{a.title}</p><p className="text-xs text-gray-500">{a.owner?.name ?? "Sem responsável"} · {data(a.dueDate)}</p>{a.description && <p className="mt-1 text-sm text-gray-600">{a.description}</p>}</div><div className="flex gap-2">{a.canUpdate ? <select aria-label={`Situação da ação ${a.title}`} disabled={ocupado} value={a.status} onChange={(e) => void alterar(g.id, { operation: "updateAction", actionId: a.id, status: e.target.value })} className={campo}>{Object.entries(STATUS_ACAO).map(([id, nome]) => <option key={id} value={id}>{nome}</option>)}</select> : <span className="text-sm text-gray-500">{titulo(STATUS_ACAO, a.status)}</span>}{g.canManage && <button onClick={() => { setAcaoEditada(a.id); void carregarPessoas(); }} className={secundario}>Editar</button>}</div></div>}
        </div>)}
        {g.canManage && <details onToggle={(e) => { if (e.currentTarget.open) void carregarPessoas(); }}><summary className="cursor-pointer text-sm font-medium text-brand">Adicionar ação</summary><form className="mt-3 grid gap-2 sm:grid-cols-2" onSubmit={async (e) => { e.preventDefault(); const form = e.currentTarget; const f = new FormData(form); if (await alterar(g.id, { operation: "action", title: f.get("title"), description: f.get("description") || null, ownerId: f.get("ownerId") || null, dueDate: iso(f.get("dueDate")), status: "A_FAZER" })) form.reset(); }}><input name="title" aria-label="Nome da ação" placeholder="O que será feito" required minLength={2} maxLength={250} className={campo} />{pessoasSelect(null)}<input name="dueDate" aria-label="Prazo da ação" type="date" className={campo} /><input name="description" aria-label="Descrição da ação" placeholder="Detalhes (opcional)" className={campo} /><button disabled={ocupado} className={`${botao} sm:col-span-2`}>Adicionar ação</button></form></details>}
      </section>
    </article>)}
  </section>;
}
