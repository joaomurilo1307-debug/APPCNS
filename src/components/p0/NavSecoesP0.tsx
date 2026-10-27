"use client";

// Atalhos fixos no topo da aba P0: a pagina tem varias secoes e rola bastante; cada atalho leva a uma secao e o que esta' em vista fica destacado.

import { useEffect, useRef, useState } from "react";

export default function NavSecoesP0({ itens }: { itens: { id: string; nome: string }[] }) {
  const [ativo, setAtivo] = useState<string | undefined>(itens[0]?.id);
  const emVista = useRef(new Set<string>());
  const chave = itens.map((i) => i.id).join("|");

  useEffect(() => {
    const els = chave
      .split("|")
      .map((id) => document.getElementById(id))
      .filter((e): e is HTMLElement => !!e);
    if (!els.length || typeof IntersectionObserver === "undefined") return;
    emVista.current = new Set();
    const obs = new IntersectionObserver(
      (entradas) => {
        // o observador so' entrega o que mudou: guardamos o conjunto do que esta' em vista e destacamos a secao mais acima entre elas
        for (const e of entradas) {
          if (e.isIntersecting) emVista.current.add(e.target.id);
          else emVista.current.delete(e.target.id);
        }
        const primeira = Array.from(emVista.current)
          .map((id) => document.getElementById(id))
          .filter((e): e is HTMLElement => !!e)
          .sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top)[0];
        if (primeira) setAtivo(primeira.id);
      },
      { rootMargin: "-80px 0px -55% 0px", threshold: 0 }
    );
    els.forEach((e) => obs.observe(e));
    return () => obs.disconnect();
  }, [chave]);

  return (
    <nav className="sticky top-2 z-20 -mx-1 flex gap-1 overflow-x-auto rounded-2xl border border-gray-100 bg-white/90 p-1.5 shadow-soft backdrop-blur" aria-label="Seções do P0">
      {itens.map((i) => (
        <button
          key={i.id}
          type="button"
          onClick={() => {
            setAtivo(i.id);
            document.getElementById(i.id)?.scrollIntoView({ behavior: "smooth", block: "start" });
          }}
          className={`whitespace-nowrap rounded-xl px-3.5 py-1.5 text-[13.5px] font-medium transition ${ativo === i.id ? "bg-brand text-white shadow-sm" : "text-gray-600 hover:bg-gray-100"}`}
        >
          {i.nome}
        </button>
      ))}
    </nav>
  );
}
