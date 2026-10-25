// Lancamentos do periodo no layout do Rel114 do Senior (cabecalho + um registro por titulo + linha de TOTAL), a partir da resposta de
// /api/custos-conta/lancamentos. E' o mesmo layout dos botoes "Exportar lancamentos (Rel114)" das telas de custo.
export type RespostaLancamentos = { linhas: any[]; total: number };

export function linhasRel114(d: RespostaLancamentos): (string | number)[][] {
  const br = (iso: string | null) => (iso ? iso.split("-").reverse().join("/") : "");
  const cab = ["Centro de Custo", "Descrição Centro de Custo", "Competência", "Conta Financeira", "Descrição Conta Financeira", "Número do Título", "Código do Fornecedor", "Descrição do Fornecedor", "Data de Entrada", "Data de Vencimento", "Valor Rateio", "Data de Pagamento", "Competência da nota", "Forma de baixa"];
  const corpo = (d.linhas as any[]).map((l) => [l.codccu, l.centroDeCusto, l.competencia.split("-").reverse().join("/"), l.contaCodigo ?? "", l.contaFinanceira, l.numTit, l.codFor, l.fornecedor ?? "", br(l.dataEntrada), br(l.dataVencimento), l.valorRateado, br(l.dataPagamento), l.competenciaNota ? l.competenciaNota.split("-").reverse().join("/") : "", l.formaBaixa ?? ""]);
  corpo.push(["", "TOTAL", "", "", "", "", "", "", "", "", d.total, "", "", ""]);
  return [cab, ...corpo];
}
