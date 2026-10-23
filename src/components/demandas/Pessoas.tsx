"use client";

// Escolha de varias pessoas (quem atende a demanda, quem executa o projeto, quem so' acompanha): fichas das escolhidas + busca com sugestoes.
import { useMemo, useState } from "react";

export type PessoaOpcao = { id: string; name: string; cargo?: string | null };

export default function EscolhaDePessoas({
  pessoas, valor, onChange, max = 30, vazio = "Ninguém escolhido.",
}: { pessoas: PessoaOpcao[]; valor: string[]; onChange: (ids: string[]) => void; max?: number; vazio?: string }) {
  const [busca, setBusca] = useState("");
  const [aberto, setAberto] = useState(false);
  const escolhidos = useMemo(() => valor.map((id) => pessoas.find((p) => p.id === id)).filter((p): p is PessoaOpcao => !!p), [valor, pessoas]);
  const sugestoes = useMemo(() => {
    const t = busca.trim().toLowerCase();
    return pessoas.filter((p) => !valor.includes(p.id) && (!t || `${p.name} ${p.cargo ?? ""}`.toLowerCase().includes(t))).slice(0, 8);
  }, [pessoas, valor, busca]);
  const cheio = valor.length >= max;

  return (
    <div>
      <div className="mb-2 flex flex-wrap gap-1.5">
        {escolhidos.map((p) => (
          <span key={p.id} className="inline-flex items-center gap-1.5 rounded-full bg-brand/10 px-2.5 py-1 text-xs font-medium text-brand-dark">
            {p.name}
            <button type="button" onClick={() => onChange(valor.filter((x) => x !== p.id))} aria-label={`Remover ${p.name}`} className="text-gray-500 hover:text-red-600">×</button>
          </span>
        ))}
        {escolhidos.length === 0 && <span className="text-xs text-gray-400">{vazio}</span>}
      </div>
      <div className="relative">
        <input
          value={busca}
          onChange={(e) => { setBusca(e.target.value); setAberto(true); }}
          onFocus={() => setAberto(true)}
          onBlur={() => setTimeout(() => setAberto(false), 150)}
          disabled={cheio}
          placeholder={cheio ? `Máximo de ${max} pessoas` : "Buscar pessoa pelo nome ou cargo…"}
          className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-brand focus:outline-none disabled:bg-gray-50"
          autoComplete="off"
        />
        {aberto && !cheio && (
          <ul className="absolute z-10 mt-1 max-h-56 w-full overflow-y-auto rounded-lg border border-gray-200 bg-white py-1 shadow-lg">
            {sugestoes.map((p) => (
              <li key={p.id}>
                <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => { onChange([...valor, p.id]); setBusca(""); }} className="flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-sm hover:bg-gray-50">
                  <span>{p.name}</span>
                  {p.cargo && <span className="truncate text-xs text-gray-400">{p.cargo}</span>}
                </button>
              </li>
            ))}
            {sugestoes.length === 0 && <li className="px-3 py-2 text-xs text-gray-400">Ninguém encontrado.</li>}
          </ul>
        )}
      </div>
    </div>
  );
}
