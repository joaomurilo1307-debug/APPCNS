"use client";

// Barra de filtros da tela Custo por Contrato: periodo (de/ate + atalhos), tipo (proprio x reembolsavel), grupo de
// contas e busca. Os filtros valem para os graficos E para as tabelas ao mesmo tempo.

import type { BaseMes, Filtros, TipoCusto } from "@/lib/custos/agregacao";
import { mesLongo } from "@/lib/custos/formato";

export default function FiltrosCusto({
  mesesAsc,
  mesCorrente,
  filtros,
  onMudar,
  grupos,
  busca,
  onBusca,
  placeholderBusca,
  base,
  onBase,
  temCompetencia,
}: {
  mesesAsc: string[]; // chaves aaaa-mm disponiveis
  mesCorrente: string;
  filtros: Filtros;
  onMudar: (parcial: Partial<Filtros>) => void;
  grupos: { codigo: string; nome: string }[];
  busca: string;
  onBusca: (v: string) => void;
  placeholderBusca: string;
  base: BaseMes;
  onBase: (b: BaseMes) => void;
  /** ja ha detalhe com competencia da nota (depois da primeira atualizacao com a regra v2) */
  temCompetencia: boolean;
}) {
  const ultimo = mesesAsc[mesesAsc.length - 1];
  const primeiro = mesesAsc[0];
  const idxUltimo = mesesAsc.length - 1;
  const atalhos: { nome: string; de: string; ate: string }[] = [
    { nome: "Mês atual", de: mesCorrente, ate: mesCorrente },
    { nome: "Últimos 3 meses", de: mesesAsc[Math.max(0, idxUltimo - 2)], ate: ultimo },
    { nome: "Últimos 6 meses", de: mesesAsc[Math.max(0, idxUltimo - 5)], ate: ultimo },
    ...(primeiro < "2026-01" && mesesAsc.includes("2026-01") ? [{ nome: "Desde jan/26", de: "2026-01", ate: ultimo }] : []),
    { nome: primeiro < "2026-01" ? "Tudo (inclui compras antigas)" : "Ano todo", de: primeiro, ate: ultimo },
  ];
  const tipos: { valor: TipoCusto; nome: string }[] = [
    { valor: "todos", nome: "Todos" },
    { valor: "proprio", nome: "Custo próprio" },
    { valor: "reembolsavel", nome: "Reembolsável" },
  ];

  return (
    <div className="mb-5 rounded-2xl border border-gray-100 bg-white px-4 py-3 shadow-soft">
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div className="flex flex-wrap items-end gap-x-5 gap-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-gray-500">Período</label>
            <div className="flex items-center gap-1.5">
              <select
                value={filtros.de}
                onChange={(e) => onMudar({ de: e.target.value, ate: e.target.value > filtros.ate ? e.target.value : filtros.ate })}
                className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-[15px] focus:border-brand focus:outline-none"
                aria-label="Mês inicial"
              >
                {mesesAsc.map((m) => (
                  <option key={m} value={m}>
                    {mesLongo(m).replace(" de ", " ")}
                  </option>
                ))}
              </select>
              <span className="text-xs text-gray-400">até</span>
              <select
                value={filtros.ate}
                onChange={(e) => onMudar({ ate: e.target.value, de: e.target.value < filtros.de ? e.target.value : filtros.de })}
                className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-[15px] focus:border-brand focus:outline-none"
                aria-label="Mês final"
              >
                {mesesAsc.map((m) => (
                  <option key={m} value={m}>
                    {mesLongo(m).replace(" de ", " ")}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex flex-wrap gap-1.5 pb-0.5">
            {atalhos.map((a) => {
              const ativo = filtros.de === a.de && filtros.ate === a.ate;
              return (
                <button
                  key={a.nome}
                  type="button"
                  onClick={() => onMudar({ de: a.de, ate: a.ate })}
                  className={`rounded-full border px-3.5 py-1.5 text-[13px] font-medium transition ${ativo ? "border-brand bg-brand text-white" : "border-gray-200 bg-white text-gray-600 hover:border-gray-300 hover:bg-gray-50"}`}
                >
                  {a.nome}
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-gray-500">Buscar</label>
          <input
            type="search"
            value={busca}
            onChange={(e) => onBusca(e.target.value)}
            placeholder={placeholderBusca}
            className="w-72 rounded-lg border border-gray-200 bg-white px-3 py-2 text-[15px] focus:border-brand focus:outline-none"
          />
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-end gap-x-6 gap-y-3 border-t border-gray-100 pt-3">
        <div>
          <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-gray-500">Ver por</label>
          <div className="inline-flex overflow-hidden rounded-lg border border-gray-200" role="group" aria-label="Mês de referência">
            {([
              ["pagamento", "Data de pagamento", "Cada parcela entra no mês em que foi paga (como as planilhas)."],
              ["competencia", "Competência", "A compra inteira entra no mês da nota, mesmo que as parcelas sejam pagas depois."],
            ] as const).map(([valor, nome, dica]) => (
              <button
                key={valor}
                type="button"
                title={temCompetencia || valor === "pagamento" ? dica : "Disponível depois da próxima atualização do Senior."}
                disabled={valor === "competencia" && !temCompetencia}
                onClick={() => onBase(valor)}
                className={`px-3.5 py-1.5 text-[13px] font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${base === valor ? "bg-brand text-white" : "bg-white text-gray-600 hover:bg-gray-50"}`}
              >
                {nome}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-gray-500">Tipo de custo</label>
          <div className="inline-flex overflow-hidden rounded-lg border border-gray-200" role="group">
            {tipos.map((t) => (
              <button
                key={t.valor}
                type="button"
                onClick={() => onMudar({ tipo: t.valor })}
                className={`px-3.5 py-1.5 text-[13px] font-medium transition ${filtros.tipo === t.valor ? "bg-brand text-white" : "bg-white text-gray-600 hover:bg-gray-50"}`}
              >
                {t.nome}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-gray-500">Grupo de contas</label>
          <select value={filtros.grupo} onChange={(e) => onMudar({ grupo: e.target.value })} className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-[15px] focus:border-brand focus:outline-none">
            <option value="todos">Todos os grupos</option>
            {grupos.map((g) => (
              <option key={g.codigo} value={g.codigo}>
                {g.nome}
              </option>
            ))}
          </select>
        </div>

        {(filtros.tipo !== "todos" || filtros.grupo !== "todos" || busca) && (
          <button
            type="button"
            onClick={() => {
              onMudar({ tipo: "todos", grupo: "todos" });
              onBusca("");
            }}
            className="pb-1.5 text-xs font-medium text-brand hover:text-brand-dark"
          >
            Limpar filtros
          </button>
        )}
      </div>
    </div>
  );
}
