"use client";

// Escolha de varias pessoas (quem atende a demanda, quem executa o projeto, quem so' acompanha): fichas das escolhidas + lista suspensa
// com TODAS as pessoas, agrupadas por nucleo, com busca. Escolher uma pessoa nao fecha a lista (da' pra marcar varias em sequencia).
import { useMemo, useRef, useState } from "react";
import { agruparPessoas, type PessoaOpcao } from "@/lib/agruparPessoas";

export type { PessoaOpcao };

export default function EscolhaDePessoas({
  pessoas, valor, onChange, max = 30, vazio = "Ninguém escolhido.",
}: { pessoas: PessoaOpcao[]; valor: string[]; onChange: (ids: string[]) => void; max?: number; vazio?: string }) {
  const [busca, setBusca] = useState("");
  const [aberto, setAberto] = useState(false);
  const campo = useRef<HTMLInputElement>(null);
  const escolhidos = useMemo(() => valor.map((id) => pessoas.find((p) => p.id === id)).filter((p): p is PessoaOpcao => !!p), [valor, pessoas]);
  const grupos = useMemo(() => agruparPessoas(pessoas, valor, busca), [pessoas, valor, busca]);
  const disponiveis = grupos.reduce((s, g) => s + g.pessoas.length, 0);
  const cheio = valor.length >= max;
  const temNucleos = pessoas.some((p) => p.nucleo);

  function adicionar(ids: string[]) {
    const novos = ids.filter((id) => !valor.includes(id)).slice(0, Math.max(0, max - valor.length));
    if (novos.length) onChange([...valor, ...novos]);
    setBusca("");
    campo.current?.focus();
  }

  return (
    <div>
      <div className="mb-2 flex flex-wrap gap-1.5">
        {escolhidos.map((p) => (
          <span key={p.id} title={[p.cargo, p.nucleo].filter(Boolean).join(" · ") || undefined} className="inline-flex items-center gap-1.5 rounded-full bg-brand/10 px-2.5 py-1 text-xs font-medium text-brand-dark">
            {p.name}
            <button type="button" onClick={() => onChange(valor.filter((x) => x !== p.id))} aria-label={`Remover ${p.name}`} className="text-gray-500 hover:text-red-600">×</button>
          </span>
        ))}
        {escolhidos.length === 0 && <span className="text-xs text-gray-400">{vazio}</span>}
        {escolhidos.length > 1 && (
          <button type="button" onClick={() => onChange([])} className="text-xs text-gray-400 underline hover:text-red-600">limpar</button>
        )}
      </div>
      <div className="relative">
        <input
          ref={campo}
          value={busca}
          onChange={(e) => { setBusca(e.target.value); setAberto(true); }}
          onFocus={() => setAberto(true)}
          onBlur={() => setTimeout(() => setAberto(false), 150)}
          onKeyDown={(e) => {
            if (e.key === "Escape") setAberto(false);
            if (e.key === "Enter") { e.preventDefault(); const primeira = grupos[0]?.pessoas[0]; if (primeira && !cheio) adicionar([primeira.id]); }
          }}
          disabled={cheio}
          placeholder={cheio ? `Máximo de ${max} pessoas` : "Clique para escolher ou digite o nome, cargo ou núcleo…"}
          className="w-full rounded-lg border border-gray-200 py-2 pl-3 pr-9 text-sm focus:border-brand focus:outline-none disabled:bg-gray-50"
          autoComplete="off"
          role="combobox"
          aria-expanded={aberto}
        />
        <button
          type="button"
          tabIndex={-1}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => { if (aberto) setAberto(false); else { setAberto(true); campo.current?.focus(); } }}
          disabled={cheio}
          aria-label="Abrir a lista de pessoas"
          className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-1 text-gray-400 hover:text-gray-700 disabled:opacity-40"
        >
          <svg viewBox="0 0 20 20" className={`h-4 w-4 transition ${aberto ? "rotate-180" : ""}`} fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M5 8l5 5 5-5" /></svg>
        </button>
        {aberto && !cheio && (
          <div className="absolute z-20 mt-1 max-h-72 w-full overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg" role="listbox">
            {grupos.map((g) => (
              <div key={g.nucleo ?? "sem"}>
                {temNucleos && (
                  <div className="sticky top-0 flex items-center justify-between gap-2 border-b border-gray-100 bg-gray-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                    <span className="truncate">{g.nucleo ?? "Sem núcleo"} <span className="font-normal normal-case text-gray-400">({g.pessoas.length})</span></span>
                    {g.pessoas.length > 1 && (
                      <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => adicionar(g.pessoas.map((p) => p.id))} className="shrink-0 rounded px-1.5 py-0.5 text-[11px] font-medium normal-case text-brand-dark hover:bg-brand/10">
                        adicionar todos
                      </button>
                    )}
                  </div>
                )}
                {g.pessoas.map((p) => (
                  <button key={p.id} type="button" role="option" aria-selected="false" onMouseDown={(e) => e.preventDefault()} onClick={() => adicionar([p.id])} className="flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-sm hover:bg-gray-50">
                    <span>{p.name}</span>
                    {p.cargo && <span className="truncate text-xs text-gray-400">{p.cargo}</span>}
                  </button>
                ))}
              </div>
            ))}
            {disponiveis === 0 && (
              <p className="px-3 py-2 text-xs text-gray-400">{pessoas.length === 0 ? "Nenhuma pessoa disponível." : busca ? "Ninguém encontrado." : "Todas as pessoas já foram escolhidas."}</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
