"use client";

// "Pessoas do projeto": quem esta na equipe do projeto (e por isso pode receber tarefa, aprovar e conversar no chat), com as pessoas de
// QUALQUER nucleo. Quem gerencia a equipe escolhe varias de uma vez na lista suspensa e remove com o "x". Usa a API de equipes que ja existe.
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
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/pessoas").then((r) => (r.ok ? r.json() : [])).then((l) => setOpcoes(Array.isArray(l) ? l : [])).catch(() => {});
  }, []);

  const jaNaEquipe = useMemo(() => new Set(membros.map((m) => m.user.id)), [membros]);
  const disponiveis = useMemo(() => opcoes.filter((p) => !jaNaEquipe.has(p.id)), [opcoes, jaNaEquipe]);
  const nucleoDe = useMemo(() => new Map(opcoes.map((p) => [p.id, p])), [opcoes]);

  async function adicionar() {
    if (!novos.length) return;
    setSalvando(true);
    setErro(null);
    const falhas: string[] = [];
    for (const userId of novos) {
      const r = await fetch(`/api/teams/${teamId}/members`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId, role: "MEMBRO" }) });
      if (!r.ok) falhas.push(userId);
    }
    setSalvando(false);
    setNovos(falhas);
    if (falhas.length) setErro(`Não foi possível adicionar ${falhas.length} pessoa(s). Tente de novo ou fale com quem gerencia a equipe.`);
    aoMudar();
  }

  async function remover(m: Membro) {
    if (!confirm(`Tirar ${m.user.name} do projeto? A pessoa sai da equipe «${teamName}» e deixa de aparecer para receber tarefas.`)) return;
    setErro(null);
    const r = await fetch(`/api/teams/${teamId}/members/${m.user.id}`, { method: "DELETE" });
    if (!r.ok) setErro("Não foi possível tirar a pessoa da equipe.");
    aoMudar();
  }

  return (
    <div className="mb-6 mt-4 rounded-xl border border-gray-200 bg-white p-4 text-sm">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold">Pessoas do projeto <span className="font-normal text-gray-400">({membros.length})</span></h2>
          <p className="text-xs text-gray-400">São as pessoas da equipe «{teamName}». Podem ser de qualquer núcleo.</p>
        </div>
        <BotaoExcel
          arquivo={`pessoas-${projeto}`}
          gerar={() => [{
            nome: "Pessoas do projeto",
            observacao: `Projeto: ${projeto} · Equipe: ${teamName}`,
            colunas: [{ titulo: "Nome", largura: 34 }, { titulo: "Papel na equipe", largura: 18 }, { titulo: "Cargo", largura: 34 }, { titulo: "Núcleo", largura: 26 }],
            linhas: membros.map((m) => [m.user.name, m.user.id === ownerId ? "Responsável" : m.role === "GESTOR" ? "Gestor" : "Membro", nucleoDe.get(m.user.id)?.cargo ?? "", nucleoDe.get(m.user.id)?.nucleo ?? ""]),
          }]}
        />
      </div>

      <div className="mb-3 flex flex-wrap gap-1.5">
        {membros.map((m) => (
          <span key={m.user.id} className="inline-flex items-center gap-1.5 rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-700">
            {m.user.name}
            {m.user.id === ownerId ? <em className="font-normal not-italic text-gray-400">responsável</em> : m.role === "GESTOR" ? <em className="font-normal not-italic text-gray-400">gestor</em> : null}
            {podeGerir && m.user.id !== ownerId && (
              <button type="button" onClick={() => remover(m)} aria-label={`Tirar ${m.user.name}`} className="text-gray-400 hover:text-red-600">×</button>
            )}
          </span>
        ))}
        {membros.length === 0 && <span className="text-xs text-gray-400">Ninguém na equipe ainda.</span>}
      </div>

      {podeGerir ? (
        <div>
          <p className="mb-1 text-xs font-medium text-gray-500">Adicionar pessoas</p>
          <EscolhaDePessoas pessoas={disponiveis} valor={novos} onChange={setNovos} max={60} vazio="Escolha na lista quem entra no projeto." />
          <div className="mt-2 flex items-center gap-3">
            <button type="button" onClick={adicionar} disabled={!novos.length || salvando} className="rounded-md bg-brand px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-dark disabled:opacity-40">
              {salvando ? "Adicionando…" : novos.length ? `Adicionar ${novos.length} ao projeto` : "Adicionar ao projeto"}
            </button>
            {erro && <span className="text-xs text-red-600">{erro}</span>}
          </div>
        </div>
      ) : (
        <p className="text-xs text-gray-400">Só quem gerencia a equipe do projeto (ou um administrador) inclui ou tira pessoas.</p>
      )}
    </div>
  );
}
