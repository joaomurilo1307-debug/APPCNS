// Escopo da tela de custo de pessoal: so' os 15 nucleos ADM (decisao do Joao, 27/10/2026). Os centros de custo de contrato entram depois.
// Os nomes sao os da lotacao da "LISTAGEM DE ATIVOS" (os mesmos dos nucleos ADM). Os codigos do HCM (folha) e do ERP (sistema) sao diferentes
// para alguns centros: ADM MARKETING e' o 21 no HCM e o 17 no ERP (o 17 do HCM e' um contrato). `codccu` e' sempre o do SISTEMA.

export type NucleoAdm = { codccu: string; ccuHcm: string; nome: string };

export const NUCLEOS_ADM: ReadonlyArray<NucleoAdm> = [
  { codccu: "260", ccuHcm: "260", nome: "ADM" },
  { codccu: "1100", ccuHcm: "1100", nome: "ADM COMERCIAL" },
  { codccu: "13", ccuHcm: "13", nome: "ADM DEPARTAMENTO PESSOAL" },
  { codccu: "19", ccuHcm: "19", nome: "ADM DESENVOLVIMENTO E INOVACAO" },
  { codccu: "102295", ccuHcm: "102295", nome: "ADM ENGENHARIA" },
  { codccu: "102265", ccuHcm: "102265", nome: "ADM FINANCEIRO" },
  { codccu: "11", ccuHcm: "11", nome: "ADM GENTE E GESTAO" },
  { codccu: "12", ccuHcm: "12", nome: "ADM HSE" },
  { codccu: "14", ccuHcm: "14", nome: "ADM LOGISTICA" },
  { codccu: "17", ccuHcm: "21", nome: "ADM MARKETING" },
  { codccu: "1110", ccuHcm: "1110", nome: "ADM MEDIÇÃO" },
  { codccu: "102285", ccuHcm: "102285", nome: "ADM MEIO AMBIENTE E SUSTENTABILIDADE" },
  { codccu: "16", ccuHcm: "16", nome: "ADM QUALIDADE" },
  { codccu: "15", ccuHcm: "15", nome: "ADM SUPRIMENTOS" },
  { codccu: "390", ccuHcm: "390", nome: "ADMINISTRATIVO DIRETORIA" },
];

export const CCUS_ADM: ReadonlySet<string> = new Set(NUCLEOS_ADM.map((n) => n.codccu));
export const NOME_DO_NUCLEO: ReadonlyMap<string, string> = new Map(NUCLEOS_ADM.map((n) => [n.codccu, n.nome]));
