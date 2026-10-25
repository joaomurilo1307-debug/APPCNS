// Vinculo da ficha ao Senior pelo CCU principal, sem nome, rateio secundario ou leitura externa.
export type ContratoParaVinculo = {
  numCtr: string;
  numOfi: string;
  codccu: string | null;
  codccusItens?: string | null;
  valorContratado: number;
  valorMedido: number;
};

export type ResumoVinculoMedicao = {
  contratos: { numCtr: string; numOfi: string; valorContratado: number; valorMedido: number; saldo: number; maisDeUmCcu: boolean }[];
  totais: { contratado: number; medido: number; saldo: number; pct: number };
};

export type VinculoMedicaoContrato = ResumoVinculoMedicao & {
  codccu: string;
  mesAtual: string;
  atualizadoEm: string | null;
};

const arred = (v: number) => Math.round(v * 100) / 100;

export function resumirVinculosMedicao(codccu: string, contratos: readonly ContratoParaVinculo[]): ResumoVinculoMedicao {
  const vinculados = contratos.filter((c) => c.codccu === codccu).map((c) => ({
    numCtr: c.numCtr,
    numOfi: c.numOfi,
    valorContratado: c.valorContratado,
    valorMedido: c.valorMedido,
    saldo: arred(c.valorContratado - c.valorMedido),
    maisDeUmCcu: (c.codccusItens ?? "").split(",").filter(Boolean).length > 1,
  })).sort((a, b) => a.numOfi.localeCompare(b.numOfi, "pt-BR") || a.numCtr.localeCompare(b.numCtr, "pt-BR", { numeric: true }));
  const contratado = arred(vinculados.reduce((s, c) => s + c.valorContratado, 0));
  const medido = arred(vinculados.reduce((s, c) => s + c.valorMedido, 0));
  return { contratos: vinculados, totais: { contratado, medido, saldo: arred(contratado - medido), pct: contratado > 0 ? medido / contratado : 0 } };
}
