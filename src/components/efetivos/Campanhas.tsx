"use client";

import { useMemo, useState } from "react";
import {
  ATIVIDADES,
  PRIORIDADES,
  STATUS_CAMPANHA,
  STATUS_CAMPANHA_QUE_LIBERAM,
  atendimentoDaCampanha,
  livresNoPeriodo,
  ordenarGrupos,
  type DadosEfetivos,
} from "@/lib/efetivos/disponibilidade";
import { Modal, campo } from "./ui";
import { COR_ATENDIMENTO, COR_STATUS_CAMPANHA, MOTIVO_CONFLITO, chamar, fmtDia, hojeBr, type Campanha, type DadosTela } from "./comum";

type Props = { dados: DadosTela; regra: DadosEfetivos; recarregar: () => Promise<void>; ocultarNomes: boolean };

const vazia = (hoje: string, grupo: string, projeto: string) => ({
  recebidaEm: hoje,
  solicitante: "",
  projeto,
  grupo,
  atividade: "Resgate" as string,
  local: "",
  inicio: hoje,
  fim: hoje,
  qtdEquipes: 1,
  prioridade: "Média" as string,
  status: "Nova" as string,
  observacao: "",
});

export default function Campanhas({ dados, regra, recarregar, ocultarNomes }: Props) {
  const hoje = hojeBr();
  const grupos = ordenarGrupos(dados.equipes.map((e) => e.grupo));
  const projetos = Array.from(new Set(dados.equipes.map((e) => e.projeto)));
  const [filtroGrupo, setFiltroGrupo] = useState("");
  const [filtroStatus, setFiltroStatus] = useState("abertas");
  const [busca, setBusca] = useState("");
  const [form, setForm] = useState<{ id: string | null; v: ReturnType<typeof vazia> } | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [montando, setMontando] = useState<Campanha | null>(null);
  const [verEquipe, setVerEquipe] = useState<Campanha | null>(null);

  const lista = useMemo(() => {
    const t = busca.trim().toLowerCase();
    return dados.campanhas
      .filter((c) => (!filtroGrupo || c.grupo === filtroGrupo))
      .filter((c) =>
        filtroStatus === "abertas" ? !STATUS_CAMPANHA_QUE_LIBERAM.includes(c.status) : filtroStatus === "todas" ? true : c.status === filtroStatus
      )
      .filter((c) => !t || `${c.codigo} ${c.projeto} ${c.local ?? ""} ${c.solicitante ?? ""}`.toLowerCase().includes(t))
      .sort((a, b) => a.inicio.localeCompare(b.inicio));
  }, [dados.campanhas, filtroGrupo, filtroStatus, busca]);

  const vagaPorId = useMemo(() => new Map(dados.vagas.map((v) => [v.id, v])), [dados.vagas]);
  const equipePorId = useMemo(() => new Map(dados.equipes.map((e) => [e.id, e])), [dados.equipes]);
  const escalados = (c: Campanha) => dados.alocacoes.filter((a) => a.campanhaId === c.id);

  function abrirNova() {
    setErro(null);
    setForm({ id: null, v: vazia(hoje, grupos[0] ?? "Fauna", projetos[0] ?? "") });
  }
  function abrirEditar(c: Campanha) {
    setErro(null);
    setForm({
      id: c.id,
      v: {
        recebidaEm: c.recebidaEm ?? "",
        solicitante: c.solicitante ?? "",
        projeto: c.projeto,
        grupo: c.grupo,
        atividade: c.atividade,
        local: c.local ?? "",
        inicio: c.inicio,
        fim: c.fim,
        qtdEquipes: c.qtdEquipes,
        prioridade: c.prioridade,
        status: c.status,
        observacao: c.observacao ?? "",
      },
    });
  }

  async function salvar() {
    if (!form) return;
    setSalvando(true);
    setErro(null);
    const v = form.v;
    const corpo = {
      recebidaEm: v.recebidaEm || null,
      solicitante: v.solicitante || null,
      projeto: v.projeto,
      grupo: v.grupo,
      atividade: v.atividade,
      local: v.local || null,
      inicio: v.inicio,
      fim: v.fim,
      qtdEquipes: Number(v.qtdEquipes),
      prioridade: v.prioridade,
      status: v.status,
      observacao: v.observacao || null,
    };
    const r = await chamar(form.id ? "PATCH" : "POST", form.id ? `/api/efetivos/campanhas/${form.id}` : "/api/efetivos/campanhas", corpo);
    setSalvando(false);
    if (!r.ok) {
      const conflitos = r.dados.conflitos?.length ? ` (${r.dados.conflitos.map((x: any) => `${x.nome}: ${MOTIVO_CONFLITO[x.motivo] ?? x.motivo}`).join("; ")})` : "";
      setErro(`${r.dados.error ?? "Não foi possível salvar"}${conflitos}`);
      return;
    }
    setForm(null);
    await recarregar();
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-gray-100 bg-white p-3.5 shadow-sm">
        <label className="text-xs text-gray-500">
          Grupo
          <select value={filtroGrupo} onChange={(e) => setFiltroGrupo(e.target.value)} className="mt-1 block rounded-lg border border-gray-200 px-2.5 py-1.5 text-sm text-ink">
            <option value="">Todos</option>
            {grupos.map((g) => (
              <option key={g}>{g}</option>
            ))}
          </select>
        </label>
        <label className="text-xs text-gray-500">
          Situação
          <select value={filtroStatus} onChange={(e) => setFiltroStatus(e.target.value)} className="mt-1 block rounded-lg border border-gray-200 px-2.5 py-1.5 text-sm text-ink">
            <option value="abertas">Em aberto (ativas)</option>
            <option value="todas">Todas</option>
            {STATUS_CAMPANHA.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>
        <label className="text-xs text-gray-500">
          Buscar
          <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="código, projeto, local…" className="mt-1 block rounded-lg border border-gray-200 px-2.5 py-1.5 text-sm text-ink" />
        </label>
        {dados.podeEditar && (
          <button onClick={abrirNova} className="ml-auto rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark">
            + Nova campanha
          </button>
        )}
      </div>

      <div className="overflow-x-auto rounded-xl border border-gray-100 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-[11px] uppercase tracking-wide text-gray-500">
            <tr>
              <th className="px-3 py-2 text-left">Campanha</th>
              <th className="px-3 py-2 text-left">Projeto / local</th>
              <th className="px-3 py-2 text-left">Grupo · atividade</th>
              <th className="px-3 py-2 text-left">Período</th>
              <th className="px-3 py-2 text-right">Equipes pedidas</th>
              <th className="px-3 py-2 text-left">Situação</th>
              <th className="px-3 py-2 text-left" title="Compara o pedido com as equipes-base completas e livres em todo o período">Capacidade</th>
              <th className="px-3 py-2 text-right">Escalados</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {lista.map((c) => {
              const segura = !STATUS_CAMPANHA_QUE_LIBERAM.includes(c.status);
              const at = segura ? atendimentoDaCampanha(regra, c) : null;
              const n = escalados(c).length;
              return (
                <tr key={c.id} className="align-top hover:bg-gray-50/60">
                  <td className="px-3 py-2">
                    <div className="font-medium text-ink">{c.codigo}</div>
                    <div className="text-[11px] text-gray-400">
                      {c.prioridade !== "Média" && <span className={c.prioridade === "Alta" ? "text-red-600" : ""}>Prioridade {c.prioridade.toLowerCase()} · </span>}
                      {c.solicitante || ""}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-gray-700">
                    {c.projeto}
                    {c.local && <div className="text-[11px] text-gray-400">{c.local}</div>}
                  </td>
                  <td className="px-3 py-2 text-gray-600">
                    {c.grupo}
                    <div className="text-[11px] text-gray-400">{c.atividade}</div>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-gray-600">
                    {fmtDia(c.inicio)} a {fmtDia(c.fim)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{c.qtdEquipes}</td>
                  <td className="px-3 py-2">
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${COR_STATUS_CAMPANHA[c.status]}`}>{c.status}</span>
                  </td>
                  <td className="px-3 py-2">
                    {at ? (
                      <>
                        <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${COR_ATENDIMENTO[at.atendimento]}`}>{at.atendimento}</span>
                        <div className="mt-0.5 text-[11px] text-gray-400">
                          {at.equipesDisponiveis} equipe{at.equipesDisponiveis === 1 ? "" : "s"} livre{at.equipesDisponiveis === 1 ? "" : "s"} · {at.pessoasLivresNoGrupo} pessoas livres
                        </div>
                      </>
                    ) : (
                      <span className="text-gray-300">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{n > 0 ? n : <span className="text-gray-300">0</span>}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-right">
                    {dados.podeEditar && segura && (
                      <button onClick={() => setMontando(c)} className="rounded-lg bg-brand px-3 py-1 text-xs font-medium text-white hover:bg-brand-dark">
                        {n > 0 ? "Editar equipe" : "Montar equipe"}
                      </button>
                    )}
                    {!dados.podeEditar && n > 0 && (
                      <button onClick={() => setVerEquipe(c)} className="rounded-lg border border-gray-200 px-3 py-1 text-xs text-gray-600 hover:bg-gray-50">
                        Ver equipe
                      </button>
                    )}
                    {dados.podeEditar && (
                      <button onClick={() => abrirEditar(c)} className="ml-1.5 rounded-lg border border-gray-200 px-3 py-1 text-xs text-gray-600 hover:bg-gray-50">
                        Editar
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
            {lista.length === 0 && (
              <tr>
                <td colSpan={9} className="px-3 py-10 text-center text-gray-400">
                  Nenhuma campanha neste filtro.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {form && (
        <Modal titulo={form.id ? "Editar campanha" : "Nova campanha"} onFechar={() => setForm(null)}>
          <div className="grid gap-3 px-5 py-4 sm:grid-cols-2">
            <label className="text-xs text-gray-500">
              Projeto / CT
              <input list="projetos-efetivos" value={form.v.projeto} onChange={(e) => setForm({ ...form, v: { ...form.v, projeto: e.target.value } })} className={campo} />
              <datalist id="projetos-efetivos">
                {projetos.map((p) => (
                  <option key={p} value={p} />
                ))}
              </datalist>
            </label>
            <label className="text-xs text-gray-500">
              Grupo
              <select value={form.v.grupo} onChange={(e) => setForm({ ...form, v: { ...form.v, grupo: e.target.value } })} className={campo}>
                {grupos.map((g) => (
                  <option key={g}>{g}</option>
                ))}
              </select>
            </label>
            <label className="text-xs text-gray-500">
              Atividade
              <select value={form.v.atividade} onChange={(e) => setForm({ ...form, v: { ...form.v, atividade: e.target.value } })} className={campo}>
                {ATIVIDADES.map((a) => (
                  <option key={a}>{a}</option>
                ))}
              </select>
            </label>
            <label className="text-xs text-gray-500">
              Local / frente
              <input value={form.v.local} onChange={(e) => setForm({ ...form, v: { ...form.v, local: e.target.value } })} className={campo} />
            </label>
            <label className="text-xs text-gray-500">
              Início
              <input type="date" value={form.v.inicio} onChange={(e) => setForm({ ...form, v: { ...form.v, inicio: e.target.value } })} className={campo} />
            </label>
            <label className="text-xs text-gray-500">
              Fim
              <input type="date" value={form.v.fim} onChange={(e) => setForm({ ...form, v: { ...form.v, fim: e.target.value } })} className={campo} />
            </label>
            <label className="text-xs text-gray-500">
              Equipes pedidas
              <input type="number" min={1} max={100} value={form.v.qtdEquipes} onChange={(e) => setForm({ ...form, v: { ...form.v, qtdEquipes: Number(e.target.value) } })} className={campo} />
            </label>
            <label className="text-xs text-gray-500">
              Prioridade
              <select value={form.v.prioridade} onChange={(e) => setForm({ ...form, v: { ...form.v, prioridade: e.target.value } })} className={campo}>
                {PRIORIDADES.map((p) => (
                  <option key={p}>{p}</option>
                ))}
              </select>
            </label>
            <label className="text-xs text-gray-500">
              Solicitante
              <input value={form.v.solicitante} onChange={(e) => setForm({ ...form, v: { ...form.v, solicitante: e.target.value } })} className={campo} />
            </label>
            <label className="text-xs text-gray-500">
              Recebida em
              <input type="date" value={form.v.recebidaEm} onChange={(e) => setForm({ ...form, v: { ...form.v, recebidaEm: e.target.value } })} className={campo} />
            </label>
            <label className="text-xs text-gray-500 sm:col-span-2">
              Situação
              <select value={form.v.status} onChange={(e) => setForm({ ...form, v: { ...form.v, status: e.target.value } })} className={campo}>
                {STATUS_CAMPANHA.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
              <span className="mt-1 block text-[11px] text-gray-400">Concluída e Cancelada liberam as pessoas escaladas (o histórico fica guardado).</span>
            </label>
            <label className="text-xs text-gray-500 sm:col-span-2">
              Observação
              <textarea value={form.v.observacao} onChange={(e) => setForm({ ...form, v: { ...form.v, observacao: e.target.value } })} rows={2} className={campo} />
            </label>
          </div>
          {erro && <div className="mx-5 mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{erro}</div>}
          <div className="flex justify-end gap-2 border-t border-gray-100 px-5 py-3">
            <button onClick={() => setForm(null)} className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50">
              Cancelar
            </button>
            <button onClick={salvar} disabled={salvando || !form.v.projeto || !form.v.inicio || !form.v.fim} className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark disabled:opacity-50">
              {salvando ? "Salvando…" : "Salvar"}
            </button>
          </div>
        </Modal>
      )}

      {montando && <MontarEquipe campanha={montando} dados={dados} regra={regra} onFechar={() => setMontando(null)} onSalvo={async () => { setMontando(null); await recarregar(); }} />}

      {verEquipe && (
        <Modal titulo={`${verEquipe.codigo} — equipe escalada`} onFechar={() => setVerEquipe(null)}>
          <div className="space-y-1 px-5 py-4 text-sm">
            <p className="mb-2 text-xs text-gray-500">
              {verEquipe.projeto} · {verEquipe.grupo} · {fmtDia(verEquipe.inicio)} a {fmtDia(verEquipe.fim)}
            </p>
            {escalados(verEquipe).map((a) => {
              const v = vagaPorId.get(a.vagaId);
              return (
                <div key={a.id} className="flex justify-between border-b border-gray-50 py-1">
                  <span className="text-ink">{ocultarNomes ? v?.cargo : v?.nome}</span>
                  <span className="text-xs text-gray-400">{v ? `${equipePorId.get(v.equipeId)?.codigo} · ${v.cargo}` : ""}</span>
                </div>
              );
            })}
          </div>
        </Modal>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- montar equipe

function MontarEquipe({
  campanha,
  dados,
  regra,
  onFechar,
  onSalvo,
}: {
  campanha: Campanha;
  dados: DadosTela;
  regra: DadosEfetivos;
  onFechar: () => void;
  onSalvo: () => Promise<void>;
}) {
  const grupos = ordenarGrupos(dados.equipes.map((e) => e.grupo));
  const [grupo, setGrupo] = useState(campanha.grupo);
  const [equipeId, setEquipeId] = useState("");
  const [empresa, setEmpresa] = useState("");
  const [cargo, setCargo] = useState("");
  const [busca, setBusca] = useState("");
  const [verIndisponiveis, setVerIndisponiveis] = useState(false);
  const [sel, setSel] = useState<Set<string>>(() => new Set(dados.alocacoes.filter((a) => a.campanhaId === campanha.id).map((a) => a.vagaId)));
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [conflitos, setConflitos] = useState<{ nome: string | null; motivo: string }[]>([]);

  const { livres, indisponiveis } = useMemo(
    () => livresNoPeriodo(regra, campanha.inicio, campanha.fim, { ignorarCampanhaId: campanha.id, grupo: grupo || null }),
    [regra, campanha.inicio, campanha.fim, campanha.id, grupo]
  );
  const todosLivres = useMemo(
    () => livresNoPeriodo(regra, campanha.inicio, campanha.fim, { ignorarCampanhaId: campanha.id }).livres,
    [regra, campanha.inicio, campanha.fim, campanha.id]
  );

  const empresas = Array.from(new Set(dados.vagas.map((v) => v.empresa))).sort();
  const cargos = Array.from(new Set(dados.vagas.map((v) => v.cargo))).sort();
  const filtra = (p: { nome: string | null; equipeId: string; empresa: string; cargo: string }) =>
    (!equipeId || p.equipeId === equipeId) &&
    (!empresa || p.empresa === empresa) &&
    (!cargo || p.cargo === cargo) &&
    (!busca.trim() || (p.nome ?? "").toLowerCase().includes(busca.trim().toLowerCase()));

  const livresFiltrados = livres.filter(filtra);
  const porEquipe = useMemo(() => {
    const m = new Map<string, typeof livresFiltrados>();
    for (const p of livresFiltrados) {
      if (!m.has(p.equipeId)) m.set(p.equipeId, []);
      m.get(p.equipeId)!.push(p);
    }
    return [...m.entries()];
  }, [livresFiltrados]);

  const idsLivres = new Set(todosLivres.map((p) => p.id));
  const selecionadosForaDaLista = [...sel].filter((id) => !idsLivres.has(id));
  const vagaPorId = new Map(dados.vagas.map((v) => [v.id, v]));
  const composicao = useMemo(() => {
    const c = new Map<string, number>();
    for (const id of sel) {
      const v = vagaPorId.get(id);
      if (v) c.set(v.cargo, (c.get(v.cargo) ?? 0) + 1);
    }
    return [...c.entries()].sort((a, b) => b[1] - a[1]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sel, dados.vagas]);

  function alternar(id: string) {
    setSel((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }
  function marcarEquipe(ids: string[], marcar: boolean) {
    setSel((s) => {
      const n = new Set(s);
      ids.forEach((id) => (marcar ? n.add(id) : n.delete(id)));
      return n;
    });
  }

  async function salvar() {
    setSalvando(true);
    setErro(null);
    setConflitos([]);
    const r = await chamar("PUT", `/api/efetivos/campanhas/${campanha.id}/alocacoes`, { vagaIds: [...sel] });
    setSalvando(false);
    if (!r.ok) {
      setErro(r.dados.error ?? "Não foi possível gravar a equipe");
      setConflitos((r.dados.conflitos ?? []).map((c: any) => ({ nome: c.nome, motivo: MOTIVO_CONFLITO[c.motivo] ?? c.motivo })));
      return;
    }
    await onSalvo();
  }

  const select = "mt-1 block rounded-lg border border-gray-200 px-2 py-1.5 text-sm text-ink";
  return (
    <Modal titulo={`Montar equipe — ${campanha.codigo}`} onFechar={onFechar} largo>
      <div className="px-5 pt-3 text-sm text-gray-600">
        <strong className="text-ink">{campanha.projeto}</strong> · {campanha.grupo} · {campanha.atividade} · {fmtDia(campanha.inicio)} a {fmtDia(campanha.fim)} · pede {campanha.qtdEquipes} equipe
        {campanha.qtdEquipes > 1 ? "s" : ""}
        <p className="mt-1 text-xs text-gray-400">
          Aparece aqui só quem está livre em <strong>todos</strong> os dias do período (sem férias, atestado, afastamento nem outra campanha). Escolha quem quiser: não há composição mínima nem máxima.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-2.5 px-5 py-3">
        <label className="text-xs text-gray-500">
          Grupo
          <select value={grupo} onChange={(e) => setGrupo(e.target.value)} className={select}>
            <option value="">Todos</option>
            {grupos.map((g) => (
              <option key={g}>{g}</option>
            ))}
          </select>
        </label>
        <label className="text-xs text-gray-500">
          Equipe-base
          <select value={equipeId} onChange={(e) => setEquipeId(e.target.value)} className={select}>
            <option value="">Todas</option>
            {dados.equipes
              .filter((e) => !grupo || e.grupo === grupo)
              .map((e) => (
                <option key={e.id} value={e.id}>
                  {e.codigo} · {e.nome}
                </option>
              ))}
          </select>
        </label>
        <label className="text-xs text-gray-500">
          Empresa
          <select value={empresa} onChange={(e) => setEmpresa(e.target.value)} className={select}>
            <option value="">Todas</option>
            {empresas.map((e) => (
              <option key={e}>{e}</option>
            ))}
          </select>
        </label>
        <label className="text-xs text-gray-500">
          Função
          <select value={cargo} onChange={(e) => setCargo(e.target.value)} className={select}>
            <option value="">Todas</option>
            {cargos.map((e) => (
              <option key={e}>{e}</option>
            ))}
          </select>
        </label>
        <label className="text-xs text-gray-500">
          Nome
          <input value={busca} onChange={(e) => setBusca(e.target.value)} className={select} />
        </label>
        <label className="flex items-center gap-1.5 pb-1.5 text-xs text-gray-600">
          <input type="checkbox" checked={verIndisponiveis} onChange={(e) => setVerIndisponiveis(e.target.checked)} /> mostrar quem não está livre
        </label>
      </div>

      <div className="grid gap-4 px-5 pb-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="max-h-[48vh] space-y-3 overflow-y-auto rounded-xl border border-gray-100 p-3">
          {porEquipe.map(([eqId, pessoas]) => {
            const eq = dados.equipes.find((e) => e.id === eqId)!;
            const ids = pessoas.map((p) => p.id);
            const todos = ids.every((id) => sel.has(id));
            return (
              <div key={eqId}>
                <div className="mb-1 flex items-center justify-between text-xs">
                  <span className="font-semibold text-ink">
                    {eq.codigo} · {eq.nome} <span className="font-normal text-gray-400">({eq.projeto} · {eq.grupo})</span>
                  </span>
                  <button onClick={() => marcarEquipe(ids, !todos)} className="text-brand-dark hover:underline">
                    {todos ? "desmarcar" : "marcar"} todos os livres ({ids.length})
                  </button>
                </div>
                <div className="grid gap-1 sm:grid-cols-2">
                  {pessoas.map((p) => (
                    <label key={p.id} className={`flex cursor-pointer items-start gap-2 rounded-lg border px-2.5 py-1.5 text-sm ${sel.has(p.id) ? "border-brand bg-brand-light" : "border-gray-100 hover:bg-gray-50"}`}>
                      <input type="checkbox" checked={sel.has(p.id)} onChange={() => alternar(p.id)} className="mt-0.5" />
                      <span>
                        <span className="block text-ink">{p.nome}</span>
                        <span className="block text-[11px] text-gray-400">
                          {p.cargo} · {p.empresa}
                          {vagaPorId.get(p.id)?.direcao4x4 ? " · dirige 4x4" : ""}
                        </span>
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            );
          })}
          {porEquipe.length === 0 && <p className="py-8 text-center text-sm text-gray-400">Ninguém livre neste período com esses filtros.</p>}

          {verIndisponiveis && (
            <div className="border-t border-dashed border-gray-200 pt-3">
              <div className="mb-1 text-xs font-semibold text-gray-500">Não estão livres no período</div>
              <div className="grid gap-1 sm:grid-cols-2">
                {indisponiveis.filter(filtra).map((p) => {
                  const outra = p.campanhaId ? dados.campanhas.find((c) => c.id === p.campanhaId)?.codigo : null;
                  return (
                    <div key={p.id} className="rounded-lg border border-gray-100 bg-gray-50 px-2.5 py-1.5 text-sm text-gray-400">
                      <span className="block">{p.nome}</span>
                      <span className="block text-[11px]">
                        {p.situacao === "ALOCADA" ? (outra ? `em ${outra}` : p.motivo ?? "em outra campanha") : p.motivo ?? "ausente"} · {p.equipeCodigo}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <aside className="space-y-3">
          <div className="rounded-xl border border-gray-100 bg-gray-50 p-3.5">
            <div className="text-[11px] font-medium uppercase tracking-wide text-gray-400">Equipe da campanha</div>
            <div className="mt-1 text-3xl font-semibold tabular-nums text-ink">{sel.size}</div>
            <div className="text-xs text-gray-500">pessoa{sel.size === 1 ? "" : "s"} escalada{sel.size === 1 ? "" : "s"}</div>
            <ul className="mt-2 space-y-0.5 text-xs text-gray-600">
              {composicao.map(([c, n]) => (
                <li key={c} className="flex justify-between">
                  <span className="truncate pr-2">{c}</span>
                  <span className="tabular-nums">{n}</span>
                </li>
              ))}
            </ul>
            <div className="mt-2 text-[11px] text-gray-400">{todosLivres.length} pessoas livres no período (todos os grupos)</div>
          </div>

          {selecionadosForaDaLista.length > 0 && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
              <div className="font-semibold">Escalados que deixaram de estar livres</div>
              <ul className="mt-1 space-y-1">
                {selecionadosForaDaLista.map((id) => (
                  <li key={id} className="flex items-center justify-between gap-2">
                    <span>{vagaPorId.get(id)?.nome ?? id}</span>
                    <button onClick={() => alternar(id)} className="rounded border border-amber-300 px-1.5 py-0.5 hover:bg-amber-100">remover</button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </aside>
      </div>

      {erro && (
        <div className="mx-5 mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {erro}
          {conflitos.length > 0 && (
            <ul className="mt-1 list-disc pl-5 text-xs">
              {conflitos.map((c, i) => (
                <li key={i}>
                  {c.nome}: {c.motivo}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      <div className="flex items-center justify-between gap-2 border-t border-gray-100 px-5 py-3">
        <span className="text-xs text-gray-400">Só você e quem tem acesso de edição movimenta equipes. Tudo fica no histórico.</span>
        <div className="flex gap-2">
          <button onClick={onFechar} className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50">
            Cancelar
          </button>
          <button onClick={salvar} disabled={salvando} className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark disabled:opacity-50">
            {salvando ? "Gravando…" : `Gravar equipe (${sel.size})`}
          </button>
        </div>
      </div>
    </Modal>
  );
}
