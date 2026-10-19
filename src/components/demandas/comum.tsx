"use client";

export const STATUS_ROTULO: Record<string, string> = { NOVA: "Nova", EM_ANALISE: "Em análise", EM_PROJETO: "Em projeto", CONCLUIDA: "Concluída", RECUSADA: "Recusada" };
export const STATUS_COR: Record<string, string> = {
  NOVA: "bg-sky-100 text-sky-800", EM_ANALISE: "bg-amber-100 text-amber-800", EM_PROJETO: "bg-violet-100 text-violet-800", CONCLUIDA: "bg-emerald-100 text-emerald-800", RECUSADA: "bg-gray-200 text-gray-700",
};
export const PRIORIDADE_ROTULO: Record<string, string> = { BAIXA: "Baixa", NORMAL: "Normal", ALTA: "Alta", URGENTE: "Urgente" };
export const PRIORIDADE_COR: Record<string, string> = { BAIXA: "bg-gray-100 text-gray-600", NORMAL: "bg-gray-100 text-gray-700", ALTA: "bg-orange-100 text-orange-800", URGENTE: "bg-red-100 text-red-700" };
export const TAREFA_ROTULO: Record<string, string> = { A_FAZER: "A fazer", FAZENDO: "Fazendo", BLOQUEADO: "Bloqueado", FEITO: "Feito" };

export const dataBr = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleDateString("pt-BR", { timeZone: "UTC" }) : "");
export const dataHora = (iso: string) => new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" });

export function Pill({ cor, children }: { cor: string; children: React.ReactNode }) {
  return <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${cor}`}>{children}</span>;
}

export function Barra({ pct }: { pct: number }) {
  return (
    <div className="h-2 w-full rounded-full bg-gray-100" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
      <div className="h-2 rounded-full bg-brand transition-all" style={{ width: `${pct}%` }} />
    </div>
  );
}
