export type DependencyType = "FS" | "SS" | "FF" | "SF";

export type CpmTaskInput = {
  id: string;
  startDate: string | null;
  dueDate: string | null;
};

export type CpmDependencyInput = {
  predecessorId: string;
  successorId: string;
  type: DependencyType;
  lagDays: number;
};

export type CpmTaskResult = {
  es: number;
  ef: number;
  ls: number;
  lf: number;
  float: number;
  duration: number;
  isCritical: boolean;
  /** dia (offset desde a âncora do projeto) em que a data de início planejada da tarefa cai */
  plannedStartOffset: number;
  /** true se a data de início planejada é anterior ao que a rede de dependências permite (conflito) */
  hasConflict: boolean;
};

export type CpmResult = {
  results: Map<string, CpmTaskResult>;
  hasCycle: boolean;
  cycleTaskIds: string[];
  /** duração total da rede (dias), do início da tarefa mais cedo ao fim da tarefa crítica mais tardia */
  projectDurationDays: number;
};

/**
 * Calcula o Método do Caminho Crítico (CPM) de uma rede de tarefas, no mesmo espírito do
 * MS Project / Primavera P6: cada tarefa tem uma duração (fim planejado - início planejado);
 * dependências entre tarefas têm um tipo (FS/SS/FF/SF) e uma folga/antecedência (lag, em dias).
 *
 * O cálculo roda num espaço de tempo PRÓPRIO (dia 0 = a data de início mais cedo entre as
 * tarefas sem predecessora), independente das datas reais planejadas -- isso responde
 * "qual é o cronograma mais cedo/mais tarde POSSÍVEL dado esta rede de dependências",
 * que é depois comparado com a data real planejada de cada tarefa pra detectar conflitos
 * (tarefa planejada pra começar antes que a rede permita).
 */
export function computeCPM(tasks: CpmTaskInput[], dependencies: CpmDependencyInput[]): CpmResult {
  const scheduled = tasks.filter((t) => t.startDate && t.dueDate);
  const idSet = new Set(scheduled.map((t) => t.id));

  const duration = new Map<string, number>();
  const plannedStart = new Map<string, Date>();
  let epoch: Date | null = null;
  for (const t of scheduled) {
    const start = new Date(t.startDate!);
    const end = new Date(t.dueDate!);
    const d = Math.max(0, Math.round((end.getTime() - start.getTime()) / 86400000));
    duration.set(t.id, d);
    plannedStart.set(t.id, start);
    if (!epoch || start < epoch) epoch = start;
  }

  const results = new Map<string, CpmTaskResult>();
  if (scheduled.length === 0 || !epoch) return { results, hasCycle: false, cycleTaskIds: [], projectDurationDays: 0 };
  const epochDate = epoch;

  const validDeps = dependencies.filter((d) => idSet.has(d.predecessorId) && idSet.has(d.successorId));
  const predsOf = new Map<string, CpmDependencyInput[]>();
  const succsOf = new Map<string, CpmDependencyInput[]>();
  for (const d of validDeps) {
    if (!predsOf.has(d.successorId)) predsOf.set(d.successorId, []);
    predsOf.get(d.successorId)!.push(d);
    if (!succsOf.has(d.predecessorId)) succsOf.set(d.predecessorId, []);
    succsOf.get(d.predecessorId)!.push(d);
  }

  // Kahn's algorithm — ordenação topológica, detecta ciclo se sobrar nó
  const inDegree = new Map<string, number>();
  for (const t of scheduled) inDegree.set(t.id, 0);
  for (const d of validDeps) inDegree.set(d.successorId, (inDegree.get(d.successorId) ?? 0) + 1);
  const queue: string[] = scheduled.filter((t) => (inDegree.get(t.id) ?? 0) === 0).map((t) => t.id);
  const order: string[] = [];
  while (queue.length) {
    const id = queue.shift()!;
    order.push(id);
    for (const d of succsOf.get(id) ?? []) {
      const remaining = (inDegree.get(d.successorId) ?? 0) - 1;
      inDegree.set(d.successorId, remaining);
      if (remaining === 0) queue.push(d.successorId);
    }
  }
  if (order.length !== scheduled.length) {
    const cycleTaskIds = scheduled.map((t) => t.id).filter((id) => !order.includes(id));
    return { results, hasCycle: true, cycleTaskIds, projectDurationDays: 0 };
  }

  // Passada pra frente: ES/EF
  const es = new Map<string, number>();
  const ef = new Map<string, number>();
  for (const id of order) {
    const dur = duration.get(id)!;
    const preds = predsOf.get(id) ?? [];
    let start = 0;
    for (const d of preds) {
      const pEs = es.get(d.predecessorId)!;
      const pEf = ef.get(d.predecessorId)!;
      let constraint: number;
      if (d.type === "FS") constraint = pEf + d.lagDays;
      else if (d.type === "SS") constraint = pEs + d.lagDays;
      else if (d.type === "FF") constraint = pEf + d.lagDays - dur;
      else constraint = pEs + d.lagDays - dur; // SF
      start = Math.max(start, constraint);
    }
    es.set(id, start);
    ef.set(id, start + dur);
  }

  const projectEnd = Math.max(...order.map((id) => ef.get(id)!), 0);

  // Passada pra trás: LS/LF
  const ls = new Map<string, number>();
  const lf = new Map<string, number>();
  for (let i = order.length - 1; i >= 0; i--) {
    const id = order[i];
    const dur = duration.get(id)!;
    const succs = succsOf.get(id) ?? [];
    let finish = projectEnd;
    if (succs.length > 0) {
      finish = Infinity;
      for (const d of succs) {
        const sLs = ls.get(d.successorId)!;
        const sLf = lf.get(d.successorId)!;
        let constraint: number;
        if (d.type === "FS") constraint = sLs - d.lagDays;
        else if (d.type === "SS") constraint = sLs - d.lagDays + dur;
        else if (d.type === "FF") constraint = sLf - d.lagDays;
        else constraint = sLf - d.lagDays + dur; // SF
        finish = Math.min(finish, constraint);
      }
    }
    lf.set(id, finish);
    ls.set(id, finish - dur);
  }

  for (const id of order) {
    const floatVal = ls.get(id)! - es.get(id)!;
    const plannedOffset = Math.round((plannedStart.get(id)!.getTime() - epochDate.getTime()) / 86400000);
    results.set(id, {
      es: es.get(id)!,
      ef: ef.get(id)!,
      ls: ls.get(id)!,
      lf: lf.get(id)!,
      float: floatVal,
      duration: duration.get(id)!,
      isCritical: floatVal <= 0,
      plannedStartOffset: plannedOffset,
      hasConflict: plannedOffset < es.get(id)!,
    });
  }

  return { results, hasCycle: false, cycleTaskIds: [], projectDurationDays: projectEnd };
}
