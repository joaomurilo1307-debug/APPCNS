// A coluna "DATA COMPETENCIA" das planilhas de controle dos coordenadores e' o proprio mes do pagamento (em 2026, 98% a 100% das linhas de
// cada planilha, conferido em 18/10/2026). Para a tela bater com as planilhas, "competencia" = mes do pagamento.
// A competencia fiscal da nota (E501TCP.USU_COMFIS) continua gravada em CustoFinanceiroDetalhe.competenciaNota, so' nao e' usada nas
// visoes. Para voltar a oferecer a visao "Competencia" da nota, troque para true.
export const COMPETENCIA_FISCAL_ATIVA = false;
