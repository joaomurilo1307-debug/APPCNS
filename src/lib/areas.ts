// Separacao dos centros de custo (CCU) do Senior por AREA: Engenharia (civil), Ambiental e Administrativo. Alimenta o filtro "Contratos" que fica ao lado do Buscar nas telas.
// Quem decidiu e como (Joao, 20/10/2026): 1) as regras dele -- AGA, MRN 4337 e 4343, Jaguar, Del Rey, SVPM, contratos de solos (MRN 3581), MRN 3484 e 215703 e as
// ALCOA PR 041/100 = Engenharia; ALCOA, AMG e os demais MRN (3686 com BAQ/PLT02/PMRE, 3687, 3748, 3728, 4353, 4362...) = Ambiental; MACFROTAS = Administrativo;
// 2) onde ele nao disse nada, a coluna "Area" (CIVIL ou AMBIENTAL) da planilha de faturamento do financeiro (SUDECAP: DJ 029 e 114 Civil, DJ 011 e 050 Ambiental).
// O Senior NAO guarda gestor nem coordenador por contrato: a area vem desta tabela, nao de pessoas. Centro de custo que nao esta aqui (contrato novo) aparece so' sem filtro
// ate ser acrescentado. Para mudar: editar a linha do centro de custo e publicar.

export type Area = "ENGENHARIA" | "AMBIENTAL" | "ADMINISTRATIVO";
export type Centro = { ccu: string; nome: string; area: Area };

export const AREAS: ReadonlyArray<{ valor: Area; rotulo: string }> = [
  { valor: "ENGENHARIA", rotulo: "Engenharia" },
  { valor: "AMBIENTAL", rotulo: "Ambiental" },
  { valor: "ADMINISTRATIVO", rotulo: "Administrativo" },
];

/** Todos os centros de custo, ja separados por area (Engenharia, Ambiental, Administrativo) e em ordem de nome. */
export const CENTROS: ReadonlyArray<Centro> = [
  { ccu: "102295", nome: "ADM ENGENHARIA", area: "ENGENHARIA" },
  { ccu: "140", nome: "AGA CT 13287 CB/2023", area: "ENGENHARIA" },
  { ccu: "150", nome: "AGA CT 13287 CDS/2023", area: "ENGENHARIA" },
  { ccu: "160", nome: "AGA CT 13287 QZ/2023", area: "ENGENHARIA" },
  { ccu: "170", nome: "AGA CT 13288 MSG/2023", area: "ENGENHARIA" },
  { ccu: "102185", nome: "AGA CT 15140/2025 CB", area: "ENGENHARIA" },
  { ccu: "102205", nome: "AGA CT 15140/2025 CDS", area: "ENGENHARIA" },
  { ccu: "102195", nome: "AGA CT 15140/2025 QZ", area: "ENGENHARIA" },
  { ccu: "330", nome: "ALCOA PR 041/2022 - POCOS DE CALDAS/MG", area: "ENGENHARIA" },
  { ccu: "70", nome: "ALCOA PR 100/2022", area: "ENGENHARIA" },
  { ccu: "120", nome: "AMARILLO MINERACAO CT 65169", area: "ENGENHARIA" },
  { ccu: "102055", nome: "BH AIRPORT CT 4600084150/2024", area: "ENGENHARIA" },
  { ccu: "80", nome: "BH AIRPORT PR 060/2021", area: "ENGENHARIA" },
  { ccu: "340", nome: "CCR AEROPORTOS CT 4600080415", area: "ENGENHARIA" },
  { ccu: "102095", nome: "CEMIG 8503/2021 - OS 001 - SERRA DAS VACAS", area: "ENGENHARIA" },
  { ccu: "102105", nome: "CEMIG 8503/2021 - OS 002 - JUSSANTE TRES MARIAS", area: "ENGENHARIA" },
  { ccu: "102115", nome: "CEMIG 8503/2021 - OS 003 - BOA ESPERANCA", area: "ENGENHARIA" },
  { ccu: "102125", nome: "CEMIG 8503/2021 - OS 004 - SANTOS DUMONT", area: "ENGENHARIA" },
  { ccu: "102135", nome: "CEMIG 8503/2021 - OS 005 - SAO GONCALO DO RIO ABAIXO", area: "ENGENHARIA" },
  { ccu: "102145", nome: "CEMIG 8503/2021 - OS 006 - USINA TRES MARIAS", area: "ENGENHARIA" },
  { ccu: "102155", nome: "CEMIG 8503/2021 - OS 007 - SE MESQUITA/SANTANA DO PARAISO", area: "ENGENHARIA" },
  { ccu: "102165", nome: "CEMIG 8503/2021 - OS 008 - PARAUNA/GOUVEIA", area: "ENGENHARIA" },
  { ccu: "440", nome: "CEMIG 8503/2021 - OS 009 UFV/TRES MARIAS", area: "ENGENHARIA" },
  { ccu: "102035", nome: "CEMIG 8503/2021 - OS 010 BESS/JUATUBA", area: "ENGENHARIA" },
  { ccu: "102075", nome: "CEMIG 8503/2021 - OS 011 PCH/PARAUNA II", area: "ENGENHARIA" },
  { ccu: "320", nome: "CEMIG 8503/2021 - TRES MARIAS/MG", area: "ENGENHARIA" },
  { ccu: "450", nome: "ENGSBRASIL CT 001/2025", area: "ENGENHARIA" },
  { ccu: "200", nome: "HYDRO CT 11356/2023", area: "ENGENHARIA" },
  { ccu: "40", nome: "HYDRO PR 095/2021", area: "ENGENHARIA" },
  { ccu: "102425", nome: "JAGUAR CT 1396/2026 - MTL", area: "ENGENHARIA" },
  { ccu: "102415", nome: "JAGUAR CT 1396/2026 - RG", area: "ENGENHARIA" },
  { ccu: "50", nome: "MINERACAO PARAGOMINAS PR 032/2023", area: "ENGENHARIA" },
  { ccu: "102405", nome: "MONTTEC CT PR 044/2026", area: "ENGENHARIA" },
  { ccu: "102045", nome: "MRN CT 215703/2025", area: "ENGENHARIA" },
  { ccu: "20", nome: "MRN CT 3484/2022", area: "ENGENHARIA" },
  { ccu: "240", nome: "MRN CT 3581/2022", area: "ENGENHARIA" },
  { ccu: "102335", nome: "MRN CT 4337/2026", area: "ENGENHARIA" },
  { ccu: "102345", nome: "MRN CT 4343/2026", area: "ENGENHARIA" },
  { ccu: "270", nome: "PM CONTAGEM CT 017/2021", area: "ENGENHARIA" },
  { ccu: "430", nome: "PR 056/2024 SVPM GERENCIAMENTO", area: "ENGENHARIA" },
  { ccu: "102255", nome: "RIO GALEAO CT PR 060/2025", area: "ENGENHARIA" },
  { ccu: "102355", nome: "SHOPPING DEL REY CT PR 029/2026", area: "ENGENHARIA" },
  { ccu: "102175", nome: "SINDI INVESTIMENTOS CT 13 2025", area: "ENGENHARIA" },
  { ccu: "90", nome: "SUDECAP DJ 029/2022", area: "ENGENHARIA" },
  { ccu: "370", nome: "SUDECAP DJ 114/2022", area: "ENGENHARIA" },
  { ccu: "280", nome: "SVPM CT 072/2024", area: "ENGENHARIA" },
  { ccu: "102445", nome: "SVPM CT 209_2026", area: "ENGENHARIA" },
  { ccu: "460", nome: "TABOCAS CT 132922 2025", area: "ENGENHARIA" },
  { ccu: "250", nome: "ABHA CT 014/2022", area: "AMBIENTAL" },
  { ccu: "102285", nome: "ADM MEIO AMBIENTE E SUSTENTABILIDADE", area: "AMBIENTAL" },
  { ccu: "380", nome: "AGENCIA PEIXE VIVO CT 035/2024", area: "AMBIENTAL" },
  { ccu: "30", nome: "AGENCIA PEIXE VIVO CT 056/2022", area: "AMBIENTAL" },
  { ccu: "110", nome: "ALCOA CT 036/2023", area: "AMBIENTAL" },
  { ccu: "102435", nome: "ALCOA CT 2158816/2026", area: "AMBIENTAL" },
  { ccu: "102215", nome: "ALCOA CT PR 052/2025", area: "AMBIENTAL" },
  { ccu: "102085", nome: "AMG 200222020 OS 01/2025", area: "AMBIENTAL" },
  { ccu: "102365", nome: "AMG 200222020 OS 01/2026", area: "AMBIENTAL" },
  { ccu: "102275", nome: "AMG 200222020 OS 02/2026", area: "AMBIENTAL" },
  { ccu: "350", nome: "AMG CT 20022/2020 - OS 001/2024", area: "AMBIENTAL" },
  { ccu: "410", nome: "AMG CT 20022/2020 - OS 002/2024", area: "AMBIENTAL" },
  { ccu: "100", nome: "AMG CT 20022/2020 - OS 005/2023", area: "AMBIENTAL" },
  { ccu: "102375", nome: "AMG CT 26063/2026", area: "AMBIENTAL" },
  { ccu: "420", nome: "CENTENA CT 205 2024", area: "AMBIENTAL" },
  { ccu: "60", nome: "IRANI PAPEL PR 049/2021", area: "AMBIENTAL" },
  { ccu: "290", nome: "IRANI PR 049/2023", area: "AMBIENTAL" },
  { ccu: "360", nome: "IRANI PR 076/2023", area: "AMBIENTAL" },
  { ccu: "400", nome: "JS PR 020 2024", area: "AMBIENTAL" },
  { ccu: "102225", nome: "MRN 3686 BAQ", area: "AMBIENTAL" },
  { ccu: "102235", nome: "MRN 3686 PLT02", area: "AMBIENTAL" },
  { ccu: "102245", nome: "MRN 3686 PMRE", area: "AMBIENTAL" },
  { ccu: "220", nome: "MRN CT 3642/2023", area: "AMBIENTAL" },
  { ccu: "210", nome: "MRN CT 3686/2023", area: "AMBIENTAL" },
  { ccu: "230", nome: "MRN CT 3687/2023", area: "AMBIENTAL" },
  { ccu: "310", nome: "MRN CT 3728/2023", area: "AMBIENTAL" },
  { ccu: "190", nome: "MRN CT 3748/2023", area: "AMBIENTAL" },
  { ccu: "102395", nome: "MRN CT 4353/2026 - BIOTA", area: "AMBIENTAL" },
  { ccu: "102385", nome: "MRN CT 4362/2026", area: "AMBIENTAL" },
  { ccu: "300", nome: "SAFM MINERACAO CT 558/2024", area: "AMBIENTAL" },
  { ccu: "180", nome: "SUDECAP DJ 011/2023", area: "AMBIENTAL" },
  { ccu: "130", nome: "SUDECAP DJ 050/2022", area: "AMBIENTAL" },
  { ccu: "1100", nome: "ADM COMERCIAL", area: "ADMINISTRATIVO" },
  { ccu: "13", nome: "ADM DEPARTAMENTO PESSOAL", area: "ADMINISTRATIVO" },
  { ccu: "19", nome: "ADM DESENVOLVIMENTO E INOVACAO", area: "ADMINISTRATIVO" },
  { ccu: "102305", nome: "ADM DESENVOLVIMENTO HUMANO E SOCIAL", area: "ADMINISTRATIVO" },
  { ccu: "1120", nome: "ADM DIRETORIA", area: "ADMINISTRATIVO" },
  { ccu: "1130", nome: "ADM ECC MRN", area: "ADMINISTRATIVO" },
  { ccu: "102265", nome: "ADM FINANCEIRO", area: "ADMINISTRATIVO" },
  { ccu: "11", nome: "ADM GENTE E GESTAO", area: "ADMINISTRATIVO" },
  { ccu: "12", nome: "ADM HSE", area: "ADMINISTRATIVO" },
  { ccu: "14", nome: "ADM LOGISTICA", area: "ADMINISTRATIVO" },
  { ccu: "17", nome: "ADM MARKETING", area: "ADMINISTRATIVO" },
  { ccu: "1110", nome: "ADM MEDICAO", area: "ADMINISTRATIVO" },
  { ccu: "16", nome: "ADM QUALIDADE", area: "ADMINISTRATIVO" },
  { ccu: "102315", nome: "ADM SEDE", area: "ADMINISTRATIVO" },
  { ccu: "15", nome: "ADM SUPRIMENTOS", area: "ADMINISTRATIVO" },
  { ccu: "18", nome: "ADM SUSTENTABILIDADE/RITUAL DE GESTAO", area: "ADMINISTRATIVO" },
  { ccu: "260", nome: "ADMINISTRATIVO", area: "ADMINISTRATIVO" },
  { ccu: "390", nome: "ADMINISTRATIVO DIRETORIA", area: "ADMINISTRATIVO" },
  { ccu: "10", nome: "CENTRO DE CUSTO", area: "ADMINISTRATIVO" },
  { ccu: "102325", nome: "MACFROTAS CT 4336/2026", area: "ADMINISTRATIVO" },
  { ccu: "102065", nome: "MRN ESCRITORIO", area: "ADMINISTRATIVO" },
];

export const AREA_POR_CCU: Readonly<Record<string, Area>> = Object.fromEntries(CENTROS.map((c) => [c.ccu, c.area]));

/** Cookie da sessao com os centros de custo escolhidos na lista suspensa ao lado do Buscar ("190,102185"); vazio = todos. O servidor le o mesmo cookie para filtrar as listas. */
export const COOKIE_VISAO = "visao_ccus";

/** Area de um centro de custo; null = ainda sem area definida (aparece so' sem filtro). */
export const areaDoCentro = (codccu: string | null | undefined): Area | null => AREA_POR_CCU[String(codccu ?? "").trim()] ?? null;

/** "ENGENHARIA" -> area (qualquer outra coisa = null). */
export function lerArea(valor: string | null | undefined): Area | null {
  const v = String(valor ?? "").trim().toUpperCase();
  return v === "ENGENHARIA" || v === "AMBIENTAL" || v === "ADMINISTRATIVO" ? v : null;
}

export function ccusDaArea(area: Area): string[] {
  return CENTROS.filter((c) => c.area === area).map((c) => c.ccu);
}

/** Valor do cookie -> centros de custo escolhidos. Vazio, lixo ou tudo invalido = null (sem filtro). So' numeros, sem repetir, no maximo 300. */
export function lerSelecao(valor: string | null | undefined): string[] | null {
  const lista = Array.from(new Set(String(valor ?? "").split(",").map((c) => c.trim()).filter((c) => /^\d{1,9}$/.test(c)))).slice(0, 300);
  return lista.length > 0 ? lista : null;
}

/** Selecao atual lida do cookie no navegador (null = todos; fora do navegador = null). */
export function selecaoDoCookie(): string[] | null {
  if (typeof document === "undefined") return null;
  const par = document.cookie.split("; ").find((c) => c.startsWith(`${COOKIE_VISAO}=`));
  return lerSelecao(par ? decodeURIComponent(par.slice(COOKIE_VISAO.length + 1)) : null);
}

/** Grava a selecao no cookie da sessao (null ou vazia = todos). So' no navegador. Ao fechar o navegador volta para "todos": o sistema segue como sempre. */
export function gravarSelecao(selecao: readonly string[] | null): void {
  // O chamador informa null ao selecionar todas as opcoes disponiveis, que agora sao dinamicas.
  const l = selecao && selecao.length > 0 ? lerSelecao(selecao.join(",")) : null;
  document.cookie = l ? `${COOKIE_VISAO}=${encodeURIComponent(l.join(","))}; path=/; SameSite=Lax` : `${COOKIE_VISAO}=; path=/; max-age=0; SameSite=Lax`;
}

/**
 * Programacao de Pagamento: a lista vem pronta e igual para todos (e' pesada), entao o filtro e' aplicado no navegador, pelo centro de custo de cada titulo.
 * Titulo sem centro de custo, ou de centro fora da selecao, some quando ha filtro. As somas da tela sao refeitas com a lista filtrada (mesma conta da rota).
 */
export function filtrarTitulosPorSelecao<T extends { codccu?: string | null; pago: boolean; valorAberto: number; valorOriginal: number }>(titulos: T[], selecao: readonly string[] | null) {
  const set = selecao ? new Set(selecao) : null;
  const lista = set ? titulos.filter((t) => !!t.codccu && set.has(String(t.codccu).trim())) : titulos;
  return {
    titulos: lista,
    totalAberto: lista.filter((t) => !t.pago).reduce((s, t) => s + t.valorAberto, 0),
    qtdAberto: lista.filter((t) => !t.pago).length,
    qtdPagos: lista.filter((t) => t.pago).length,
    totalPago: lista.filter((t) => t.pago).reduce((s, t) => s + t.valorOriginal, 0),
  };
}
