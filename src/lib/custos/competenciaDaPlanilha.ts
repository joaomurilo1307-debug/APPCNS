// Duas formas de olhar o mesmo custo do Senior:
// - "Pago no mes" (pagamento): cada parcela entra no mes em que foi paga. E' como as planilhas dos coordenadores (a coluna DATA COMPETENCIA delas
//   e' o proprio mes do pagamento: 98% a 100% das linhas de 2026, conferido em 18/10/2026).
// - "Competencia": cada parcela paga entra no mes da NOTA (competencia fiscal do Senior, E501TCP.USU_COMFIS): a compra aparece no mes dela,
//   com as parcelas ja pagas. Parcela a pagar nao entra (nao ha previsao na tela).
// A competencia fiscal fica gravada em CustoFinanceiroDetalhe.competenciaNota. Para desligar a visao Competencia, troque para false.
export const COMPETENCIA_FISCAL_ATIVA = true;
