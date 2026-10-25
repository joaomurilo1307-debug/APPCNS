export const CATEGORIAS = { CUSTO: "Custo / budget", GLOSA: "Glosa", FALTAS: "Faltas", MEDICAO: "Medição", RESULTADOS: "Resultados", GERAL: "Geral" } as const;
export const FONTES = { MANUAL: "Medição manual", CUSTO: "Custo pago no mês", FATURAMENTO: "Faturamento", MEDICAO: "Medição do Senior" } as const;
export const STATUS_META = { ATIVA: "Ativa", PAUSADA: "Pausada", CONCLUIDA: "Concluída", ARQUIVADA: "Arquivada" } as const;
export const STATUS_ACAO = { A_FAZER: "A fazer", EM_ANDAMENTO: "Em andamento", BLOQUEADA: "Bloqueada", CONCLUIDA: "Concluída", CANCELADA: "Cancelada" } as const;

/** Auxiliar de configuracao: converte uma reducao percentual em alvo, sem alterar o valor medido. */
export function alvoPorReducao(baseline: number, percentual: number): number | null {
  if (!Number.isFinite(baseline) || !Number.isFinite(percentual) || percentual < 0 || percentual > 100) return null;
  return Math.round((baseline - Math.abs(baseline) * percentual / 100) * 1e8) / 1e8;
}

/** Avanco entre a linha de base e o alvo; aceita zero e negativos sem inverter o sentido. */
export function progressoIndicador(baseline: number | null, alvo: number | null, atual: number | null, direcao: string | null): number | null {
  if (baseline === null || alvo === null || atual === null || !direcao || ![baseline, alvo, atual].every(Number.isFinite)) return null;
  if (!configuracaoCoerente(baseline, alvo, direcao)) return null;
  if (baseline === alvo) return direcao === "REDUZIR" ? (atual <= alvo ? 1 : 0) : (atual >= alvo ? 1 : 0);
  const avanco = direcao === "REDUZIR" ? (baseline - atual) / (baseline - alvo) : (atual - baseline) / (alvo - baseline);
  return Math.max(0, Math.min(1, avanco));
}

export function configuracaoCoerente(baseline: number, alvo: number, direcao: string): boolean {
  return Number.isFinite(baseline) && Number.isFinite(alvo) && (direcao === "REDUZIR" ? alvo <= baseline : direcao === "AUMENTAR" && alvo >= baseline);
}

export function podeAlterarMeta({ role, userId, ownerId, hasModuleWrite, hasCcu }: { role: string; userId: string; ownerId?: string | null; hasModuleWrite: boolean; hasCcu: boolean }): boolean {
  return hasModuleWrite && hasCcu && !["CLIENTE", "VISUALIZADOR"].includes(role) && (["ADMIN", "DIRETOR", "GESTOR_PROJETO"].includes(role) || ownerId === userId);
}

export function validarVinculosMetas(ids: string[], metas: { id: string; codccu: string; status: string }[], codccu: string | null): string[] {
  const unicos = [...new Set(ids)];
  if (unicos.some((id) => !metas.some((m) => m.id === id && m.codccu === codccu && m.status === "ATIVA"))) throw new Error("Selecione somente metas ativas do contrato deste projeto.");
  return unicos;
}
