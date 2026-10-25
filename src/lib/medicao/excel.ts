// Excel da Medicao linha a linha (uma linha por linha do contrato: preco, vendido, medido mes a mes em valor e quantidade, consumido, saldo e % de
// consumo). E' o mesmo conteudo do botao "Exportar Excel" da tela de medicao do contrato e do Dossie do contrato.
import { mesLongo } from "@/lib/custos/formato";
import { abaDeLinhas, type AbaExcel } from "@/lib/exportarExcel";

export type DadosMedicaoParaExcel = {
  meses: string[];
  linhas: {
    descricao: string; unidade: string | null; precoUnit: number; qtdContratada: number; valorContratado: number; antes: { valor: number };
    porMes: Record<string, { valor: number; qtd: number } | undefined>; qtdFaturada: number; valorFaturado: number; saldoQtd: number; saldoValor: number; pctQtd: number; pctValor: number;
  }[];
  contrato: { codccu: string | null; numCtr: string };
};

/** `per` = periodo mostrado (aaaa-mm). Os dois % entram como fracao e saem formatados como percentual. */
export function abaMedicaoPorLinha(d: DadosMedicaoParaExcel, per: { de: string; ate: string }): AbaExcel {
  const cab = ["Linha", "Unidade", "Preço unitário (R$)", "Vendido (qtd)", "Vendido (R$)", "Antes do período (R$)", ...d.meses.map((m) => `${mesLongo(m)} (R$)`), ...d.meses.map((m) => `${mesLongo(m)} (qtd)`), "Consumido (qtd)", "Consumido (R$)", "Saldo (qtd)", "Saldo (R$)", "Consumo qtd (%)", "Consumo valor (%)"];
  const linhas = d.linhas.map((l) => [l.descricao, l.unidade ?? "", l.precoUnit, l.qtdContratada, l.valorContratado, l.antes.valor, ...d.meses.map((m) => l.porMes[m]?.valor ?? 0), ...d.meses.map((m) => l.porMes[m]?.qtd ?? 0), l.qtdFaturada, l.valorFaturado, l.saldoQtd, l.saldoValor, l.pctQtd, l.pctValor]);
  return abaDeLinhas("Medição por linha", [cab, ...linhas], `Contrato ${d.contrato.codccu ?? d.contrato.numCtr} · período ${per.de} a ${per.ate}`, false, { "Consumo qtd (%)": "percentual", "Consumo valor (%)": "percentual", "Unidade": "texto" });
}
