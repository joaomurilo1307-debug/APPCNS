// Regras de negocio sobre o plano financeiro do Senior (E091PLF) usadas pelo Custo por Contrato:
// nome oficial, grupo ("tipo de custo"), se a conta e' REEMBOLSAVEL e quais contas ficam FORA do custo.
//
// Contas fora do custo financeiro (regra validada ao centavo contra o Rel114/Rito de Gestao, jan-ago/2026):
// 81 Salarios, 70 FGTS, 72 INSS, 73 IRRF Colaboradores, 80 Rescisao, 71 GRRF, 69 Ferias, 55 13o Salario,
// 150 PCC, 151 IRRF Retido, 167 ISSQN e 162 Antecipacao de Lucros -- tudo isso ja entra no Custo Pessoal / Impostos
// (ou e' distribuicao de lucro), contar aqui duplicaria. Em 10/2026 o Senior ganhou o plano "R - ..." (contas 180-350,
// reembolsaveis), um ESPELHO exato do plano antigo (clafin R = "217" + clafin antigo sem o 1o digito). As contas R que
// espelham uma conta excluida seguem a MESMA exclusao -- derivado do plano, nao digitado a mao.

import { PLANO_SENIOR } from "./planoContasSenior";

export type ContaPlano = { cod: number; nome: string; clafin: string; nivel: number; situacao: string };

const CONTAS: ContaPlano[] = PLANO_SENIOR.map(([cod, nome, clafin, nivel, situacao]) => ({ cod, nome, clafin, nivel, situacao }));
const porCodigo = new Map<number, ContaPlano>(CONTAS.map((c) => [c.cod, c]));
const porClafin = new Map<string, ContaPlano>(CONTAS.map((c) => [c.clafin, c]));

/** Contas do plano ANTIGO fora do custo financeiro (a mesma lista ja validada contra o Rito). */
export const CONTAS_EXCLUIDAS_BASE: ReadonlyArray<number> = [81, 70, 72, 73, 80, 71, 69, 55, 150, 151, 167, 162];

/** Conta R (reembolsavel) que espelha uma conta do plano antigo, ou null. */
export function espelhoReembolsavel(codAntigo: number): number | null {
  const antiga = porCodigo.get(codAntigo);
  if (!antiga) return null;
  const espelho = porClafin.get("217" + antiga.clafin.slice(1));
  return espelho ? espelho.cod : null;
}

const excluidas = new Set<string>();
for (const cod of CONTAS_EXCLUIDAS_BASE) {
  excluidas.add(String(cod));
  const espelho = espelhoReembolsavel(cod);
  if (espelho !== null) excluidas.add(String(espelho));
}

/** Codigos (string, como vem do E501RAT.CTAFIN) que NAO entram no custo financeiro. */
export const CONTAS_FORA_DO_CUSTO: ReadonlySet<string> = excluidas;

const NOMES_ESPECIAIS: Record<number, string> = {
  67: "Despesas Reembolsáveis", // no Senior vem "Despesas Reembolsáveis1" (o "1" so' distingue da conta-pai 180)
};

export function nomeConta(cod: string | number): string | null {
  const n = Number(cod);
  if (NOMES_ESPECIAIS[n]) return NOMES_ESPECIAIS[n];
  return porCodigo.get(n)?.nome ?? null;
}

export function contaConhecida(cod: string | number): boolean {
  return porCodigo.has(Number(cod));
}

/** Registra uma conta nova lida ao vivo do Senior (ainda ausente da tabela estatica) para a sessao atual. */
export function registrarConta(cod: number, nome: string, clafin: string, nivel: number, situacao = "A") {
  if (porCodigo.has(cod)) return;
  const c = { cod, nome, clafin, nivel, situacao };
  CONTAS.push(c);
  porCodigo.set(cod, c);
  porClafin.set(clafin, c);
}

/** Conta marcada como INATIVA no plano do Senior (SITFIN = I) -- ex.: 179 "Despesas Reembolsaveis BDI - INATIVA". */
export function contaInativa(cod: string | number): boolean {
  return porCodigo.get(Number(cod))?.situacao === "I";
}

export function eReembolsavel(cod: string | number): boolean {
  const n = Number(cod);
  if (n === 67 || n === 179) return true; // "Despesas Reembolsaveis" (geral) e BDI inativa
  const c = porCodigo.get(n);
  return !!c && c.clafin.startsWith("217");
}

const GRUPOS: Record<string, string> = {
  "201": "Operação de contrato",
  "202": "Manutenção",
  "203": "Locação de equipamentos",
  "204": "Patrimônio",
  "205": "Veículos",
  "206": "Pessoal",
  "207": "Administrativas",
  "208": "Tecnologia (TI)",
  "209": "Comercial · captação",
  "210": "Comercial · licitação",
  "211": "Comercial · proposta",
  "212": "Impostos e taxas",
  "213": "Bancárias e financeiras",
  "214": "Diretoria",
  "215": "Impostos s/ vendas",
  "216": "Imobilizado",
  reemb: "Reembolsáveis · conta antiga",
  reembR: "Reembolsáveis · contas R",
  outros: "Outras contas",
};

export type GrupoConta = { codigo: string; nome: string };

/**
 * Grupo ("tipo de custo") da conta. Os reembolsaveis ficam SEPARADOS, em dois grupos proprios: a conta antiga (67, e a 179
 * inativa) -- onde esta' todo o historico ate set/2026 -- e as contas "R - ..." do plano novo, cada uma na sua linha.
 */
export function grupoDaConta(cod: string | number): GrupoConta {
  const n = Number(cod);
  if (n === 67 || n === 179) return { codigo: "reemb", nome: GRUPOS.reemb };
  const c = porCodigo.get(n);
  if (!c) return { codigo: "outros", nome: GRUPOS.outros };
  if (c.clafin.startsWith("217")) return { codigo: "reembR", nome: GRUPOS.reembR };
  const familia = c.clafin.slice(0, 3);
  return GRUPOS[familia] ? { codigo: familia, nome: GRUPOS[familia] } : { codigo: "outros", nome: GRUPOS.outros };
}

/** Todos os grupos na ordem em que aparecem nos graficos. */
export const ORDEM_DOS_GRUPOS: ReadonlyArray<GrupoConta> = Object.entries(GRUPOS).map(([codigo, nome]) => ({ codigo, nome }));

function semAcento(s: string) {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
}

const porNomeNormalizado = new Map<string, number>();
for (const c of CONTAS) {
  if (c.nivel >= 3) porNomeNormalizado.set(semAcento(nomeConta(c.cod) ?? c.nome), c.cod);
}

/** Codigo da conta a partir do nome exibido (tolerante a acento/caixa). Usado so' para dados antigos sem codigo. */
export function codigoPeloNome(nome: string): number | null {
  const n = porNomeNormalizado.get(semAcento(nome));
  return n ?? null;
}
