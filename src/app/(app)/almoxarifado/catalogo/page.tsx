"use client";

import { useEffect, useMemo, useState } from "react";

type Contrato = { id: string; codigo: string; nome: string | null };
type Regra = { id: string; funcao: string; categoria: string; descricao: string; contrato: Contrato };

export default function CatalogoPage() {
  const [contratos, setContratos] = useState<Contrato[]>([]);
  const [regras, setRegras] = useState<Regra[]>([]);
  const [contratoId, setContratoId] = useState("");
  const [funcaoAberta, setFuncaoAberta] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/epi/contratos").then((r) => r.json()).then(setContratos).catch(() => {});
  }, []);

  useEffect(() => {
    const qs = contratoId ? `?contratoId=${contratoId}` : "";
    fetch(`/api/epi/funcao-regras${qs}`).then((r) => r.json()).then(setRegras).catch(() => {});
  }, [contratoId]);

  const porFuncao = useMemo(() => {
    const map = new Map<string, Regra[]>();
    for (const r of regras) {
      const key = `${r.funcao}__${r.contrato.codigo}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(r);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [regras]);

  return (
    <div>
      <p className="mb-4 text-sm text-gray-500">
        Qual EPI cada função usa, por contrato — vem da matriz oficial de EPIs por função. Serve de referência técnica
        e, no futuro, também pra calcular quantas pessoas usam cada item sem marcar pessoa por pessoa.
      </p>

      <div className="mb-4">
        <select value={contratoId} onChange={(e) => setContratoId(e.target.value)} className="rounded-lg border border-gray-300 px-3 py-2 text-sm">
          <option value="">Todos os contratos</option>
          {contratos.map((c) => (
            <option key={c.id} value={c.id}>
              {c.codigo} {c.nome ? `— ${c.nome}` : ""}
            </option>
          ))}
        </select>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        {porFuncao.map(([key, items]) => {
          const [funcao, codigo] = key.split("__");
          const aberto = funcaoAberta === key;
          return (
            <div key={key} className="rounded-2xl border border-gray-200 bg-white shadow-sm">
              <button
                onClick={() => setFuncaoAberta(aberto ? null : key)}
                className="flex w-full items-center justify-between px-5 py-3 text-left"
              >
                <div>
                  <p className="text-sm font-semibold text-gray-700">{funcao}</p>
                  <p className="text-xs text-gray-400">Contrato {codigo} · {items.length} categorias de EPI</p>
                </div>
                <span className="text-gray-400">{aberto ? "−" : "+"}</span>
              </button>
              {aberto && (
                <div className="space-y-2 border-t border-gray-100 px-5 py-3">
                  {items.map((r) => (
                    <div key={r.id}>
                      <p className="text-xs font-semibold uppercase tracking-wide text-brand-dark">{r.categoria}</p>
                      <p className="whitespace-pre-line text-xs text-gray-500">{r.descricao}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
        {porFuncao.length === 0 && <p className="text-sm text-gray-400">Nenhuma regra importada ainda.</p>}
      </div>
    </div>
  );
}
