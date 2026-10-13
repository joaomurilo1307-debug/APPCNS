// Tipos, formatadores e chamadas de API compartilhados pelas telas do controle de efetivos.
import { diferencaDias, somarDias, type Dia } from "@/lib/efetivos/disponibilidade";

export type Equipe = { id: string; codigo: string; nome: string; projeto: string; gestor: string | null; grupo: string; status: string };
export type Vaga = {
  id: string;
  numero: number | null;
  equipeId: string;
  nome: string | null;
  status: string;
  cargo: string;
  empresa: string;
  atividade: string;
  previsaoInicio: Dia | null;
  nivel: string | null;
  direcao4x4: boolean | null;
  contratoAtual: string | null;
  disponivelAPartir: Dia | null;
  destino: string | null;
  observacao: string | null;
};
export type Ausencia = { id: string; vagaId: string; tipo: string; inicio: Dia; fim: Dia; observacao: string | null };
export type Campanha = {
  id: string;
  codigo: string;
  recebidaEm: Dia | null;
  solicitante: string | null;
  projeto: string;
  grupo: string;
  atividade: string;
  local: string | null;
  inicio: Dia;
  fim: Dia;
  qtdEquipes: number;
  prioridade: string;
  status: string;
  observacao: string | null;
};
export type Alocacao = { id: string; campanhaId: string; vagaId: string; inicio: Dia; fim: Dia };
export type Veiculo = {
  id: string;
  codigo: string;
  identificacao: string;
  placa: string | null;
  modelo: string | null;
  tracao4x4: boolean | null;
  status: string;
  observacao: string | null;
};
export type Movimento = {
  id: string;
  veiculoId: string;
  inicio: Dia;
  fim: Dia | null;
  projeto: string;
  equipeId: string | null;
  campanhaId: string | null;
  local: string | null;
  observacao: string | null;
};
export type DadosTela = {
  nivel: "ADMIN" | "EDITOR" | "DASHBOARD";
  podeEditar: boolean;
  equipes: Equipe[];
  vagas: Vaga[];
  ausencias: Ausencia[];
  campanhas: Campanha[];
  alocacoes: Alocacao[];
  veiculos: Veiculo[];
  movimentos: Movimento[];
};

export const fmtDia = (d: Dia | null | undefined) => (d ? `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}` : "—");
export const fmtDiaCurto = (d: Dia) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;

export function hojeBr(): Dia {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" })
      .formatToParts(new Date())
      .map((x) => [x.type, x.value])
  );
  return `${p.year}-${p.month}-${p.day}`;
}

export function segundaDaSemana(dia: Dia): Dia {
  const dow = new Date(`${dia}T00:00:00.000Z`).getUTCDay(); // 0=domingo
  return somarDias(dia, -((dow + 6) % 7));
}

export { diferencaDias, somarDias };

export const COR_DISPONIBILIDADE: Record<string, string> = {
  "DISPONÍVEL": "bg-emerald-100 text-emerald-800",
  ALOCADA: "bg-sky-100 text-sky-800",
  "INDISPONÍVEL": "bg-red-100 text-red-700",
};
export const COR_RH: Record<string, string> = {
  COMPLETA: "bg-emerald-50 text-emerald-700",
  "COM VAGAS": "bg-amber-100 text-amber-800",
  "COM AUSÊNCIA": "bg-red-50 text-red-700",
  "EQUIPE NÃO ATIVA": "bg-gray-100 text-gray-600",
};
export const COR_STATUS_CAMPANHA: Record<string, string> = {
  Nova: "bg-purple-100 text-purple-800",
  "Em análise": "bg-amber-100 text-amber-800",
  Planejada: "bg-sky-100 text-sky-800",
  Confirmada: "bg-emerald-100 text-emerald-800",
  "Em execução": "bg-teal-100 text-teal-800",
  Concluída: "bg-gray-100 text-gray-600",
  Cancelada: "bg-gray-100 text-gray-500 line-through",
};
export const COR_ATENDIMENTO: Record<string, string> = {
  "CAPACIDADE SUFICIENTE": "bg-emerald-100 text-emerald-800",
  "ATENDIMENTO PARCIAL": "bg-amber-100 text-amber-800",
  "SEM EQUIPE DISPONÍVEL": "bg-red-100 text-red-700",
};

export async function chamar<T = any>(metodo: string, url: string, corpo?: unknown): Promise<{ ok: boolean; status: number; dados: T & { error?: string; conflitos?: any[] } }> {
  try {
    const r = await fetch(url, {
      method: metodo,
      headers: corpo instanceof FormData || corpo === undefined ? undefined : { "Content-Type": "application/json" },
      body: corpo === undefined ? undefined : corpo instanceof FormData ? corpo : JSON.stringify(corpo),
    });
    const dados = await r.json().catch(() => ({}));
    return { ok: r.ok, status: r.status, dados };
  } catch {
    return { ok: false, status: 0, dados: { error: "Sem conexão com o servidor. Tente de novo." } as any };
  }
}

export const MOTIVO_CONFLITO: Record<string, string> = {
  INEXISTENTE: "não existe mais",
  SEM_PROFISSIONAL: "vaga sem profissional",
  EQUIPE_INATIVA: "equipe inativa",
  AUSENTE: "ausente no período",
  ALOCADA: "já está em outra campanha no período",
};
