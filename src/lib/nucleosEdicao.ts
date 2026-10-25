// Regras PURAS da edicao de nucleos (sem banco): quem entra e quem sai dos colaboradores, o que fica num papel e o filtro da lista.
export type TipoNucleo = "SETOR" | "CONTRATO";
export const ROTULO_TIPO: Record<TipoNucleo, string> = { SETOR: "Setor", CONTRATO: "Contrato" };

/** Quem entra e quem sai quando a lista de colaboradores do nucleo muda (ids unicos). */
export function diferencaDeMembros(atuais: string[], desejados: string[]): { entram: string[]; saem: string[] } {
  const a = new Set(atuais);
  const d = new Set(desejados);
  return { entram: Array.from(d).filter((id) => !a.has(id)), saem: Array.from(a).filter((id) => !d.has(id)) };
}

/**
 * Lista final de um papel (diretor, gerente, coordenador): o que foi pedido, mas so' se a pessoa e' valida (ativa, nao contratante)
 * OU ja estava no papel. Assim, salvar a tela nao tira do papel quem foi desligado sem ninguem ter mexido nele.
 */
export function papelFinal(desejados: string[], atuais: string[], validos: Iterable<string>): string[] {
  const ok = new Set(validos);
  const ja = new Set(atuais);
  return Array.from(new Set(desejados)).filter((id) => ok.has(id) || ja.has(id));
}

type Gente = { name: string };
export type NucleoParaFiltro = { name: string; description: string | null; tipo: string; diretores: Gente[]; gerentes: Gente[]; coordenadores: Gente[]; membros: Gente[] };

const semAcento = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Filtro da lista de nucleos: tipo (SETOR, CONTRATO ou todos) e busca por nome, descricao ou nome de quem esta no nucleo. */
export function filtrarNucleos<T extends NucleoParaFiltro>(lista: T[], filtro: { tipo: TipoNucleo | "todos"; busca: string }): T[] {
  const termo = semAcento(filtro.busca.trim());
  return lista.filter((n) => {
    if (filtro.tipo !== "todos" && (n.tipo || "SETOR") !== filtro.tipo) return false;
    if (!termo) return true;
    const texto = [n.name, n.description ?? "", ...[...n.diretores, ...n.gerentes, ...n.coordenadores, ...n.membros].map((p) => p.name)].join(" ");
    return semAcento(texto).includes(termo);
  });
}
