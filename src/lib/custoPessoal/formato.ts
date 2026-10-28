// Formatacao de nomes e rotulos da tela de custo de pessoal (PURO).

const MINUSCULAS = new Set(["de", "da", "do", "dos", "das", "e"]);

/** "MARIA DA SILVA" -> "Maria da Silva" (o Senior guarda tudo em maiuscula). */
export function nomeBonito(s: string | null | undefined): string {
  if (!s) return "";
  return s
    .replace(/�/g, "")
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .map((p, i) => (i > 0 && MINUSCULAS.has(p) ? p : p.charAt(0).toUpperCase() + p.slice(1)))
    .join(" ");
}

/** Situacao atual no Senior com a data, quando nao e' "Trabalhando". */
export function situacaoTexto(situacao: string | null | undefined, data: string | null | undefined): string {
  if (!situacao || situacao === "Trabalhando") return "";
  return data ? `${situacao} desde ${data}` : situacao;
}

/** Tom do selo de situacao: ferias e afastamentos em amarelo, desligamento em vermelho. */
export function tomDaSituacao(situacao: string | null | undefined): "neutro" | "aviso" | "alerta" {
  if (!situacao || situacao === "Trabalhando") return "neutro";
  return situacao === "Demitido" || situacao === "Distrato PJ" || situacao === "Aposentadoria por invalidez" ? "alerta" : "aviso";
}
