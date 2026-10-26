"use client";

import { LegendaLinha, LinhaAcompanhamento } from "@/components/custos/acompanhamento";
import { alinharCurvaFaturamento } from "@/lib/medicao/curvaFaturamento";

// Apresenta os valores ja' conciliados no periodo completo. LinhaAcompanhamento reutiliza
// mediaDoPeriodo/mediaMovel dos Custos, sem recalcular valores financeiros.
export default function CurvaFaturamentoContrato({ meses, de, ate, mesAtual }: {
  meses: ReadonlyArray<{ mes: string; faturado: number }>;
  de: string;
  ate: string;
  mesAtual: string;
}) {
  const serie = alinharCurvaFaturamento(meses, de, ate, mesAtual);
  return <div className="space-y-3">
    <LinhaAcompanhamento meses={serie.meses} valores={serie.valores} mesParcial={serie.mesParcial} modo="mensal" mostrarMedia mostrarMediaMovel rotuloAcessivel="Linha de acompanhamento do faturamento mensal do contrato" rotuloMensal="Faturamento no mês" />
    <LegendaLinha modo="mensal" mostrarMedia mostrarMediaMovel temMeta={false} rotuloMensal="Faturamento do mês" />
    <p className="text-xs text-gray-500">{serie.mesParcial ? "O mês atual está em andamento e fica fora das médias. " : ""}Meses sem faturamento entram como zero na média do período. A média móvel considera cada mês e os 2 anteriores dentro do período selecionado. Faturamento é NF + ND; medido sem nota e recebimentos não são somados à curva e continuam no detalhe da receita.</p>
  </div>;
}
