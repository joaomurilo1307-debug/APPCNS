// Indicadores de cada nucleo a partir dos projetos que ja estao no Relatorios (projetos ligados ao nucleo): quantos projetos, andamento das
// tarefas e atrasos. PURO (sem banco); so' soma o que cada projeto ja traz, sem calcular nada novo.
export type ProjetoParaNucleo = {
  status: string; nucleos: { id: string; name: string }[]; taskCount: number; taskCounts: Record<string, number>; overdueCount: number; totalHours: number;
};

export type IndicadoresNucleo = {
  projetos: number; emAndamento: number; tarefas: number; feitas: number; bloqueadas: number; atrasadas: number; horas: number;
  /** tarefas feitas / total de tarefas (0 a 1); 0 se o nucleo nao tem tarefa */
  andamento: number;
};

export function indicadoresDoNucleo(nucleoId: string, projetos: ProjetoParaNucleo[]): IndicadoresNucleo {
  const meus = projetos.filter((p) => p.nucleos.some((n) => n.id === nucleoId));
  const soma = (f: (p: ProjetoParaNucleo) => number) => meus.reduce((s, p) => s + f(p), 0);
  const tarefas = soma((p) => p.taskCount);
  const feitas = soma((p) => p.taskCounts.FEITO ?? 0);
  return {
    projetos: meus.length,
    emAndamento: meus.filter((p) => p.status === "EM_ANDAMENTO").length,
    tarefas, feitas,
    bloqueadas: soma((p) => p.taskCounts.BLOQUEADO ?? 0),
    atrasadas: soma((p) => p.overdueCount),
    horas: soma((p) => p.totalHours),
    andamento: tarefas > 0 ? feitas / tarefas : 0,
  };
}
