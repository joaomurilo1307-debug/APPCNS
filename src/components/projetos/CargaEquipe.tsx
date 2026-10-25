"use client";

// Carga da equipe: tarefas abertas por pessoa nos projetos que a pessoa enxerga (regra em src/lib/projetos/carga.ts). Mostra quem esta
// sobrecarregado, quem tem atraso e o que vence nas proximas semanas, para redistribuir antes de estourar o prazo.
import { useEffect, useMemo, useState } from "react";
import BotaoExcel from "@/components/BotaoExcel";
import { cargaPorPessoa, type TarefaCarga } from "@/lib/projetos/carga";
import { useAtualizarAoVoltar } from "@/lib/atualizarAoVoltar";

export default function CargaEquipe() {
  const [tarefas, setTarefas] = useState<TarefaCarga[] | null>(null);
  const [busca, setBusca] = useState("");

  async function carregar() {
    const r = await fetch("/api/tasks", { cache: "no-store" });
    const d = await r.json().catch(() => null);
    if (r.ok && Array.isArray(d)) setTarefas(d);
  }
  useEffect(() => { void carregar(); }, []);
  useAtualizarAoVoltar(carregar);

  const carga = useMemo(() => cargaPorPessoa(tarefas ?? []), [tarefas]);
  const linhas = useMemo(() => {
    const t = busca.trim().toLowerCase();
    return carga.linhas.filter((l) => !t || l.nome.toLowerCase().includes(t));
  }, [carga, busca]);
  const maior = Math.max(1, ...carga.linhas.map((l) => l.abertas));
  const maiorSemana = Math.max(1, ...carga.linhas.flatMap((l) => l.semanas));
  const hoje = new Date();
  const rotuloSemana = (i: number) => {
    const d = new Date(hoje.getTime() + i * 7 * 86400000);
    return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
  };

  if (tarefas === null) return <p className="text-sm text-gray-400">Carregando a carga da equipe…</p>;

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <p className="max-w-2xl text-sm text-gray-500">
          Tarefas <b>abertas</b> de cada pessoa nos projetos que você enxerga, com o que já venceu e o que vence nas próximas semanas. Serve para redistribuir antes de estourar o prazo.
        </p>
        <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar pessoa…" aria-label="Buscar pessoa" className="ml-auto w-52 rounded-lg border border-gray-200 px-3 py-1.5 text-sm focus:border-brand focus:outline-none" />
        <BotaoExcel
          arquivo="carga-da-equipe"
          desabilitado={carga.linhas.length === 0}
          gerar={() => [{
            nome: "Carga da equipe",
            observacao: `Tarefas abertas por pessoa · gerado em ${hoje.toLocaleString("pt-BR")} · semanas contadas a partir de hoje`,
            colunas: [
              { titulo: "Pessoa", largura: 36 }, { titulo: "Abertas", tipo: "inteiro" }, { titulo: "Atrasadas", tipo: "inteiro" }, { titulo: "Vencem em 7 dias", tipo: "inteiro" }, { titulo: "Bloqueadas", tipo: "inteiro" }, { titulo: "Sem prazo", tipo: "inteiro" },
              ...Array.from({ length: carga.semanasMostradas }, (_, i) => ({ titulo: `Semana ${i + 1} (a partir de ${rotuloSemana(i)})`, tipo: "inteiro" as const })),
            ],
            linhas: [
              ...carga.linhas.map((l) => [l.nome, l.abertas, l.atrasadas, l.venceEm7, l.bloqueadas, l.semPrazo, ...l.semanas]),
              ...(carga.semResponsavel.abertas > 0 ? [["(sem responsável)", carga.semResponsavel.abertas, carga.semResponsavel.atrasadas, null, null, carga.semResponsavel.semPrazo]] : []),
            ],
          }]}
        />
      </div>

      {carga.linhas.length === 0 && carga.semResponsavel.abertas === 0 ? (
        <p className="rounded-xl border border-dashed border-gray-200 p-6 text-center text-sm text-gray-400">Nenhuma tarefa aberta nos projetos que você enxerga.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-100 bg-white shadow-soft">
          <table className="w-full min-w-[860px] text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                <th className="px-4 py-2.5">Pessoa</th>
                <th className="px-3 py-2.5">Abertas</th>
                <th className="px-3 py-2.5 text-center">Atrasadas</th>
                <th className="px-3 py-2.5 text-center">Vencem em 7 dias</th>
                <th className="px-3 py-2.5 text-center">Bloqueadas</th>
                <th className="px-3 py-2.5 text-center">Sem prazo</th>
                {Array.from({ length: carga.semanasMostradas }, (_, i) => (
                  <th key={i} className="px-2 py-2.5 text-center" title={`Tarefas com prazo na semana ${i + 1}, a partir de ${rotuloSemana(i)}`}>
                    Sem. {i + 1}
                    <span className="block font-normal normal-case text-gray-300">{rotuloSemana(i)}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {linhas.map((l) => (
                <tr key={l.id} className="border-b border-gray-50 hover:bg-gray-50/60">
                  <td className="px-4 py-2 font-medium text-gray-800">{l.nome}</td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <div className="h-2 w-28 overflow-hidden rounded-full bg-gray-100"><div className="h-2 rounded-full bg-brand" style={{ width: `${(l.abertas / maior) * 100}%` }} /></div>
                      <span className="tabular-nums text-gray-700">{l.abertas}</span>
                    </div>
                  </td>
                  <td className="px-3 py-2 text-center tabular-nums">{l.atrasadas > 0 ? <span className="rounded-full bg-rose-50 px-2 py-0.5 font-medium text-rose-600">{l.atrasadas}</span> : <span className="text-gray-300">0</span>}</td>
                  <td className="px-3 py-2 text-center tabular-nums text-gray-600">{l.venceEm7}</td>
                  <td className="px-3 py-2 text-center tabular-nums">{l.bloqueadas > 0 ? <span className="rounded-full bg-amber-50 px-2 py-0.5 font-medium text-amber-700">{l.bloqueadas}</span> : <span className="text-gray-300">0</span>}</td>
                  <td className="px-3 py-2 text-center tabular-nums text-gray-500">{l.semPrazo}</td>
                  {l.semanas.map((n, i) => (
                    <td key={i} className="px-2 py-2 text-center tabular-nums">
                      <span className="inline-block min-w-[1.75rem] rounded-md px-1.5 py-0.5 text-xs" style={{ backgroundColor: n > 0 ? `rgba(0,169,157,${0.12 + (n / maiorSemana) * 0.5})` : "transparent", color: n > 0 ? "#065f5a" : "#d1d5db" }}>{n}</span>
                    </td>
                  ))}
                </tr>
              ))}
              {carga.semResponsavel.abertas > 0 && !busca.trim() && (
                <tr className="bg-amber-50/40">
                  <td className="px-4 py-2 italic text-gray-600">Sem responsável</td>
                  <td className="px-3 py-2 tabular-nums text-gray-700">{carga.semResponsavel.abertas}</td>
                  <td className="px-3 py-2 text-center tabular-nums">{carga.semResponsavel.atrasadas > 0 ? <span className="rounded-full bg-rose-50 px-2 py-0.5 font-medium text-rose-600">{carga.semResponsavel.atrasadas}</span> : <span className="text-gray-300">0</span>}</td>
                  <td className="px-3 py-2 text-center text-gray-300">—</td>
                  <td className="px-3 py-2 text-center text-gray-300">—</td>
                  <td className="px-3 py-2 text-center tabular-nums text-gray-500">{carga.semResponsavel.semPrazo}</td>
                  <td colSpan={carga.semanasMostradas} className="px-2 py-2 text-xs text-gray-400">tarefas que ninguém assumiu ainda: distribua</td>
                </tr>
              )}
              {linhas.length === 0 && carga.linhas.length > 0 && (
                <tr><td colSpan={6 + carga.semanasMostradas} className="px-4 py-6 text-center text-sm text-gray-400">Ninguém encontrado com essa busca.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
