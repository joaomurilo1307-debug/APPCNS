// Componentes do custo de pessoal CLT, na ordem em que aparecem nas telas, e a regra do total. PURO (sem banco): usado pela API, pelas telas e pelos testes.
//
// Regra do total (a mesma do Rito de Gestao, conferida ao centavo): liquido da folha + rescisao + INSS + FGTS + IRRF + as provisoes do mes
// (ferias, 1/3 de ferias, 13o, INSS e FGTS sobre a provisao). O pro-labore (diretoria) fica fora desse total e aparece a' parte.

export type ComponenteId = "liquido" | "rescisao" | "inss" | "fgts" | "irrf" | "provFerias" | "provTerco" | "prov13" | "provInss" | "provFgts" | "proLabore";
export type GrupoComponente = "folha" | "provisoes" | "prolabore";
export type Componentes = Record<ComponenteId, number>;

export type ComponenteDef = { id: ComponenteId; rotulo: string; grupo: GrupoComponente; ajuda: string };

export const COMPONENTES: ReadonlyArray<ComponenteDef> = [
  { id: "liquido", rotulo: "Salário líquido (folha)", grupo: "folha", ajuda: "O que a folha paga ao colaborador depois dos descontos (rubricas 3065 e 2454)" },
  { id: "rescisao", rotulo: "Rescisão (líquido)", grupo: "folha", ajuda: "Rescisão paga pelo contas a pagar do ERP (conta 80), ligada ao colaborador" },
  { id: "inss", rotulo: "INSS (folha)", grupo: "folha", ajuda: "INSS retido na folha (rubrica 2000)" },
  { id: "fgts", rotulo: "FGTS (folha)", grupo: "folha", ajuda: "FGTS depositado pela empresa (rubrica 2500)" },
  { id: "irrf", rotulo: "IRRF (folha)", grupo: "folha", ajuda: "Imposto de renda retido na folha (rubrica 2004)" },
  { id: "provFerias", rotulo: "Provisão de férias", grupo: "provisoes", ajuda: "Parcela do mês das férias a pagar (provisão do Senior)" },
  { id: "provTerco", rotulo: "Provisão de 1/3 de férias", grupo: "provisoes", ajuda: "Parcela do mês do 1/3 constitucional de férias" },
  { id: "prov13", rotulo: "Provisão de 13º", grupo: "provisoes", ajuda: "Parcela do mês do 13º salário" },
  { id: "provInss", rotulo: "INSS sobre provisões", grupo: "provisoes", ajuda: "Encargo de INSS sobre as provisões de férias e 13º" },
  { id: "provFgts", rotulo: "FGTS sobre provisões", grupo: "provisoes", ajuda: "Encargo de FGTS sobre as provisões de férias e 13º" },
  { id: "proLabore", rotulo: "Pró-labore (diretoria)", grupo: "prolabore", ajuda: "Pró-labore da diretoria (rubrica 1600). Não entra no total da regra do Rito" },
];

export const GRUPOS_COMPONENTE: ReadonlyArray<{ id: GrupoComponente; rotulo: string; cor: string }> = [
  { id: "folha", rotulo: "Folha", cor: "#0e9f94" },
  { id: "provisoes", rotulo: "Provisões", cor: "#2a78d6" },
  { id: "prolabore", rotulo: "Pró-labore", cor: "#d89b2c" },
];

export const IDS_COMPONENTES: ReadonlyArray<ComponenteId> = COMPONENTES.map((c) => c.id);

export const zerar = (): Componentes => Object.fromEntries(IDS_COMPONENTES.map((id) => [id, 0])) as Componentes;

const centavos = (v: number) => Math.round(v * 100) / 100;

export function somarComponentes(a: Componentes, b: Partial<Componentes>): Componentes {
  const s = { ...a };
  for (const id of IDS_COMPONENTES) s[id] = centavos(s[id] + (b[id] ?? 0));
  return s;
}

/** Total pela regra do Rito (sem pro-labore). */
export function totalDoRito(c: Partial<Componentes>): number {
  return centavos(IDS_COMPONENTES.filter((id) => id !== "proLabore").reduce((s, id) => s + (c[id] ?? 0), 0));
}

/** Total com o pro-labore (diretoria). */
export function totalComProLabore(c: Partial<Componentes>): number {
  return centavos(totalDoRito(c) + (c.proLabore ?? 0));
}

/** Total de cada grupo (folha, provisoes, pro-labore). */
export function totalDoGrupo(c: Partial<Componentes>, grupo: GrupoComponente): number {
  return centavos(COMPONENTES.filter((d) => d.grupo === grupo).reduce((s, d) => s + (c[d.id] ?? 0), 0));
}
