"use client";

// Realizado de RECEITA de um contrato: resolve o numero Senior de medicao deste CCU e busca a receita reconciliada (NF + ND + medido ainda sem
// nota, mesma conta "receita" da aba Receita e Medicao) mes a mes, so' ate o mes atual (mes futuro nao tem realizado ainda). Nao altera nada, so' le.

import { useEffect, useState } from "react";

export type RealizadoReceita = {
  carregando: boolean;
  erro: string | null;
  numCtr: string | null;
  porMes: Map<string, number>;
  mesAtual: string;
};

const VAZIO: RealizadoReceita = { carregando: true, erro: null, numCtr: null, porMes: new Map(), mesAtual: "" };

export function useRealizadoReceitaDoContrato(codccu: string, de: string, ate: string): RealizadoReceita {
  const [estado, setEstado] = useState<RealizadoReceita>(VAZIO);

  useEffect(() => {
    if (!codccu || !de || !ate) return;
    const controller = new AbortController();
    setEstado({ ...VAZIO, carregando: true });

    (async () => {
      try {
        const rVinculo = await fetch(`/api/contratos/${encodeURIComponent(codccu)}/medicao`, { cache: "no-store", signal: controller.signal });
        const vinculo = await rVinculo.json().catch(() => ({}));
        if (controller.signal.aborted) return;
        if (!rVinculo.ok) {
          setEstado({ carregando: false, erro: typeof vinculo.error === "string" ? vinculo.error : "Não foi possível carregar a medição.", numCtr: null, porMes: new Map(), mesAtual: "" });
          return;
        }
        const numCtr: string | null = vinculo.contratos?.[0]?.numCtr ?? null;
        const mesAtual: string = vinculo.mesAtual ?? "";
        if (!numCtr) {
          setEstado({ carregando: false, erro: null, numCtr: null, porMes: new Map(), mesAtual });
          return;
        }

        const ateReal = mesAtual && ate > mesAtual ? mesAtual : ate;
        const qs = new URLSearchParams({ de, ate: ateReal });
        const rFat = await fetch(`/api/medicao/${encodeURIComponent(numCtr)}/faturamento?${qs}`, { cache: "no-store", signal: controller.signal });
        const fat = await rFat.json().catch(() => ({}));
        if (controller.signal.aborted) return;
        if (!rFat.ok || !fat.conciliacao) {
          setEstado({ carregando: false, erro: typeof fat.error === "string" ? fat.error : null, numCtr, porMes: new Map(), mesAtual: fat.mesAtual ?? mesAtual });
          return;
        }

        const porMes = new Map<string, number>();
        for (const m of fat.conciliacao.meses as { mes: string; receita: number }[]) porMes.set(m.mes, m.receita);
        setEstado({ carregando: false, erro: null, numCtr, porMes, mesAtual: fat.mesAtual ?? mesAtual });
      } catch {
        if (!controller.signal.aborted) setEstado({ carregando: false, erro: "Não foi possível carregar o realizado de receita.", numCtr: null, porMes: new Map(), mesAtual: "" });
      }
    })();

    return () => controller.abort();
  }, [codccu, de, ate]);

  return estado;
}
