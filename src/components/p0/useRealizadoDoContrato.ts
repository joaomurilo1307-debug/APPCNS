"use client";

// Realizado do Senior de UM contrato (mesma API da aba Custos), na base de mes escolhida (?base=competencia) -- para a aba P0 mostrar o
// realizado ao lado do previsto. Nao altera nada: so' le.

import { useEffect, useMemo, useState } from "react";
import { chaveMes, contratosNaBase, type BaseMes, type ContratoCusto } from "@/lib/custos/agregacao";

type Resposta = { contratos: ContratoCusto[]; meses: string[]; mesesCompetencia?: string[]; temCompetencia?: boolean; mesCorrente: string };

export type RealizadoDoContrato = {
  carregando: boolean;
  erro: string | null;
  contrato: ContratoCusto | null;
  /** meses disponiveis (aaaa-mm), do mais antigo ao mais novo */
  mesesAsc: string[];
  /** mes corrente (aaaa-mm): o realizado dele e' parcial (so' o ja' pago) */
  mesCorrente: string;
  base: BaseMes;
};

export function useRealizadoDoContrato(codccu: string, baseDesejada: BaseMes): RealizadoDoContrato {
  const [dados, setDados] = useState<Resposta | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setDados(null);
    setErro(null);
    fetch(`/api/custos-conta?ccu=${encodeURIComponent(codccu)}`, { cache: "no-store", signal: controller.signal })
      .then(async (r) => {
        const d = await r.json().catch(() => ({}));
        if (controller.signal.aborted) return;
        if (!r.ok) return setErro(d.error || "Não foi possível carregar o realizado do Senior.");
        setDados(d as Resposta);
      })
      .catch(() => {
        if (!controller.signal.aborted) setErro("Não foi possível carregar o realizado do Senior.");
      });
    return () => controller.abort();
  }, [codccu]);

  const base: BaseMes = baseDesejada === "competencia" && dados?.temCompetencia ? "competencia" : "pagamento";
  const contrato = useMemo(() => (dados ? contratosNaBase(dados.contratos, base).find((c) => c.codccu === codccu) ?? null : null), [dados, base, codccu]);
  const mesesAsc = useMemo(() => (dados ? (base === "competencia" && dados.mesesCompetencia ? dados.mesesCompetencia : dados.meses).map(chaveMes).sort() : []), [dados, base]);
  return { carregando: !dados && !erro, erro, contrato, mesesAsc, mesCorrente: dados ? chaveMes(dados.mesCorrente) : "", base };
}
