// Carga da equipe: quantas tarefas abertas cada pessoa tem, quantas estao atrasadas, o que vence nos proximos 7 dias e semana a semana.
// PURO (sem banco). So' conta o que as tarefas ja dizem (responsavel, situacao e prazo); nao estima horas nem inventa capacidade.
export type TarefaCarga = { status: string; dueDate: string | null; assignee: { id: string; name: string } | null };
export type LinhaCarga = { id: string; nome: string; abertas: number; atrasadas: number; venceEm7: number; bloqueadas: number; semPrazo: number; semanas: number[] };
export type Carga = { linhas: LinhaCarga[]; semResponsavel: { abertas: number; atrasadas: number; semPrazo: number }; semanasMostradas: number };

const DIA = 86400000;
const dia = (v: Date | string) => {
  const d = new Date(v);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
};

export function cargaPorPessoa(tarefas: TarefaCarga[], hojeData: Date = new Date(), semanas = 4): Carga {
  const hoje = dia(hojeData);
  const linhas = new Map<string, LinhaCarga>();
  const sem = { abertas: 0, atrasadas: 0, semPrazo: 0 };
  for (const t of tarefas) {
    if (t.status === "FEITO") continue;
    const prazo = t.dueDate ? dia(t.dueDate) : null;
    const atrasada = prazo !== null && prazo < hoje;
    if (!t.assignee) {
      sem.abertas++;
      if (atrasada) sem.atrasadas++;
      if (prazo === null) sem.semPrazo++;
      continue;
    }
    let l = linhas.get(t.assignee.id);
    if (!l) {
      l = { id: t.assignee.id, nome: t.assignee.name, abertas: 0, atrasadas: 0, venceEm7: 0, bloqueadas: 0, semPrazo: 0, semanas: new Array(semanas).fill(0) };
      linhas.set(l.id, l);
    }
    l.abertas++;
    if (t.status === "BLOQUEADO") l.bloqueadas++;
    if (prazo === null) l.semPrazo++;
    else if (atrasada) l.atrasadas++;
    else {
      const dias = Math.floor((prazo - hoje) / DIA);
      if (dias <= 7) l.venceEm7++;
      const s = Math.floor(dias / 7);
      if (s < semanas) l.semanas[s]++;
    }
  }
  const ordenadas = Array.from(linhas.values()).sort((a, b) => b.abertas - a.abertas || b.atrasadas - a.atrasadas || a.nome.localeCompare(b.nome, "pt-BR"));
  return { linhas: ordenadas, semResponsavel: sem, semanasMostradas: semanas };
}
