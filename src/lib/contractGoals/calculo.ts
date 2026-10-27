export const CATEGORIAS = { CUSTO: "Custo / budget", GLOSA: "Glosa", FALTAS: "Faltas", MEDICAO: "Medição", RESULTADOS: "Resultados", GERAL: "Geral" } as const;
export const FONTES = { MANUAL: "Medição manual", CUSTO: "Custo pago no mês", FATURAMENTO: "Faturamento", MEDICAO: "Medição do Senior" } as const;
export const STATUS_META = { ATIVA: "Ativa", PAUSADA: "Pausada", CONCLUIDA: "Concluída", ARQUIVADA: "Arquivada" } as const;
export const STATUS_ACAO = { A_FAZER: "A fazer", EM_ANDAMENTO: "Em andamento", BLOQUEADA: "Bloqueada", CONCLUIDA: "Concluída", CANCELADA: "Cancelada" } as const;
export const FREQUENCIAS_META = { MENSAL: "Mensal", TRIMESTRAL: "Trimestral", SEMESTRAL: "Semestral", ANUAL: "Anual" } as const;
export const DIRECOES_META = { REDUZIR: "Reduzir", AUMENTAR: "Aumentar", ATINGIR: "Atingir um valor", MANTER: "Manter uma faixa" } as const;

/** A variação é sempre aplicada à mesma referência, nunca sobre o último mês. */
export function alvoPorVariacao(baseline: number, percentual: number, direcao: string): number | null {
  if (!Number.isFinite(baseline) || !Number.isFinite(percentual) || percentual < 0 || !["REDUZIR", "AUMENTAR"].includes(direcao)) return null;
  if (direcao === "REDUZIR" && percentual > 100) return null;
  const alvo = baseline + Math.abs(baseline) * percentual / 100 * (direcao === "REDUZIR" ? -1 : 1);
  return Number.isFinite(alvo) ? Math.round(alvo * 1e8) / 1e8 : null;
}

/** Base zero não possui variação percentual definida. */
export function variacaoPercentual(baseline: number | null, atual: number | null): number | null {
  if (baseline === null || atual === null || baseline === 0 || !Number.isFinite(baseline) || !Number.isFinite(atual)) return null;
  return (atual - baseline) / Math.abs(baseline) * 100;
}

/** Auxiliar de configuracao: converte uma reducao percentual em alvo, sem alterar o valor medido. */
export function alvoPorReducao(baseline: number, percentual: number): number | null {
  return alvoPorVariacao(baseline, percentual, "REDUZIR");
}

/** Avanco entre a linha de base e o alvo; aceita zero e negativos sem inverter o sentido. */
export function progressoIndicador(baseline: number | null, alvo: number | null, atual: number | null, direcao: string | null, tolerancia = 0): number | null {
  if (baseline === null || alvo === null || atual === null || !direcao || ![baseline, alvo, atual].every(Number.isFinite)) return null;
  if (!configuracaoCoerente(baseline, alvo, direcao)) return null;
  if (!Number.isFinite(tolerancia) || tolerancia < 0) return null;
  if (direcao === "MANTER") return Math.abs(atual - alvo) <= tolerancia ? 1 : 0;
  const reduzir = direcao === "REDUZIR" || (direcao === "ATINGIR" && alvo < baseline);
  if (baseline === alvo) return reduzir ? (atual <= alvo + tolerancia ? 1 : 0) : (atual >= alvo - tolerancia ? 1 : 0);
  if (reduzir ? atual <= alvo + tolerancia : atual >= alvo - tolerancia) return 1;
  const avanco = reduzir ? (baseline - atual) / (baseline - alvo) : (atual - baseline) / (alvo - baseline);
  return Math.max(0, Math.min(1, avanco));
}

export function configuracaoCoerente(baseline: number, alvo: number, direcao: string): boolean {
  return Number.isFinite(baseline) && Number.isFinite(alvo) && (direcao === "REDUZIR" ? alvo <= baseline : direcao === "AUMENTAR" ? alvo >= baseline : ["ATINGIR", "MANTER"].includes(direcao));
}

export function podeAlterarMeta({ role, userId, ownerId, hasModuleWrite, hasCcu }: { role: string; userId: string; ownerId?: string | null; hasModuleWrite: boolean; hasCcu: boolean }): boolean {
  return hasModuleWrite && hasCcu && !["CLIENTE", "VISUALIZADOR"].includes(role) && (["ADMIN", "DIRETOR", "GESTOR_PROJETO"].includes(role) || ownerId === userId);
}

export function validarVinculosMetas(ids: string[], metas: { id: string; codccu: string | null; status: string }[], codccu: string | null): string[] {
  const unicos = [...new Set(ids)];
  if (unicos.some((id) => !metas.some((m) => m.id === id && (m.codccu === null || m.codccu === codccu) && m.status === "ATIVA"))) throw new Error("Selecione somente metas ativas compatíveis com o contexto deste projeto.");
  return unicos;
}
