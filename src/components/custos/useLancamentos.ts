"use client";

// Le UMA vez os lancamentos do Senior de um centro de custo no periodo (mesma rota da gaveta de detalhe) e entrega para os paineis de
// fornecedores. So' leitura; nada e' calculado fora do que o Senior trouxe.

import { useEffect, useState } from "react";
import type { BaseMes, Filtros } from "@/lib/custos/agregacao";

export type LancCusto = {
  contaCodigo: number | null;
  contaFinanceira: string;
  numTit: string;
  codFor: string;
  fornecedor: string | null;
  valorRateado: number;
  competencia: string; // AAAA-MM pela base escolhida (pagamento ou competencia)
  dataPagamento?: string | null;
  formaBaixa?: string | null;
};
export type DadosLancamentos = LancCusto[] | "carregando" | "erro";

/** `codccu` aceita 1 centro de custo ou uma lista (soma varios contratos filtrados juntos) -- a rota ja aceita lista separada por virgula. */
export function useLancamentos(codccu: string | ReadonlyArray<string>, filtros: Filtros, base: BaseMes): DadosLancamentos {
  const [dados, setDados] = useState<DadosLancamentos>("carregando");
  const codccuChave = Array.isArray(codccu) ? codccu.join(",") : (codccu as string);
  useEffect(() => {
    let cancelado = false;
    setDados("carregando");
    const qs = new URLSearchParams({ codccu: codccuChave, de: filtros.de, ate: filtros.ate, base });
    fetch(`/api/custos-conta/lancamentos?${qs.toString()}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => !cancelado && setDados(d.linhas as LancCusto[]))
      .catch(() => !cancelado && setDados("erro"));
    return () => {
      cancelado = true;
    };
  }, [codccuChave, filtros.de, filtros.ate, base]);
  return dados;
}
