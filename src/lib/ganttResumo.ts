// Resumo de um grupo de tarefas (um projeto) para a linha-resumo do Gantt geral: periodo, andamento e atrasos. PURA, sem banco.
export type TarefaResumivel = { startDate: string | null; dueDate: string | null; status: string };
export type ResumoGrupo = { total: number; feitas: number; atrasadas: number; comData: number; inicio: string | null; fim: string | null; pct: number };

export function resumirGrupo(tarefas: TarefaResumivel[], hoje: Date = new Date()): ResumoGrupo {
  const limite = Date.UTC(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
  let feitas = 0;
  let atrasadas = 0;
  let comData = 0;
  let inicio: number | null = null;
  let fim: number | null = null;
  for (const t of tarefas) {
    if (t.status === "FEITO") feitas++;
    const prazo = t.dueDate ? new Date(t.dueDate).getTime() : null;
    if (prazo !== null && prazo < limite && t.status !== "FEITO") atrasadas++;
    if (t.startDate && t.dueDate) {
      comData++;
      const a = new Date(t.startDate).getTime();
      const b = new Date(t.dueDate).getTime();
      inicio = inicio === null ? a : Math.min(inicio, a);
      fim = fim === null ? b : Math.max(fim, b);
    }
  }
  return {
    total: tarefas.length, feitas, atrasadas, comData,
    inicio: inicio === null ? null : new Date(inicio).toISOString(),
    fim: fim === null ? null : new Date(fim).toISOString(),
    pct: tarefas.length ? Math.round((feitas / tarefas.length) * 100) : 0,
  };
}
