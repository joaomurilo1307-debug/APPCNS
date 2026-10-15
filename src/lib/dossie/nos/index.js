// Gerado por scripts/dossie-extrair-n8n (ver docs/dossie-no-appcns.md). Nome do no n8n -> funcao.
// @ts-nocheck
import n0 from "./decodificador-cabecalho-oc";
import n1 from "./normalizar-cabecalho-oc";
import n2 from "./decodificador-produtos-oc";
import n3 from "./normalizar-produtos-oc";
import n4 from "./decodificador-servicos-oc";
import n5 from "./normalizar-servicos-oc";
import n6 from "./decodificador-rateios-oc";
import n7 from "./normalizar-rateios-oc";
import n8 from "./decodificador-niveis-aprovacao";
import n9 from "./normalizar-niveis-aprovacao";
import n10 from "./preparar-aprovadores";
import n11 from "./decodificar-cadastro-aprovadores";
import n12 from "./normalizar-cadastro-aprovadores";
import n13 from "./preparar-titulos-informados";
import n14 from "./decodificar-titulos-financeiros";
import n15 from "./normalizar-titulos-financeiros";
import n16 from "./preparar-notas-fiscais";
import n17 from "./decodificar-notas-fiscais";
import n18 from "./normalizar-notas-fiscais";
import n19 from "./preparar-movimentacoes-financeiras";
import n20 from "./decodificar-movimentacoes-financeiras";
import n21 from "./normalizar-movimentacoes-financeiras";
import n22 from "./conciliacao-geral-oc";
import n23 from "./preparar-documentos-originais";
import n24 from "./preparar-requisicao-nf-e-e-docs";
import n25 from "./consolidar-dossie-final";
import n26 from "./gerar-html-do-dossie";
import n27 from "./decodificar-itens-produto-nf";
import n28 from "./decodificar-servicos-nf";
import n29 from "./normalizar-itens-produto-nf";
import n30 from "./normalizar-itens-servico-nf";
import n31 from "./enriquecer-notas-fiscais";
import n32 from "./preparar-historico-fornecedor";
import n33 from "./montar-sql-historico-fornecedor";
import n34 from "./normalizar-ultimas-3-compras";
import n35 from "./montar-sql-referencias-financeiras-historico";
import n36 from "./normalizar-referencias-financeiras-historico";
import n37 from "./preparar-titulos-historico-e501tcp";
import n38 from "./normalizar-titulos-historico-e501tcp";
import n39 from "./consolidar-historico-pagamento-fornecedor";
import n40 from "./montar-modelo-dossie-oc";
import n41 from "./consolidar-blocos-oc";
import n42 from "./code-in-javascript-nfs-e";
import n43 from "./consolidar-documentos-e-docs";
import n44 from "./decodificador-fornecedor";
import n45 from "./normalizar-fornecedor";
import n46 from "./montar-envio-do-dossie";
export const NOS = {
  "Decodificador Cabeçalho OC": n0,
  "Normalizar Cabeçalho OC": n1,
  "Decodificador Produtos OC": n2,
  "Normalizar Produtos OC": n3,
  "Decodificador Serviços OC": n4,
  "Normalizar Serviços OC": n5,
  "Decodificador Rateios OC": n6,
  "Normalizar Rateios OC": n7,
  "Decodificador Níveis Aprovação": n8,
  "Normalizar Níveis Aprovação": n9,
  "Preparar Aprovadores": n10,
  "Decodificar Cadastro Aprovadores": n11,
  "Normalizar Cadastro Aprovadores": n12,
  "Preparar Títulos Informados": n13,
  "Decodificar Títulos Financeiros": n14,
  "Normalizar Títulos Financeiros": n15,
  "Preparar Notas Fiscais": n16,
  "Decodificar Notas Fiscais": n17,
  "Normalizar Notas Fiscais": n18,
  "Preparar Movimentações Financeiras": n19,
  "Decodificar Movimentações Financeiras": n20,
  "Normalizar Movimentações Financeiras": n21,
  "Conciliação Geral OC": n22,
  "Preparar Documentos Originais": n23,
  "Preparar Requisição NF-e e-Docs": n24,
  "Consolidar Dossiê Final": n25,
  "Gerar HTML do Dossiê": n26,
  "Decodificar Itens Produto NF": n27,
  "Decodificar Serviços NF": n28,
  "Normalizar Itens Produto NF": n29,
  "Normalizar Itens Serviço NF": n30,
  "Enriquecer Notas Fiscais": n31,
  "Preparar Histórico Fornecedor": n32,
  "Montar SQL Histórico Fornecedor": n33,
  "Normalizar Últimas 3 Compras": n34,
  "Montar SQL Referências Financeiras Histórico": n35,
  "Normalizar Referências Financeiras Histórico": n36,
  "Preparar Títulos Histórico E501TCP": n37,
  "Normalizar Títulos Histórico E501TCP": n38,
  "Consolidar Histórico Pagamento Fornecedor": n39,
  "Montar Modelo Dossiê OC": n40,
  "Consolidar Blocos OC": n41,
  "Code in JavaScript NFS-e": n42,
  "Consolidar Documentos e-DOCS": n43,
  "Decodificador Fornecedor": n44,
  "Normalizar Fornecedor": n45,
  "Montar Envio do Dossiê": n46,
};
