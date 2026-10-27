"use client";

// Filtros da aba P0 (valem para os numeros, graficos e tabelas ao mesmo tempo, junto com o periodo): tipo de custo (proprio x reembolsavel),
// grupo de contas e busca por conta. Mesma regra de filtro da aba Custos.

import type { Filtros, TipoCusto } from "@/lib/custos/agregacao";

type FiltroConta = Pick<Filtros, "tipo" | "grupo">;

const TIPOS: { valor: TipoCusto; nome: string }[] = [
  { valor: "todos", nome: "Todos" },
  { valor: "proprio", nome: "Custo próprio" },
  { valor: "reembolsavel", nome: "Reembolsável" },
];

export default function FiltrosP0({
  filtros,
  onMudar,
  grupos,
  busca,
  onBusca,
}: {
  filtros: FiltroConta;
  onMudar: (parcial: Partial<FiltroConta>) => void;
  /** grupos de contas que existem no P0 (ja' restritos ao tipo escolhido) */
  grupos: { codigo: string; nome: string }[];
  busca: string;
  onBusca: (v: string) => void;
}) {
  const ativo = filtros.tipo !== "todos" || filtros.grupo !== "todos" || busca.trim() !== "";
  const rotulo = "mb-1 block text-[11.5px] font-semibold uppercase tracking-wide text-gray-500";
  return (
    <section className="flex flex-wrap items-end gap-x-6 gap-y-3 rounded-2xl border border-gray-100 bg-white px-5 py-4 shadow-soft" aria-label="Filtros do P0">
      <div>
        <p className={rotulo}>Tipo de custo</p>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Tipo de custo">
          {TIPOS.map((t) => (
            <button
              key={t.valor}
              type="button"
              aria-pressed={filtros.tipo === t.valor}
              onClick={() => onMudar({ tipo: t.valor })}
              className={`rounded-full border px-3.5 py-1.5 text-[13px] font-medium transition ${filtros.tipo === t.valor ? "border-brand bg-brand text-white" : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"}`}
            >
              {t.nome}
            </button>
          ))}
        </div>
      </div>
      {grupos.length > 1 && (
        <div>
          <label className={rotulo} htmlFor="p0-filtro-grupo">Grupo de contas</label>
          <select id="p0-filtro-grupo" value={filtros.grupo} onChange={(e) => onMudar({ grupo: e.target.value })} className="rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-[13.5px] focus:border-brand focus:outline-none">
            <option value="todos">Todos os grupos</option>
            {grupos.map((g) => (
              <option key={g.codigo} value={g.codigo}>{g.nome}</option>
            ))}
          </select>
        </div>
      )}
      <div className="min-w-[200px] max-w-xs flex-1">
        <label className={rotulo} htmlFor="p0-filtro-conta">Conta</label>
        <input
          id="p0-filtro-conta"
          type="search"
          value={busca}
          onChange={(e) => onBusca(e.target.value)}
          placeholder="Buscar conta…"
          className="w-full rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-[13.5px] focus:border-brand focus:outline-none"
        />
      </div>
      {ativo && (
        <button type="button" onClick={() => { onMudar({ tipo: "todos", grupo: "todos" }); onBusca(""); }} className="pb-1.5 text-[13px] font-medium text-brand hover:text-brand-dark">
          Limpar filtros
        </button>
      )}
    </section>
  );
}
