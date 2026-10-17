// Formatadores da tela Custo por Contrato (pt-BR).

const MESES_CURTOS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const MESES_LONGOS = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

export const moeda = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
export const moedaSemSimbolo = (v: number) => v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** 1.234.567 -> "R$ 1,23 mi"; 45.300 -> "R$ 45,3 mil"; abaixo de mil mostra o valor inteiro. */
export function moedaCompacta(v: number): string {
  const a = Math.abs(v);
  const sinal = v < 0 ? "-" : "";
  if (a >= 1_000_000) return `${sinal}R$ ${(a / 1_000_000).toLocaleString("pt-BR", { maximumFractionDigits: 2 })} mi`;
  if (a >= 10_000) return `${sinal}R$ ${(a / 1_000).toLocaleString("pt-BR", { maximumFractionDigits: 0 })} mil`;
  if (a >= 1_000) return `${sinal}R$ ${(a / 1_000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mil`;
  return `${sinal}R$ ${a.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}`;
}

/** "2026-04" -> "abr/26" */
export function mesCurto(chave: string): string {
  const [a, m] = chave.split("-");
  return `${MESES_CURTOS[Number(m) - 1]}/${a.slice(2)}`;
}

/** "2026-04" -> "abril de 2026" */
export function mesLongo(chave: string): string {
  const [a, m] = chave.split("-");
  return `${MESES_LONGOS[Number(m) - 1]} de ${a}`;
}

export function percentual(v: number, casas = 0): string {
  return `${(v * 100).toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas })}%`;
}

/** Variacao com sinal e seta: "▲ 12%" / "▼ 4%" / "—". */
export function variacaoTexto(v: number | null): string {
  if (v === null || !Number.isFinite(v)) return "—";
  if (Math.abs(v) < 0.005) return "= estável";
  return `${v > 0 ? "▲" : "▼"} ${percentual(Math.abs(v), Math.abs(v) < 0.1 ? 1 : 0)}`;
}

export function formatData(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("pt-BR", { timeZone: "UTC" });
}

export function haQuantoTempo(iso: string | null, agora = Date.now()): string {
  if (!iso) return "nunca";
  const min = Math.max(0, Math.round((agora - new Date(iso).getTime()) / 60000));
  if (min < 1) return "agora há pouco";
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `há ${h} h`;
  return `há ${Math.floor(h / 24)} d`;
}

export function dataHoraCurta(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return `${d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "America/Sao_Paulo" })} às ${d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" })}`;
}

export const maiusculaInicial = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
