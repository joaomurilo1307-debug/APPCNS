"use client";

// Le o P0 de custo de contrato de UM contrato (/api/p0/custos). Estados: carregando, erro, sem (o contrato ainda nao tem P0) e ok.

import { useEffect, useState } from "react";
import type { P0Custos } from "@/lib/p0/montar";

export type EstadoP0 = { estado: "carregando" } | { estado: "erro"; mensagem: string } | { estado: "sem" } | { estado: "ok"; p0: P0Custos };

export function useP0Custos(codccu: string): EstadoP0 {
  const [e, setE] = useState<EstadoP0>({ estado: "carregando" });
  useEffect(() => {
    const controller = new AbortController();
    setE({ estado: "carregando" });
    fetch(`/api/p0/custos?ccu=${encodeURIComponent(codccu)}`, { cache: "no-store", signal: controller.signal })
      .then(async (r) => {
        const d = await r.json().catch(() => ({}));
        if (controller.signal.aborted) return;
        if (!r.ok) return setE({ estado: "erro", mensagem: d.error || "Não foi possível carregar o P0." });
        setE(d.existe ? { estado: "ok", p0: d as P0Custos } : { estado: "sem" });
      })
      .catch(() => {
        if (!controller.signal.aborted) setE({ estado: "erro", mensagem: "Não foi possível carregar o P0." });
      });
    return () => controller.abort();
  }, [codccu]);
  return e;
}
