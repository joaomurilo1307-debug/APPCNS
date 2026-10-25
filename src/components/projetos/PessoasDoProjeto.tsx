"use client";

// Aba "Equipe" do projeto: quem esta na equipe (e por isso pode receber tarefa, aprovar e conversar no chat). Monte a equipe ANTES de criar as tarefas.
// Pessoas de QUALQUER nucleo: quem gerencia a equipe escolhe varias de uma vez na lista suspensa, define o papel (gestor ou membro) e remove com o "x".
// Projetos sao particulares: cada pessoa so' ve os projetos em que esta. Usa a API de equipes que ja existe.
import { useEffect, useMemo, useState } from "react";
import EscolhaDePessoas from "@/components/demandas/Pessoas";
import BotaoExcel from "@/components/BotaoExcel";
import type { PessoaOpcao } from "@/lib/agruparPessoas";

type Membro = { role: string; user: { id: string; name: string } };

export default function PessoasDoProjeto({
  projeto, teamId, teamName, membros, ownerId, podeGerir, aoMudar,
}: { projeto: string; teamId: string; teamName: string; membros: Membro[]; ownerId: string; podeGerir: boolean; aoMudar: () => void }) {
  const [opcoes, setOpcoes] = useState<PessoaOpcao[]>([]);
  const [novos, setNovos] = useState<string[]>([]);
  const [papelNovos, setPapelNovos] = useState<"MEMBRO" | "GESTOR">("MEMBRO");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/pessoas").then((r) => (r.ok ? r.json() : [])).then((l) => setOpcoes(Array.isArray(l) ? l : [])).catch(() => {});
  }, []);

  const jaNaEquipe = useMemo(() => new Set(membros.map((m) => m.user.id)), [membros]);
  const disponiveis = useMemo(() => opcoes.filter((p) => !jaNaEquipe.has(p.id)), [opcoes, jaNaEquipe]);
  const nucleoDe = useMemo(() => new Map(opcoes.map((p) => [p.id, p])), [opcoes]);
  const gestores = membros.filter((m) => m.role === "GESTOR").length;

  async function adicionar() {
    if (!novos.length) return;
    setSalvando(true);
    setErro(null);
    const falhas: string[] = [];
    for (const userId of novos) {
      const r = await fetch(`/api/teams/${teamId}/members`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId, role: papelNovos }) });
      if (!r.ok) falhas.push(userId);
    }
    setSalvando(false);
    setNovos(falhas);
    if (falhas.length) setErro(`Não foi possível adicionar ${falhas.length} pessoa(s). Tente de novo ou fale com quem gerencia a equipe.`);
    aoMudar();
  }

  async function mudarPapel(m: Membro, role: string) {
    setErro(null);
    const r = await fetch(`/api/teams/${teamId}/members`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId: m.user.id, role }) });
    if (!r.ok) setErro("Não foi possível mudar o papel.");
    aoMudar();
  }

  async function remover(m: Membro) {
    if (!confirm(`Tirar ${m.user.name} do projeto? A pessoa sai da equipe «${teamName}» e deixa de ver o projeto e de receber tarefas.`)) return;
    setErro(null);
    const r = await fetch(`/api/teams/${teamId}/members/${m.user.id}`, { method: "DELETE" });
    if (!r.ok) setErro("Não foi possível tirar a pessoa da equipe.");
    aoMudar();
  }

  return (
    <div className="max-w-4xl">
      <div className="mb-4 rounded-xl border border-teal-100 bg-teal-50/50 p-3 text-[13px] text-teal-900">
        <b>Monte a equipe antes de criar as tarefas.</b> Quem estiver aqui vê o projeto e pode receber tarefas. As pessoas podem ser de <b>qualquer núcleo</b>. Cada pessoa só vê os projetos em que está:
        nunca os de outras pessoas, nem os do mesmo núcleo.
      </div>
      <div className="rounded-xl border border-gray-200 bg-white p-4 text-sm shadow-soft">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold">Equipe do projeto <span className="font-normal text-gray-400">({membros.length})</span></h2>
            <p className="text-xs text-gray-400">Equipe «{teamName}». Gestor gerencia a equipe e as tarefas; membro executa.</p>
          </div>
          <BotaoExcel
            arquivo={`equipe-${projeto}`}
            gerar={() => [{
              nome: "Equipe do projeto",
              observacao: `Projeto: ${projeto} · Equipe: ${teamName}`,
              colunas: [{ titulo: "Nome", largura: 34 }, { titulo: "Papel na equipe", largura: 18 }, { titulo: "Cargo", largura: 34 }, { titulo: "Núcleo", largura: 26 }],
              linhas: membros.map((m) => [m.user.name, m.user.id === ownerId ? "Responsável" : m.role === "GESTOR" ? "Gestor" : "Membro", nucleoDe.get(m.user.id)?.cargo ?? "", nucleoDe.get(m.user.id)?.nucleo ?? ""]),
            }]}
          />
        </div>

        <ul className="mb-4 divide-y divide-gray-100 rounded-lg border border-gray-100">
          {membros.map((m) => {
            const info = nucleoDe.get(m.user.id);
            const dono = m.user.id === ownerId;
            const ultimoGestor = m.role === "GESTOR" && gestores <= 1;
            return (
              <li key={m.user.id} className="flex flex-wrap items-center gap-3 px-3 py-2">
                <span className="min-w-[10rem] flex-1">
                  <span className="font-medium text-gray-800">{m.user.name}</span>
                  {dono && <span className="ml-2 rounded-full bg-brand/10 px-2 py-0.5 text-[11px] font-medium text-brand-dark">responsável</span>}
                  {(info?.cargo || info?.nucleo) && <span className="block text-xs text-gray-400">{[info.cargo, info.nucleo].filter(Boolean).join(" · ")}</span>}
                </span>
                {podeGerir ? (
                  <select
                    value={m.role === "GESTOR" ? "GESTOR" : "MEMBRO"}
                    onChange={(e) => mudarPapel(m, e.target.value)}
                    disabled={ultimoGestor}
                    title={ultimoGestor ? "A equipe precisa de pelo menos um gestor" : "Papel na equipe"}
                    aria-label={`Papel de ${m.user.name}`}
                    className="rounded-md border border-gray-200 px-2 py-1 text-xs disabled:opacity-60"
                  >
                    <option value="MEMBRO">Membro</option>
                    <option value="GESTOR">Gestor</option>
                  </select>
                ) : (
                  <span className="text-xs text-gray-500">{m.role === "GESTOR" ? "Gestor" : "Membro"}</span>
                )}
                {podeGerir && !dono && (
                  <button type="button" onClick={() => remover(m)} aria-label={`Tirar ${m.user.name}`} className="text-gray-400 hover:text-red-600" title="Tirar da equipe">×</button>
                )}
              </li>
            );
          })}
          {membros.length === 0 && <li className="px-3 py-3 text-xs text-gray-400">Ninguém na equipe ainda.</li>}
        </ul>

        {podeGerir ? (
          <div>
            <p className="mb-1 text-xs font-medium text-gray-500">Adicionar pessoas à equipe</p>
            <EscolhaDePessoas pessoas={disponiveis} valor={novos} onChange={setNovos} max={60} vazio="Escolha na lista quem entra no projeto (de qualquer núcleo)." />
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-1.5 text-xs text-gray-500">
                Entram como
                <select value={papelNovos} onChange={(e) => setPapelNovos(e.target.value as "MEMBRO" | "GESTOR")} className="rounded-md border border-gray-200 px-2 py-1 text-xs text-gray-800">
                  <option value="MEMBRO">Membro</option>
                  <option value="GESTOR">Gestor</option>
                </select>
              </label>
              <button type="button" onClick={adicionar} disabled={!novos.length || salvando} className="rounded-md bg-brand px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-dark disabled:opacity-40">
                {salvando ? "Adicionando…" : novos.length ? `Adicionar ${novos.length} à equipe` : "Adicionar à equipe"}
              </button>
              {erro && <span className="text-xs text-red-600">{erro}</span>}
            </div>
          </div>
        ) : (
          <p className="text-xs text-gray-400">Só quem gerencia a equipe do projeto (ou um administrador) inclui ou tira pessoas.</p>
        )}
        {!podeGerir && erro && <p className="mt-2 text-xs text-red-600">{erro}</p>}
      </div>
    </div>
  );
}
