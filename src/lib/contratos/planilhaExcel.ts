// Excel da Previsao mes a mes (planilha linha x mes), com os valores como NUMERO. E' o mesmo conteudo do botao "Exportar Excel" da planilha da
// Previsao e do Dossie do contrato. `rotuloDim` e' o nome da primeira coluna (Linha de custo, Centro de custo, Categoria ou Fornecedor).
import { mesLongo } from "@/lib/custos/formato";
import { abaDeLinhas, type AbaExcel } from "@/lib/exportarExcel";
import type { DadosPlanilha, LinhaPlan } from "@/components/contratos/PlanilhaMeses";

export function abaPrevisaoMesAMes(dados: DadosPlanilha, rotuloDim: string): AbaExcel {
  const temAntes = dados.totais.antes > 0.004, temDepois = dados.totais.depois > 0.004, temSemData = dados.totais.semData > 0.004;
  const cab = [rotuloDim, "Item", "Total no período", ...(temAntes ? ["Antes do período"] : []), ...dados.meses.map((m) => mesLongo(m)), ...(temDepois ? ["Depois do período"] : []), ...(temSemData ? ["Sem data"] : [])];
  const linha = (rot: string, item: string, l: LinhaPlan) => [rot, item, l.total, ...(temAntes ? [l.antes] : []), ...dados.meses.map((m) => l.porMes[m] ?? 0), ...(temDepois ? [l.depois] : []), ...(temSemData ? [l.semData] : [])];
  const corpo: (string | number)[][] = [];
  for (const l of dados.linhas) {
    corpo.push(linha(l.rotulo, "(total da linha)", l));
    for (const c of l.filhos ?? []) corpo.push(linha(l.rotulo, c.rotulo + (c.tipoValor ? ` [${c.tipoValor === "FIXO" ? "valor fixo" : "valor variável"}]` : ""), c));
  }
  corpo.push(linha("TOTAL", "", dados.totais));
  return abaDeLinhas("Previsão mês a mês", [cab, ...corpo], "Cada linha traz o seu \"(total da linha)\" e, abaixo, o detalhe; some só um dos níveis.", true);
}
