"use client";

// Timesheet automatico (modulo Projetos): a pessoa ativa e o sistema deduz, das tarefas dela, as horas e o % de dedicacao por centro de custo.
// A regra de calculo esta em src/lib/timesheetAuto/calculo.ts (explicada na propria tela, em "Como calculamos").

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import type { ResultadoMes, LinhaCentro, Origem } from "@/lib/timesheetAuto/calculo";

type Config = { ativo: boolean; desde: string; horasPorDia: number; ativadoEm: string; desativadoEm: string | null; ausencias: { id: string; de: string; ate: string; motivo: string | null }[] };
type Resposta = {
  pessoa: { id: string; name: string; cargo: string | null; setor: string | null };
  ehMeu: boolean;
  ativado: boolean;
  competencia: string;
  hoje: string;
  meses?: string[];
  nomesCentros?: Record<string, string>;
  semCentro?: { projetoId: string; nome: string; tarefas: number }[];
  config?: Config;
  resultado?: ResultadoMes;
  fechado?: boolean;
  fechadoEm?: string | null;
};
type Equipe = {
  competencia: string;
  nomesCentros: Record<string, string>;
  pessoas: { pessoa: { id: string; name: string; cargo: string | null }; fechado: boolean; diasUteis: number; horasAlocadas: number; horasSemTarefa: number; centros: { chave: string; codccu: string | null; horas: number; percentual: number; identificado: boolean }[] }[];
  centros: { chave: string; codccu: string | null; horas: number; pessoas: number; identificado: boolean }[];
  total: number;
};

const ORIGEM: Record<Origem, string> = { historico: "histórico de status", datas_reais: "datas reais", datas_previstas: "datas previstas", conclusao: "dia da conclusão" };
const num = (n: number) => n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const dia = (iso: string) => iso.split("-").reverse().join("/");
const mesBr = (c: string) => { const [a, m] = c.split("-"); return `${["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"][Number(m) - 1]} de ${a}`; };
const rotuloCentro = (c: { chave: string; codccu: string | null }, nomes: Record<string, string>) =>
  c.codccu ? `${c.codccu}${nomes[c.codccu] ? ` · ${nomes[c.codccu]}` : ""}` : c.chave === "__sem_projeto__" ? "Tarefas sem projeto" : "Projetos sem centro de custo";

async function chamar(url: string, metodo = "GET", corpo?: unknown) {
  const r = await fetch(url, { method: metodo, headers: corpo !== undefined ? { "Content-Type": "application/json" } : undefined, body: corpo !== undefined ? JSON.stringify(corpo) : undefined, cache: "no-store" });
  const j = await r.json().catch(() => ({}));
  return { ok: r.ok, status: r.status, json: j };
}

function Cartao({ titulo, valor, ajuda, alerta, pequeno }: { titulo: string; valor: string; ajuda?: string; alerta?: boolean; pequeno?: boolean }) {
  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-soft">
      <div className="text-[12px] font-medium uppercase tracking-wide text-gray-500">{titulo}</div>
      <div className={`mt-1 font-semibold tabular-nums ${pequeno ? "text-base" : "text-2xl"} ${alerta ? "text-amber-600" : "text-gray-900"}`}>{valor}</div>
      {ajuda && <div className="mt-0.5 text-[12px] text-gray-500">{ajuda}</div>}
    </div>
  );
}

function LinhaDoCentro({ c, nomes, aberto, onAlternar }: { c: LinhaCentro; nomes: Record<string, string>; aberto: boolean; onAlternar: () => void }) {
  return (
    <div className="border-b border-gray-100 last:border-0">
      <button type="button" onClick={onAlternar} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-gray-50" aria-expanded={aberto}>
        <span className="w-4 text-gray-400">{aberto ? "▾" : "▸"}</span>
        <span className="min-w-0 flex-1">
          <span className={`block truncate text-[14px] font-medium ${c.identificado ? "text-gray-900" : "text-amber-700"}`}>{rotuloCentro(c, nomes)}</span>
          <span className="mt-1 block h-2 overflow-hidden rounded-full bg-gray-100">
            <span className={`block h-full rounded-full ${c.identificado ? "bg-brand" : "bg-amber-400"}`} style={{ width: `${Math.min(100, c.percentual)}%` }} />
          </span>
        </span>
        <span className="w-24 text-right text-[14px] tabular-nums text-gray-700">{num(c.horas)} h</span>
        <span className="w-20 text-right text-[15px] font-semibold tabular-nums text-gray-900">{num(c.percentual)}%</span>
      </button>
      {aberto && (
        <div className="bg-gray-50/60 px-4 pb-3 pl-11">
          {c.projetos.map((p) => (
            <div key={p.projetoId ?? "sem"} className="mt-2">
              <div className="flex items-center justify-between text-[13px] font-medium text-gray-700">
                <span>{p.projetoId ? <Link className="hover:text-brand" href={`/projetos/${p.projetoId}`}>{p.nome}</Link> : p.nome}</span>
                <span className="tabular-nums">{num(p.horas)} h</span>
              </div>
              <ul className="mt-1 space-y-0.5">
                {p.tarefas.map((t) => (
                  <li key={t.id} className="flex items-center justify-between gap-3 text-[12.5px] text-gray-600">
                    <span className="min-w-0 truncate">{t.titulo}</span>
                    <span className="shrink-0 tabular-nums">{t.dias} dia(s) · {num(t.horas)} h <span className="ml-1 rounded bg-white px-1.5 py-0.5 text-[10.5px] text-gray-500 ring-1 ring-gray-200">{ORIGEM[t.origem]}</span></span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function TimesheetPage() {
  const { data: session } = useSession();
  const meuId = (session?.user as any)?.id as string | undefined;
  const papel = (session?.user as any)?.role as string | undefined;
  const [competencia, setCompetencia] = useState<string>("");
  const [alvoId, setAlvoId] = useState<string | null>(null); // null = eu
  const [dados, setDados] = useState<Resposta | null>(null);
  const [equipe, setEquipe] = useState<Equipe | null>(null);
  const [aba, setAba] = useState<"meu" | "equipe">("meu");
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [abertos, setAbertos] = useState<Set<string>>(new Set());
  const [msg, setMsg] = useState<string | null>(null);
  const [ativando, setAtivando] = useState({ desde: "", horas: 8 });
  const [horasEdit, setHorasEdit] = useState<number | null>(null);
  const [novaAus, setNovaAus] = useState({ de: "", ate: "", motivo: "" });
  const [diaADia, setDiaADia] = useState(false);

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro(null);
    const q = new URLSearchParams();
    if (competencia) q.set("competencia", competencia);
    if (alvoId) q.set("userId", alvoId);
    const r = await chamar(`/api/timesheet-auto?${q}`);
    if (!r.ok) { setErro(r.json?.error ?? "Não foi possível carregar o timesheet."); setCarregando(false); return; }
    setDados(r.json);
    if (!competencia) setCompetencia(r.json.competencia);
    setCarregando(false);
  }, [competencia, alvoId]);

  const carregarEquipe = useCallback(async () => {
    const r = await chamar(`/api/timesheet-auto/equipe?competencia=${competencia || ""}`);
    if (r.ok) setEquipe(r.json);
  }, [competencia]);

  useEffect(() => { void carregar(); }, [carregar]);
  useEffect(() => { if (competencia) void carregarEquipe(); }, [competencia, carregarEquipe]);

  const nomes = dados?.nomesCentros ?? {};
  const r = dados?.resultado;
  const podeVerEquipe = !!equipe && (equipe.pessoas.length > 0 || papel === "ADMIN" || papel === "ACESSO_MASTER");
  const meuMes = dados?.ehMeu ?? true;
  const mesCorrente = dados?.hoje?.slice(0, 7);
  const podeFechar = !!dados?.ativado && !dados.fechado && (papel === "ADMIN" || (meuMes && !!competencia && !!mesCorrente && competencia < mesCorrente));

  async function acao(corpo: unknown) {
    const x = await chamar("/api/timesheet-auto", "POST", corpo);
    setMsg(x.ok ? null : x.json?.error ?? "Não foi possível concluir.");
    if (x.ok) await carregar();
  }
  async function fechar() {
    if (!window.confirm(`Fechar ${mesBr(competencia)}? Depois de fechado, mexer nas tarefas não muda mais este relatório.`)) return;
    const x = await chamar("/api/timesheet-auto/fechar", "POST", { competencia, ...(alvoId ? { userId: alvoId } : {}) });
    setMsg(x.ok ? "Mês fechado." : x.json?.error ?? "Não foi possível fechar.");
    await carregar();
    await carregarEquipe();
  }
  async function reabrir() {
    if (!window.confirm(`Reabrir ${mesBr(competencia)}? O relatório volta a acompanhar as tarefas.`)) return;
    const x = await chamar(`/api/timesheet-auto/fechar?competencia=${competencia}${alvoId ? `&userId=${alvoId}` : ""}`, "DELETE");
    setMsg(x.ok ? "Mês reaberto." : x.json?.error ?? "Não foi possível reabrir.");
    await carregar();
    await carregarEquipe();
  }
  async function adicionarAusencia() {
    if (!novaAus.de || !novaAus.ate) { setMsg("Informe o primeiro e o último dia."); return; }
    const x = await chamar("/api/timesheet-auto/ausencias", "POST", { de: novaAus.de, ate: novaAus.ate, motivo: novaAus.motivo || undefined });
    setMsg(x.ok ? null : x.json?.error ?? "Não foi possível salvar a ausência.");
    if (x.ok) { setNovaAus({ de: "", ate: "", motivo: "" }); await carregar(); }
  }
  async function removerAusencia(id: string) {
    const x = await chamar(`/api/timesheet-auto/ausencias?id=${id}`, "DELETE");
    setMsg(x.ok ? null : x.json?.error ?? "Não foi possível remover.");
    if (x.ok) await carregar();
  }
  const titulosDasTarefas = useMemo(() => {
    const m = new Map<string, string>();
    r?.centros.forEach((c) => c.projetos.forEach((p) => p.tarefas.forEach((t) => m.set(t.id, t.titulo))));
    return m;
  }, [r]);

  if (erro && !dados) return <div className="mx-auto max-w-3xl p-6"><div className="rounded-2xl border border-red-100 bg-red-50 p-4 text-sm text-red-700">{erro}</div></div>;
  if (!dados) return <div className="mx-auto max-w-5xl p-6"><div className="h-40 animate-pulse rounded-2xl bg-gray-100" aria-busy /></div>;

  return (
    <div className="mx-auto max-w-5xl space-y-5 p-6">
      <header>
        <h1 className="text-3xl font-semibold tracking-tight text-gray-900">Timesheet automático</h1>
        <p className="mt-1 max-w-3xl text-[14px] text-gray-500">O sistema calcula, a partir das suas tarefas, quantas horas e que percentual do seu tempo foram para cada centro de custo (contrato, administrativo, proposta). Você não preenche nada: ativa uma vez e ele acompanha as tarefas.</p>
      </header>

      {msg && <div role="status" className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-[13.5px] text-amber-800">{msg}</div>}

      {/* ------------------------------------------------------------ ainda nao ativou */}
      {!dados.ativado && dados.ehMeu && (
        <section className="rounded-2xl border border-gray-100 bg-white p-6 shadow-soft">
          <h2 className="text-lg font-semibold text-gray-900">Ativar o timesheet automático</h2>
          <ul className="mt-3 space-y-1.5 text-[14px] text-gray-600">
            <li>Só conta quem ativa. A partir da ativação, o sistema passa a somar a sua dedicação por centro de custo.</li>
            <li>Cada projeto pertence a um centro de custo; as suas tarefas levam as horas para o centro do projeto. <b>Ligue o projeto a um centro de custo</b> para as horas entrarem.</li>
            <li>Em cada dia útil, as suas horas se dividem entre as tarefas que estavam em andamento (status “Fazendo”).</li>
            <li>No fim do mês você fecha o relatório: horas e percentual por centro de custo, prontos para a distribuição do salário.</li>
          </ul>
          <div className="mt-5 flex flex-wrap items-end gap-4">
            <label className="text-[13px] text-gray-600">Começar a contar em
              <input type="date" value={ativando.desde} max={dados.hoje} min={`${dados.hoje.slice(0, 7)}-01`} onChange={(e) => setAtivando({ ...ativando, desde: e.target.value })} className="ml-2 rounded-lg border border-gray-200 px-3 py-1.5 text-sm" />
              <span className="ml-2 text-gray-400">(vazio = hoje)</span>
            </label>
            <label className="text-[13px] text-gray-600">Horas por dia útil
              <input type="number" min={1} max={12} step={0.5} value={ativando.horas} onChange={(e) => setAtivando({ ...ativando, horas: Number(e.target.value) })} className="ml-2 w-20 rounded-lg border border-gray-200 px-3 py-1.5 text-sm" />
            </label>
            <button type="button" onClick={() => acao({ acao: "ativar", ...(ativando.desde ? { desde: ativando.desde } : {}), horasPorDia: ativando.horas })} className="rounded-lg bg-brand px-5 py-2 text-sm font-medium text-white hover:bg-brand-dark">Ativar</button>
          </div>
        </section>
      )}
      {!dados.ativado && !dados.ehMeu && <div className="rounded-2xl border border-gray-100 bg-white p-5 text-sm text-gray-600">{dados.pessoa.name} ainda não ativou o timesheet automático.</div>}

      {dados.ativado && r && dados.config && (
        <>
          {/* ---------------------------------------------------------- abas e barra */}
          <div className="flex flex-wrap items-center gap-3 border-b border-gray-200">
            <button type="button" onClick={() => { setAba("meu"); setAlvoId(null); }} className={`-mb-px border-b-2 px-3 py-2 text-[14px] font-medium ${aba === "meu" ? "border-brand text-brand" : "border-transparent text-gray-500 hover:text-gray-800"}`}>{alvoId ? dados.pessoa.name : "Meu timesheet"}</button>
            {podeVerEquipe && <button type="button" onClick={() => setAba("equipe")} className={`-mb-px border-b-2 px-3 py-2 text-[14px] font-medium ${aba === "equipe" ? "border-brand text-brand" : "border-transparent text-gray-500 hover:text-gray-800"}`}>Equipe</button>}
            <div className="flex-1" />
            <label className="mb-1 text-[13px] text-gray-600">Mês
              <select value={competencia} onChange={(e) => setCompetencia(e.target.value)} className="ml-2 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm">
                {(dados.meses ?? [competencia]).slice().reverse().map((m) => <option key={m} value={m}>{mesBr(m)}</option>)}
              </select>
            </label>
          </div>

          {aba === "meu" && (
            <>
              <div className="flex flex-wrap items-center gap-2 text-[13px] text-gray-600">
                <span className="rounded-full bg-emerald-50 px-2.5 py-1 font-medium text-emerald-700">{dados.config.ativo ? "Ativo" : "Desativado"}</span>
                <span>desde {dia(dados.config.desde)} · {num(dados.config.horasPorDia)} h por dia útil</span>
                {dados.fechado && <span className="rounded-full bg-gray-100 px-2.5 py-1 font-medium text-gray-700">Mês fechado em {dia((dados.fechadoEm ?? "").slice(0, 10))}</span>}
                <div className="flex-1" />
                <a href={`/api/timesheet-auto/exportar?competencia=${competencia}${alvoId ? `&userId=${alvoId}` : ""}`} className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 font-medium text-gray-700 hover:bg-gray-50">Baixar planilha</a>
                {podeFechar && <button type="button" onClick={fechar} className="rounded-lg bg-brand px-3 py-1.5 font-medium text-white hover:bg-brand-dark">Fechar {mesBr(competencia)}</button>}
                {dados.fechado && papel === "ADMIN" && <button type="button" onClick={reabrir} className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 font-medium text-gray-700 hover:bg-gray-50">Reabrir mês</button>}
              </div>

              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                <Cartao titulo="Horas alocadas" valor={`${num(r.horasAlocadas)} h`} ajuda={`de ${num(r.horasDisponiveis)} h dos ${r.diasUteis} dias úteis`} />
                <Cartao titulo="Em centros de custo" valor={`${num(r.percentualIdentificado)}%`} ajuda={`${num(r.horasIdentificadas)} h com centro identificado`} alerta={r.percentualIdentificado < 100 && r.horasAlocadas > 0} />
                <Cartao titulo="Horas sem tarefa" valor={`${num(r.horasSemTarefa)} h`} ajuda={`${r.diasSemTarefa.length} dia(s) sem tarefa em andamento`} alerta={r.horasSemTarefa > 0} />
                <Cartao titulo="Período contado" pequeno valor={`${dia(r.de)} a ${dia(r.ate)}`} ajuda="feriados e ausências ficam de fora" />
              </div>

              {/* ---------------------------------------------------------- avisos */}
              {dados.ehMeu && (dados.semCentro?.length ?? 0) > 0 && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-[13.5px] text-amber-800">
                  <b>Projetos sem centro de custo:</b> as horas deles não entram em nenhum contrato. Ligue cada um a um centro de custo:{" "}
                  {dados.semCentro!.map((p, i) => <span key={p.projetoId}>{i > 0 && ", "}<Link className="font-medium underline" href={`/projetos/${p.projetoId}`}>{p.nome}</Link> ({p.tarefas})</span>)}.
                </div>
              )}
              {r.diasSemTarefa.length > 0 && (
                <div className="rounded-xl border border-gray-200 bg-white px-4 py-3 text-[13.5px] text-gray-600">
                  <b className="text-gray-800">Dias úteis sem tarefa em andamento:</b> {r.diasSemTarefa.slice(0, 12).map(dia).join(", ")}{r.diasSemTarefa.length > 12 ? ` e mais ${r.diasSemTarefa.length - 12}` : ""}. Essas horas não vão para nenhum centro de custo. Se você trabalhou nesses dias, marque a tarefa como “Fazendo” (ou ajuste as datas dela).
                </div>
              )}

              {/* ---------------------------------------------------------- distribuicao */}
              <section className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-soft">
                <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
                  <h2 className="text-[15px] font-semibold text-gray-900">Distribuição por centro de custo · {mesBr(r.competencia)}</h2>
                  <span className="text-[12px] text-gray-500">% sobre as horas alocadas</span>
                </div>
                {r.centros.length === 0 ? (
                  <p className="px-4 py-8 text-center text-sm text-gray-500">Nenhuma hora alocada neste período. Para contar, tenha tarefas em andamento ligadas a projetos com centro de custo.</p>
                ) : (
                  r.centros.map((c) => (
                    <LinhaDoCentro key={c.chave} c={c} nomes={nomes} aberto={abertos.has(c.chave)} onAlternar={() => setAbertos((s) => { const n = new Set(s); if (n.has(c.chave)) n.delete(c.chave); else n.add(c.chave); return n; })} />
                  ))
                )}
              </section>

              {/* ---------------------------------------------------------- ajustes (so' no meu) */}
              {dados.ehMeu && !dados.fechado && (
                <section className="grid gap-4 md:grid-cols-2">
                  <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-soft">
                    <h3 className="text-[14px] font-semibold text-gray-900">Dias sem expediente</h3>
                    <p className="mt-0.5 text-[12.5px] text-gray-500">Férias, atestado e folgas saem da conta. Fins de semana e feriados (nacionais e de Belo Horizonte) já saem sozinhos.</p>
                    <ul className="mt-2 space-y-1">
                      {dados.config.ausencias.map((a) => (
                        <li key={a.id} className="flex items-center justify-between text-[13px] text-gray-700">
                          <span>{dia(a.de)} a {dia(a.ate)}{a.motivo ? ` · ${a.motivo}` : ""}</span>
                          <button type="button" onClick={() => removerAusencia(a.id)} className="text-[12px] text-red-600 hover:underline">remover</button>
                        </li>
                      ))}
                      {dados.config.ausencias.length === 0 && <li className="text-[13px] text-gray-400">Nenhuma ausência marcada.</li>}
                    </ul>
                    <div className="mt-3 flex flex-wrap items-end gap-2">
                      <input type="date" value={novaAus.de} onChange={(e) => setNovaAus({ ...novaAus, de: e.target.value })} aria-label="Primeiro dia" className="rounded-lg border border-gray-200 px-2 py-1 text-[13px]" />
                      <input type="date" value={novaAus.ate} onChange={(e) => setNovaAus({ ...novaAus, ate: e.target.value })} aria-label="Último dia" className="rounded-lg border border-gray-200 px-2 py-1 text-[13px]" />
                      <input type="text" value={novaAus.motivo} maxLength={120} placeholder="Motivo (opcional)" onChange={(e) => setNovaAus({ ...novaAus, motivo: e.target.value })} className="min-w-0 flex-1 rounded-lg border border-gray-200 px-2 py-1 text-[13px]" />
                      <button type="button" onClick={adicionarAusencia} className="rounded-lg border border-gray-200 bg-white px-3 py-1 text-[13px] font-medium text-gray-700 hover:bg-gray-50">Adicionar</button>
                    </div>
                  </div>
                  <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-soft">
                    <h3 className="text-[14px] font-semibold text-gray-900">Configuração</h3>
                    <div className="mt-2 flex items-center gap-2 text-[13px] text-gray-700">
                      Horas por dia útil
                      <input type="number" min={1} max={12} step={0.5} value={horasEdit ?? dados.config.horasPorDia} onChange={(e) => setHorasEdit(Number(e.target.value))} className="w-20 rounded-lg border border-gray-200 px-2 py-1 text-[13px]" />
                      <button type="button" onClick={() => { if (horasEdit) void acao({ acao: "configurar", horasPorDia: horasEdit }).then(() => setHorasEdit(null)); }} className="rounded-lg border border-gray-200 bg-white px-3 py-1 text-[13px] font-medium text-gray-700 hover:bg-gray-50">Salvar</button>
                    </div>
                    <div className="mt-4">
                      {dados.config.ativo
                        ? <button type="button" onClick={() => { if (window.confirm("Desativar? O sistema para de contar as suas horas a partir de hoje. Os meses já contados continuam.")) void acao({ acao: "desativar" }); }} className="text-[13px] font-medium text-red-600 hover:underline">Desativar o timesheet automático</button>
                        : <button type="button" onClick={() => acao({ acao: "ativar" })} className="rounded-lg bg-brand px-4 py-1.5 text-[13px] font-medium text-white hover:bg-brand-dark">Reativar</button>}
                    </div>
                  </div>
                </section>
              )}

              {/* ---------------------------------------------------------- dia a dia e regra */}
              <section className="rounded-2xl border border-gray-100 bg-white shadow-soft">
                <button type="button" onClick={() => setDiaADia((v) => !v)} className="flex w-full items-center justify-between px-4 py-3 text-left text-[14px] font-semibold text-gray-900" aria-expanded={diaADia}>
                  Dia a dia <span className="text-gray-400">{diaADia ? "▾" : "▸"}</span>
                </button>
                {diaADia && (
                  <div className="max-h-96 overflow-auto border-t border-gray-100 px-4 py-2">
                    {r.porDia.map((d) => (
                      <div key={d.dia} className="flex items-start justify-between gap-4 border-b border-gray-50 py-1.5 text-[13px] last:border-0">
                        <span className="w-24 shrink-0 text-gray-700">{dia(d.dia)}</span>
                        <span className="min-w-0 flex-1 text-gray-600">{d.semTarefa ? <span className="text-amber-700">sem tarefa em andamento</span> : d.tarefas.map((t) => `${titulosDasTarefas.get(t.id) ?? "tarefa"} (${num(t.horas)} h)`).join(" · ")}</span>
                      </div>
                    ))}
                    {r.diasIgnorados.length > 0 && <p className="mt-2 text-[12px] text-gray-500">Dias fora da conta: {r.diasIgnorados.map((i) => `${dia(i.dia)} (${i.motivo})`).join(", ")}.</p>}
                  </div>
                )}
              </section>

              <details className="rounded-2xl border border-gray-100 bg-white px-4 py-3 text-[13.5px] text-gray-600 shadow-soft">
                <summary className="cursor-pointer font-semibold text-gray-900">Como calculamos</summary>
                <ol className="mt-2 list-decimal space-y-1.5 pl-5">
                  <li>Cada dia útil contado vale {num(dados.config.horasPorDia)} h. Dia útil é segunda a sexta, sem feriado nacional, sem feriado de Belo Horizonte e sem as ausências que você marcou. Só contam os dias desde a ativação e, no mês corrente, até hoje.</li>
                  <li>Em cada dia, olha-se quais das suas tarefas estavam em andamento e as horas do dia se dividem igualmente entre elas.</li>
                  <li>Uma tarefa está em andamento pelo sinal mais confiável que existir: o histórico de status (só os dias em “Fazendo”; “Bloqueado” e “A fazer” pausam), depois as datas reais (início quando foi para “Fazendo”, fim quando concluiu) e, para tarefa nunca iniciada, as datas previstas. Tarefa concluída sem data conta no dia da conclusão.</li>
                  <li>Marcos de entrega não contam. Tarefa com subtarefa sua conta só pelas subtarefas.</li>
                  <li>Dia sem nenhuma tarefa em andamento não vai para nenhum centro de custo: aparece como horas sem tarefa.</li>
                  <li>O percentual é sobre as horas alocadas. Tarefa de projeto sem centro de custo aparece à parte e nunca é jogada em um centro por palpite.</li>
                </ol>
              </details>
            </>
          )}

          {/* ------------------------------------------------------------ equipe */}
          {aba === "equipe" && equipe && (
            <>
              <div className="flex flex-wrap items-center gap-2 text-[13px] text-gray-600">
                <span>{equipe.pessoas.length} pessoa(s) com o timesheet ativo · {num(equipe.total)} h alocadas em {mesBr(equipe.competencia)}</span>
                <div className="flex-1" />
                <a href={`/api/timesheet-auto/exportar?competencia=${competencia}`} className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 font-medium text-gray-700 hover:bg-gray-50">Baixar planilha da equipe</a>
              </div>
              <section className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-soft">
                <div className="border-b border-gray-100 px-4 py-3 text-[15px] font-semibold text-gray-900">Horas por centro de custo (todas as pessoas)</div>
                {equipe.centros.length === 0 ? <p className="px-4 py-6 text-center text-sm text-gray-500">Sem horas neste mês.</p> : equipe.centros.map((c) => (
                  <div key={c.chave} className="flex items-center justify-between border-b border-gray-50 px-4 py-2 text-[13.5px] last:border-0">
                    <span className={c.identificado ? "text-gray-800" : "text-amber-700"}>{rotuloCentro(c, equipe.nomesCentros)}</span>
                    <span className="tabular-nums text-gray-600">{c.pessoas} pessoa(s) · <b className="text-gray-900">{num(c.horas)} h</b></span>
                  </div>
                ))}
              </section>
              <section className="overflow-x-auto rounded-2xl border border-gray-100 bg-white shadow-soft">
                <table className="w-full min-w-[640px] text-left text-[13.5px]">
                  <thead className="bg-gray-50 text-[12px] uppercase tracking-wide text-gray-500">
                    <tr><th className="px-4 py-2">Pessoa</th><th className="px-3 py-2 text-right">Horas</th><th className="px-3 py-2 text-right">Sem tarefa</th><th className="px-4 py-2">Principais centros de custo</th></tr>
                  </thead>
                  <tbody>
                    {equipe.pessoas.map((p) => (
                      <tr key={p.pessoa.id} className="border-t border-gray-100 hover:bg-gray-50">
                        <td className="px-4 py-2"><button type="button" onClick={() => { setAlvoId(p.pessoa.id === meuId ? null : p.pessoa.id); setAba("meu"); }} className="font-medium text-gray-900 hover:text-brand">{p.pessoa.name}</button>{p.pessoa.cargo && <span className="block text-[12px] text-gray-500">{p.pessoa.cargo}</span>}{p.fechado && <span className="text-[11px] text-gray-500">mês fechado</span>}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{num(p.horasAlocadas)} h</td>
                        <td className={`px-3 py-2 text-right tabular-nums ${p.horasSemTarefa > 0 ? "text-amber-700" : "text-gray-500"}`}>{num(p.horasSemTarefa)} h</td>
                        <td className="px-4 py-2 text-gray-600">{p.centros.slice(0, 3).map((c) => `${c.codccu ?? (c.chave === "__sem_projeto__" ? "sem projeto" : "sem CC")} ${num(c.percentual)}%`).join(" · ") || "—"}</td>
                      </tr>
                    ))}
                    {equipe.pessoas.length === 0 && <tr><td colSpan={4} className="px-4 py-6 text-center text-gray-500">Ninguém da sua equipe ativou o timesheet ainda.</td></tr>}
                  </tbody>
                </table>
              </section>
            </>
          )}
        </>
      )}
      {carregando && <span className="sr-only" role="status">Atualizando</span>}
    </div>
  );
}
