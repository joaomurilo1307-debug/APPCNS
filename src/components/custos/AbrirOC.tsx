"use client";

// Abre a OC no mesmo "mapa da OC" que o resto do sistema usa (Programacao de Pagamento, Conferencia de OC, detalhe do custo): descritivo,
// rateio, niveis de aprovacao e os titulos que ela gerou. Uso: const { abrirOC, janelaOC } = useAbrirOC(); ... {janelaOC}

import { useCallback, useState } from "react";
import MapaOC, { type Aprovacao, type TituloVinculado } from "@/components/MapaOC";

type Estado = { aprovacao: Aprovacao; codToNome: Record<string, string>; titulosVinculados?: TituloVinculado[] } | "carregando" | null;

export function useAbrirOC() {
  const [oc, setOc] = useState<Estado>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const abrirOC = useCallback(async (numOcp: string) => {
    setAviso(null);
    setOc("carregando");
    try {
      const res = await fetch(`/api/senior/aprovacoes/${encodeURIComponent(numOcp)}`);
      if (res.status === 403) throw new Error("Você não tem permissão para ver os detalhes desta OC.");
      if (res.status === 404) throw new Error("Esta OC ainda não está na base sincronizada do Senior.");
      if (!res.ok) throw new Error("Não foi possível carregar a OC.");
      const data = await res.json();
      setOc({ aprovacao: data.aprovacao ?? data, codToNome: data.codToNome ?? {}, titulosVinculados: data.titulosVinculados });
    } catch (e: any) {
      setOc(null);
      setAviso(e?.message || "Não foi possível carregar a OC.");
    }
  }, []);

  const janelaOC = (
    <>
      {oc === "carregando" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
          <div className="rounded-lg bg-white px-4 py-3 text-sm text-gray-600 shadow-lg">Carregando a OC…</div>
        </div>
      )}
      {oc && oc !== "carregando" && (
        <MapaOC aprovacao={oc.aprovacao} codToNome={oc.codToNome} titulosVinculados={oc.titulosVinculados} onClose={() => setOc(null)} onAtualizado={() => abrirOC(oc.aprovacao.numOcp)} />
      )}
      {aviso && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={() => setAviso(null)}>
          <div className="max-w-sm rounded-xl bg-white p-5 text-sm text-gray-700 shadow-lg">
            <p>{aviso}</p>
            <button type="button" onClick={() => setAviso(null)} className="mt-3 rounded-lg border border-gray-200 px-3 py-1.5 text-[13px] font-medium text-gray-700 hover:bg-gray-50">Fechar</button>
          </div>
        </div>
      )}
    </>
  );

  return { abrirOC, janelaOC };
}
