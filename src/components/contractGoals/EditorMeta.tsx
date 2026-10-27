"use client";

import { useEffect, useId, useState } from "react";
import { alvoPorVariacao, CATEGORIAS, FONTES, STATUS_META } from "@/lib/contractGoals/calculo";
import type { MetaContrato, PessoaMeta } from "@/lib/contractGoals/tipos";

export type ContextoMeta = { id: string; codccu: string; nome: string; canCreate: boolean };
type MetaSetor = { id: string; title: string; unit: string | null; assignedTeam?: { id: string; name: string } | null; configuredWeight?: number; weightedFraction?: number | null };
const campo = "w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800 focus:border-brand focus:outline-none disabled:bg-gray-50";
const label = "grid gap-1.5 text-sm text-gray-700";
const mesAtual = () => new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" }).slice(0, 7);
function deslocarMes(mes: string, delta: number) { const [ano, numero] = mes.split("-").map(Number); const d = new Date(Date.UTC(ano, numero - 1 + delta, 1)); return d.toISOString().slice(0, 7); }
const iso = (valor: FormDataEntryValue | null) => valor ? `${valor}T12:00:00.000Z` : null;

export default function EditorMeta({ meta, codccu, contratos, pessoas, ocupado, onSave, onCancel }: { meta: MetaContrato | null; codccu?: string; contratos: ContextoMeta[]; pessoas: PessoaMeta[]; ocupado: boolean; onSave: (body: Record<string, unknown>, abrirPlano: boolean) => Promise<void>; onCancel: () => void }) {
  const [fonte, setFonte] = useState(meta?.source ?? "MANUAL");
  const [contexto, setContexto] = useState(meta?.contrato?.codccu ?? codccu ?? "");
  const [ccuFonte, setCcuFonte] = useState(meta?.sourceCcu ?? meta?.contrato?.codccu ?? codccu ?? "");
  const [conta, setConta] = useState(meta?.sourceAccount ?? "");
  const [contas, setContas] = useState<string[]>([]);
  const [centrosFonte, setCentrosFonte] = useState<{ codccu: string; nome: string }[]>([]);
  const [erroContas, setErroContas] = useState("");
  const [consultando, setConsultando] = useState(false);
  const [erroConsulta, setErroConsulta] = useState("");
  const [base, setBase] = useState(meta?.baselineValue?.toString() ?? "");
  const [alvo, setAlvo] = useState(meta?.targetValue?.toString() ?? "");
  const [direcao, setDirecao] = useState(meta?.direction ?? "REDUZIR");
  const [modoAlvo, setModoAlvo] = useState(meta?.targetMode ?? "ABSOLUTO");
  const [variacao, setVariacao] = useState(meta?.targetChange?.toString() ?? "");
  const [modoAvaliacao, setModoAvaliacao] = useState(meta?.evaluationMode ?? "PERIODICO");
  const [frequencia, setFrequencia] = useState(meta?.frequency ?? "MENSAL");
  const [inicioBase, setInicioBase] = useState(meta?.baselinePeriodStart ?? deslocarMes(mesAtual(), -1));
  const [fimBase, setFimBase] = useState(meta?.baselinePeriodEnd ?? deslocarMes(mesAtual(), -1));
  const [metasSetor, setMetasSetor] = useState<MetaSetor[]>([]);
  const [metaSetorId, setMetaSetorId] = useState(meta?.parentGoalId ?? meta?.sectorGoal?.id ?? "");
  const [pesoSetor, setPesoSetor] = useState(meta?.contributionWeight?.toString() ?? meta?.sectorGoal?.weight.toString() ?? "");
  const [erroSetor, setErroSetor] = useState("");
  const unidadesId = useId(), ccusId = useId();
  const legado = meta?.kind === "PLANO";
  const configuracaoFixada = !!meta?.measurements.length;
  const automatico = fonte !== "MANUAL";
  const permitePercentual = ["REDUZIR", "AUMENTAR"].includes(direcao);
  const alvoCalculado = modoAlvo === "PERCENTUAL" && base !== "" && variacao !== "" ? alvoPorVariacao(Number(base), Number(variacao), direcao) : null;
  const percentualSemBase = modoAlvo === "PERCENTUAL" && base !== "" && Number(base) === 0;

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/sector-goals", { cache: "no-store", signal: controller.signal }).then(async (r) => { const d = await r.json(); if (!r.ok) throw new Error(d.error || "Metas do setor indisponíveis."); setMetasSetor(Array.isArray(d.goals) ? d.goals : []); }).catch((e) => { if (e.name !== "AbortError") setErroSetor(e.message); });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!automatico) return;
    const controller = new AbortController();
    fetch("/api/contract-goals/source-options", { cache: "no-store", signal: controller.signal }).then(async (r) => { const d = await r.json(); if (r.ok) setCentrosFonte(Array.isArray(d.ccus) ? d.ccus : []); }).catch(() => {});
    return () => controller.abort();
  }, [automatico]);

  useEffect(() => {
    if (fonte !== "CUSTO" || !ccuFonte) { setContas([]); setErroContas(""); return; }
    const controller = new AbortController();
    setContas([]); setErroContas("");
    fetch(`/api/contract-goals/source-options?codccu=${encodeURIComponent(ccuFonte)}`, { cache: "no-store", signal: controller.signal }).then(async (r) => { const d = await r.json(); if (!r.ok) throw new Error(d.error || "Não foi possível consultar as contas."); setContas(Array.isArray(d.accounts) ? d.accounts : []); }).catch((e) => { if (e.name !== "AbortError") setErroContas(e.message); });
    return () => controller.abort();
  }, [ccuFonte, fonte]);

  async function consultarBase() {
    setConsultando(true); setErroConsulta("");
    try {
      const r = await fetch("/api/contract-goals/preview", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ source: fonte, sourceCcu: ccuFonte, codccu: contexto || null, sourceAccount: fonte === "CUSTO" ? conta || null : null, periodStart: inicioBase, periodEnd: fimBase }) });
      const d = await r.json(); if (!r.ok || d.error || d.value === null || d.value === undefined) throw new Error(d.error || "A fonte não possui valor confirmado para este período.");
      setBase(String(d.value));
    } catch (e) { setErroConsulta(e instanceof Error ? e.message : "Não foi possível consultar a referência."); }
    finally { setConsultando(false); }
  }

  return <form onSubmit={async (e) => {
    e.preventDefault(); const f = new FormData(e.currentTarget);
    const numerico = !legado;
    const body: Record<string, unknown> = { title: f.get("title"), description: f.get("description") || null, category: f.get("category"), kind: legado ? "PLANO" : "INDICADOR", codccu: contexto || null, metricName: numerico ? f.get("metricName") || f.get("title") : null,
      source: legado ? "MANUAL" : fonte, sourceCcu: automatico ? ccuFonte : null, sourceAccount: automatico && fonte === "CUSTO" ? conta || null : null, unit: numerico ? automatico ? "R$" : f.get("unit") : null,
      baselineValue: numerico ? Number(base) : null, targetValue: numerico ? modoAlvo === "PERCENTUAL" ? alvoCalculado : Number(alvo) : null, direction: numerico ? direcao : null,
      targetMode: numerico ? modoAlvo : "ABSOLUTO", targetChange: numerico && modoAlvo === "PERCENTUAL" ? Number(variacao) : null, tolerance: numerico && direcao === "MANTER" ? Number(f.get("tolerance")) : 0,
      evaluationMode: legado ? "ACUMULADO" : modoAvaliacao, frequency: frequencia, periodStart: numerico ? f.get("periodStart") || null : null, periodEnd: numerico ? f.get("periodEnd") || null : null,
      baselinePeriodStart: automatico ? inicioBase : null, baselinePeriodEnd: automatico ? fimBase : null, parentGoalId: metaSetorId || null, contributionWeight: metaSetorId ? Number(pesoSetor) : null, ownerId: f.get("ownerId") || null, dueDate: iso(f.get("dueDate")), status: f.get("status") || "ATIVA" };
    // Campos desabilitados não aparecem no FormData. Preserve exatamente a regra
    // original, inclusive campos nulos de registros anteriores.
    if (meta && configuracaoFixada) {
      const campos = ["kind", "unit", "baselineValue", "targetValue", "direction", "source", "sourceAccount", "sourceCcu", "metricName", "periodStart", "periodEnd", "evaluationMode", "frequency", "baselinePeriodStart", "baselinePeriodEnd", "targetMode", "targetChange", "tolerance"] as const;
      for (const campo of campos) body[campo] = meta[campo];
    }
    await onSave(body, f.get("abrirPlano") === "on");
  }} className="space-y-6 rounded-2xl border border-teal-200 bg-white p-5 shadow-soft sm:p-6">
    <header className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-wider text-teal-700">Definir a melhoria</p><h3 className="mt-1 text-xl font-semibold text-gray-900">{meta ? legado ? "Editar plano anterior" : "Editar meta" : "Nova meta"}</h3></div><button type="button" onClick={onCancel} className="rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-600">Fechar</button></header>
    {legado && <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">Este é um plano anterior sem indicador. Ele permanece disponível; novas metas definem primeiro o resultado e recebem seu plano de execução depois.</p>}
    {configuracaoFixada && <p className="rounded-lg border border-sky-100 bg-sky-50 p-3 text-sm text-sky-900">Esta meta já tem resultados registrados. A fonte, a regra e os períodos ficam preservados para manter o histórico. Você pode atualizar o nome, a descrição, o responsável, o prazo e a situação. Para acompanhar outra regra, crie uma nova meta.</p>}
    <fieldset className="grid gap-4 sm:grid-cols-2"><legend className="mb-3 text-sm font-semibold text-gray-900">1. Qual melhoria você quer alcançar?</legend>
      <label className={`${label} sm:col-span-2`}>Nome da meta<input name="title" required minLength={2} maxLength={200} defaultValue={meta?.title ?? ""} placeholder="Descreva a melhoria que deseja alcançar" className={campo} /></label>
      <label className={label}>Categoria<select name="category" defaultValue={meta?.category ?? "GERAL"} className={campo}>{Object.entries(CATEGORIAS).map(([id, nome]) => <option key={id} value={id}>{nome}</option>)}</select></label>
      <label className={label}>{codccu ? "Contrato / centro de custo" : "Contrato ou centro de custo · opcional"}<select value={contexto} disabled={!!meta || !!codccu} onChange={(e) => { setContexto(e.target.value); setCcuFonte(e.target.value); setConta(""); setBase(""); }} className={campo}><option value="">Meta geral, sem contrato</option>{contexto && !contratos.some((c) => c.codccu === contexto) && <option value={contexto}>CCU {contexto}</option>}{contratos.map((c) => <option key={c.id} value={c.codccu}>CCU {c.codccu} · {c.nome}</option>)}</select><span className="text-xs text-gray-500">{codccu ? "O contexto deste contrato já está selecionado." : "A meta pode existir sem vínculo financeiro."}</span></label>
      <label className={`${label} sm:col-span-2`}>Descrição e critério de sucesso<textarea name="description" maxLength={4000} rows={3} defaultValue={meta?.description ?? ""} placeholder="O que precisa mudar e como o resultado será verificado?" className={campo} /></label>
    </fieldset>
    {!legado && <>
      <fieldset disabled={configuracaoFixada} className="grid gap-4 border-t border-gray-100 pt-5 sm:grid-cols-2"><legend className="mb-3 text-sm font-semibold text-gray-900">2. Qual dado mostra o resultado?</legend>
        <label className={label}>Indicador<input name="metricName" maxLength={200} defaultValue={meta?.metricName ?? ""} placeholder="Ex.: custo de PJ, tempo de resposta, retrabalho" className={campo} /></label>
        <label className={label}>Origem do dado<select value={fonte} onChange={(e) => { setFonte(e.target.value); setConta(""); setBase(""); setErroConsulta(""); }} className={campo}>{Object.entries(FONTES).map(([id, nome]) => <option key={id} value={id}>{id === "MANUAL" ? "Indicador próprio · registro manual" : nome}</option>)}</select></label>
        <label className={label}>Unidade{automatico ? <input value="R$" disabled className={campo} /> : <><input name="unit" required maxLength={40} list={unidadesId} defaultValue={meta?.unit ?? "quantidade"} placeholder="%, dias, horas, pontos…" className={campo} /><datalist id={unidadesId}>{["R$", "%", "quantidade", "dias", "horas", "pontos"].map((u) => <option key={u} value={u} />)}</datalist></>}</label>
        {automatico && <label className={label}>Centro de custo da fonte<input aria-label="Centro de custo da fonte" required pattern="[0-9]+" value={ccuFonte} onChange={(e) => { setCcuFonte(e.target.value); setConta(""); setBase(""); }} list={ccusId} placeholder="Código do CCU" className={campo} /><datalist id={ccusId}>{centrosFonte.map((c) => <option key={c.codccu} value={c.codccu}>{c.nome}</option>)}</datalist><span className="text-xs text-gray-500">A consulta respeita seu acesso ao módulo e ao centro de custo.</span></label>}
        {fonte === "CUSTO" && <label className={`${label} sm:col-span-2`}>Conta de custo<select value={conta} onChange={(e) => { setConta(e.target.value); setBase(""); }} disabled={!ccuFonte} className={campo}><option value="">Custo total do centro de custo</option>{conta && !contas.includes(conta) && <option value={conta}>{conta} · configuração anterior</option>}{contas.map((c) => <option key={c} value={c}>{c}</option>)}</select>{erroContas && <span role="status" className="text-xs text-amber-800">{erroContas}</span>}<span className="text-xs text-gray-500">Escolha uma conta existente para acompanhar uma linha específica, como PJ.</span></label>}
      </fieldset>
      <fieldset disabled={configuracaoFixada} className="grid gap-4 border-t border-gray-100 pt-5 sm:grid-cols-2"><legend className="mb-3 text-sm font-semibold text-gray-900">3. Qual mudança será considerada sucesso?</legend>
        <label className={label}>Regra do resultado<select value={direcao} onChange={(e) => { setDirecao(e.target.value); if (!["REDUZIR", "AUMENTAR"].includes(e.target.value)) setModoAlvo("ABSOLUTO"); }} className={campo}><option value="REDUZIR">Reduzir · menor é melhor</option><option value="AUMENTAR">Aumentar · maior é melhor</option><option value="ATINGIR">Atingir um valor</option><option value="MANTER">Manter dentro de uma faixa</option></select></label>
        <label className={label}>Definir o alvo por<select value={modoAlvo} onChange={(e) => setModoAlvo(e.target.value)} className={campo}><option value="ABSOLUTO">Valor desejado</option>{permitePercentual && <option value="PERCENTUAL">Variação percentual sobre a referência</option>}</select><span className="text-xs text-gray-500">No indicador em %, reduzir 15% da referência é diferente de reduzir 15 pontos percentuais. Para pontos percentuais, informe diretamente o valor desejado.</span></label>
        {automatico && <div className="grid gap-3 rounded-xl bg-slate-50 p-4 sm:col-span-2 sm:grid-cols-2"><p className="text-sm font-medium text-slate-700 sm:col-span-2">Período de referência · separado dos meses avaliados</p><label className={label}>Referência inicial<input type="month" required value={inicioBase} onChange={(e) => { setInicioBase(e.target.value); setBase(""); }} className={campo} /></label><label className={label}>Referência final<input type="month" required min={inicioBase} value={fimBase} onChange={(e) => { setFimBase(e.target.value); setBase(""); }} className={campo} /></label><button type="button" disabled={consultando || !ccuFonte || !inicioBase || !fimBase || inicioBase > fimBase} onClick={() => void consultarBase()} className="rounded-lg border border-teal-200 bg-white px-3 py-2 text-sm font-medium text-teal-800 disabled:opacity-50 sm:col-span-2">{consultando ? "Consultando a fonte…" : "Consultar valor da referência"}</button>{erroConsulta && <p role="alert" className="text-sm text-amber-900 sm:col-span-2">{erroConsulta}</p>}</div>}
        <label className={label}>Valor de referência<input type="number" required step="any" value={base} onChange={(e) => setBase(e.target.value)} className={campo} /><span className="text-xs text-gray-500">É a base fixa usada para comparar os resultados.</span>{percentualSemBase && <span role="status" className="text-xs text-amber-800">Com referência zero, escolha um alvo em valor desejado. A variação percentual não define a mudança.</span>}</label>
        {modoAlvo === "PERCENTUAL" ? <label className={label}>{direcao === "REDUZIR" ? "Redução" : "Aumento"} desejado (%)<input type="number" required min={0} max={direcao === "REDUZIR" ? 100 : undefined} step="any" value={variacao} onChange={(e) => setVariacao(e.target.value)} className={campo} /><span className="text-xs text-teal-700">Alvo: {alvoCalculado === null ? "preencha a referência e o percentual" : alvoCalculado.toLocaleString("pt-BR", { maximumFractionDigits: 4 })} {automatico ? "R$" : ""}</span></label> : <label className={label}>Valor desejado<input type="number" required step="any" value={alvo} onChange={(e) => setAlvo(e.target.value)} className={campo} /></label>}
        {direcao === "MANTER" && <label className={label}>Tolerância acima e abaixo do alvo<input name="tolerance" type="number" min={0} step="any" required defaultValue={meta?.tolerance ?? 0} className={campo} /><span className="text-xs text-gray-500">Na mesma unidade do indicador.</span></label>}
      </fieldset>
      <fieldset disabled={configuracaoFixada} className="grid gap-4 border-t border-gray-100 pt-5 sm:grid-cols-2"><legend className="mb-3 text-sm font-semibold text-gray-900">4. Quando acompanhar?</legend>
        <label className={label}>Tipo de análise<select value={modoAvaliacao} onChange={(e) => setModoAvaliacao(e.target.value)} className={campo}><option value="PERIODICO">Resultado de cada período</option><option value="ACUMULADO">Resultado acumulado no intervalo</option></select></label>
        {modoAvaliacao === "PERIODICO" && <label className={label}>Periodicidade<select value={frequencia} onChange={(e) => setFrequencia(e.target.value)} className={campo}><option value="MENSAL">Mensal</option><option value="TRIMESTRAL">Trimestral</option><option value="SEMESTRAL">Semestral</option><option value="ANUAL">Anual</option></select></label>}
        <label className={label}>Primeiro mês de acompanhamento<input name="periodStart" type="month" required defaultValue={meta?.periodStart ?? mesAtual()} className={campo} /></label>
        <label className={label}>Último mês de acompanhamento<input name="periodEnd" type="month" required defaultValue={meta?.periodEnd ?? deslocarMes(mesAtual(), 11)} className={campo} /></label>
        <p className="text-xs leading-relaxed text-gray-500 sm:col-span-2">Cada período mostra seu realizado e o mesmo alvo. {automatico ? "A fonte financeira soma os meses de cada período." : "O indicador próprio usa o último resultado registrado dentro de cada período."} Períodos em andamento e dados indisponíveis ficam identificados. Concluir atividades não altera o resultado medido.</p>
      </fieldset>
    </>}
    {!legado && <fieldset className="grid gap-4 border-t border-gray-100 pt-5 sm:grid-cols-2"><legend className="mb-3 text-sm font-semibold text-gray-900">5. Como esta meta contribui para o setor?</legend><label className={label}>Meta do setor (opcional)<select value={metaSetorId} onChange={(e) => { setMetaSetorId(e.target.value); if (!e.target.value) setPesoSetor(""); }} className={campo}><option value="">Sem vínculo com uma meta do setor</option>{metaSetorId && !metasSetor.some((m) => m.id === metaSetorId) && <option value={metaSetorId}>{meta?.sectorGoal?.title ?? "Meta vinculada anteriormente"}</option>}{metasSetor.map((m) => <option key={m.id} value={m.id}>{m.title}{m.assignedTeam?.name ? ` · ${m.assignedTeam.name}` : ""}</option>)}</select></label>{metaSetorId && <label className={label}>Peso na meta do setor (%)<input type="number" required min={0.01} max={100} step="any" value={pesoSetor} onChange={(e) => setPesoSetor(e.target.value)} placeholder="Ex.: 80" className={campo} /><span className="text-xs text-gray-500">Exemplo: peso de 80% e avanço de 50% contribuem com 40 pontos percentuais na meta global. Os pesos das metas vinculadas não podem ultrapassar 100%.</span></label>}{erroSetor && <p role="status" className="text-xs text-amber-800 sm:col-span-2">{erroSetor} O vínculo com o setor é opcional.</p>}</fieldset>}
    <fieldset className="grid gap-4 border-t border-gray-100 pt-5 sm:grid-cols-2"><legend className="mb-3 text-sm font-semibold text-gray-900">{legado ? "Responsabilidade" : "6. Quem acompanha e como executar?"}</legend>
      <label className={label}>Responsável pela meta<select name="ownerId" defaultValue={meta?.ownerId ?? ""} className={campo}><option value="">{meta ? "Sem responsável" : "Eu, ao criar a meta"}</option>{meta?.owner && !pessoas.some((p) => p.id === meta.owner!.id) && <option value={meta.owner.id}>{meta.owner.name}</option>}{pessoas.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
      <label className={label}>Prazo da melhoria · opcional<input name="dueDate" type="date" defaultValue={meta?.dueDate?.slice(0, 10)} className={campo} /></label>
      {meta && <label className={label}>Situação<select name="status" defaultValue={meta.status} className={campo}>{Object.entries(STATUS_META).map(([id, nome]) => <option key={id} value={id}>{nome}</option>)}</select></label>}
      {!meta && <label className="flex items-start gap-3 rounded-xl border border-teal-100 bg-teal-50/40 p-4 text-sm sm:col-span-2"><input name="abrirPlano" type="checkbox" className="mt-0.5" /><span><strong className="block text-gray-800">Preparar o plano de ação após salvar</strong><span className="mt-1 block text-gray-500">Organize o plano e suas atividades aqui. Depois, um botão permitirá criar ou associar um projeto, se você quiser.</span></span></label>}
    </fieldset>
    <div className="flex flex-wrap gap-2 border-t border-gray-100 pt-5"><button disabled={ocupado || consultando || percentualSemBase || (modoAlvo === "PERCENTUAL" && alvoCalculado === null)} className="rounded-lg bg-brand px-5 py-2.5 text-sm font-medium text-white disabled:opacity-50">{ocupado ? "Salvando…" : "Salvar meta"}</button><button type="button" onClick={onCancel} className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-600">Cancelar</button></div>
  </form>;
}


