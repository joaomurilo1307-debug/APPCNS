// Saude do projeto: um semaforo calculado so' com o que o proprio projeto ja tem (tarefas, prazos, situacao). PURO (sem banco), para a lista de
// Projetos, o Gantt geral, os Relatorios e o contrato mostrarem a mesma coisa. Cada nivel traz os MOTIVOS, para ninguem ter que adivinhar.
export type NivelSaude = "NO_PRAZO" | "ATENCAO" | "ATRASADO" | "CONCLUIDO" | "SEM_DADOS";

export type EntradaSaude = {
  status: string;
  startDate: Date | string | null;
  endDate: Date | string | null;
  total: number; // tarefas do projeto
  feitas: number;
  atrasadas: number; // abertas com prazo vencido
  bloqueadas: number;
};
export type Saude = { nivel: NivelSaude; rotulo: string; motivos: string[] };

export const ROTULO_SAUDE: Record<NivelSaude, string> = {
  NO_PRAZO: "No prazo",
  ATENCAO: "Atenção",
  ATRASADO: "Atrasado",
  CONCLUIDO: "Concluído",
  SEM_DADOS: "Sem tarefas",
};

/** Cores (classes do Tailwind) de cada nivel, para as telas usarem o mesmo semaforo. */
export const COR_SAUDE: Record<NivelSaude, string> = {
  NO_PRAZO: "bg-emerald-50 text-emerald-700",
  ATENCAO: "bg-amber-50 text-amber-700",
  ATRASADO: "bg-rose-50 text-rose-700",
  CONCLUIDO: "bg-slate-100 text-slate-600",
  SEM_DADOS: "bg-gray-100 text-gray-500",
};
export const PONTO_SAUDE: Record<NivelSaude, string> = {
  NO_PRAZO: "bg-emerald-500", ATENCAO: "bg-amber-500", ATRASADO: "bg-rose-500", CONCLUIDO: "bg-slate-400", SEM_DADOS: "bg-gray-300",
};

const LIMITE_ATRASO_PROPORCAO = 0.5; // metade das tarefas abertas vencidas = projeto atrasado (menos que isso e' so' atencao)
const LIMITE_ATRASO_QTD = 3;
const FOLGA_ANDAMENTO = 0.15; // andamento ate 15 pontos abaixo do esperado ainda e' "atencao leve" (so' avisa acima disso)

const dia = (v: Date | string | null): number | null => {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
};
const dataBr = (ms: number) => new Date(ms).toLocaleDateString("pt-BR", { timeZone: "UTC" });
const pct = (x: number) => `${Math.round(x * 100)}%`;

export function saudeDoProjeto(e: EntradaSaude, hojeData: Date = new Date()): Saude {
  const feito = (nivel: NivelSaude, motivos: string[]): Saude => ({ nivel, rotulo: ROTULO_SAUDE[nivel], motivos });
  if (e.status === "CONCLUIDO") return feito("CONCLUIDO", ["Projeto concluído"]);
  if (e.total <= 0) return feito("SEM_DADOS", ["O projeto ainda não tem tarefas"]);

  const hoje = dia(hojeData)!;
  const avanco = e.feitas / e.total;
  const abertas = Math.max(0, e.total - e.feitas);
  const ini = dia(e.startDate);
  const fim = dia(e.endDate);
  const atraso: string[] = [];
  const atencao: string[] = [];

  if (fim !== null && fim < hoje && avanco < 1) atraso.push(`Passou do fim previsto (${dataBr(fim)}) com ${pct(avanco)} concluído`);
  if (e.atrasadas >= LIMITE_ATRASO_QTD) atraso.push(`${e.atrasadas} tarefas atrasadas`);
  else if (abertas > 0 && e.atrasadas / abertas >= LIMITE_ATRASO_PROPORCAO && e.atrasadas > 0) atraso.push(`${e.atrasadas} de ${abertas} tarefas abertas estão atrasadas`);

  if (atraso.length === 0) {
    if (e.atrasadas > 0) atencao.push(`${e.atrasadas} tarefa${e.atrasadas > 1 ? "s" : ""} atrasada${e.atrasadas > 1 ? "s" : ""}`);
    if (e.bloqueadas > 0) atencao.push(`${e.bloqueadas} tarefa${e.bloqueadas > 1 ? "s" : ""} bloqueada${e.bloqueadas > 1 ? "s" : ""}`);
    if (ini !== null && fim !== null && fim > ini && hoje > ini && hoje <= fim) {
      const esperado = (hoje - ini) / (fim - ini);
      if (esperado - avanco > FOLGA_ANDAMENTO) atencao.push(`Andamento ${pct(avanco)}, esperado ${pct(esperado)} para a data`);
    }
    if (e.status === "PAUSADO") atencao.push("Projeto pausado");
  } else if (e.bloqueadas > 0) {
    atraso.push(`${e.bloqueadas} tarefa${e.bloqueadas > 1 ? "s" : ""} bloqueada${e.bloqueadas > 1 ? "s" : ""}`);
  }

  if (atraso.length) return feito("ATRASADO", atraso);
  if (atencao.length) return feito("ATENCAO", atencao);
  return feito("NO_PRAZO", [`${pct(avanco)} concluído, nenhuma tarefa atrasada`]);
}
