// Filtro e ordem da lista de Projetos (visao de portfolio): busca, situacao, saude, nucleo, contrato e responsavel. PURO (sem banco).
import type { NivelSaude } from "./saude";

export type ProjetoLista = {
  name: string; status: string; startDate?: string | null; endDate: string | null; percentComplete: number;
  team: { name: string }; owner: { id: string; name: string };
  contrato?: { codccu: string; nome: string | null } | null;
  nucleos?: { id: string; name: string }[];
  saude?: { nivel: NivelSaude };
};
export type OrdemProjetos = "recentes" | "nome" | "saude" | "prazo" | "andamento";
export type FiltroProjetos = { busca: string; status: string; saude: string; nucleoId: string; codccu: string; ownerId: string; ordem: OrdemProjetos };
export const FILTRO_VAZIO: FiltroProjetos = { busca: "", status: "", saude: "", nucleoId: "", codccu: "", ownerId: "", ordem: "recentes" };

const semAcento = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const GRAVIDADE: Record<string, number> = { ATRASADO: 0, ATENCAO: 1, NO_PRAZO: 2, SEM_DADOS: 3, CONCLUIDO: 4 };

export function filtrarProjetos<T extends ProjetoLista>(lista: T[], f: FiltroProjetos): T[] {
  const termo = semAcento(f.busca.trim());
  const saida = lista.filter((p) => {
    if (f.status && p.status !== f.status) return false;
    if (f.saude && (p.saude?.nivel ?? "SEM_DADOS") !== f.saude) return false;
    if (f.nucleoId && !(p.nucleos ?? []).some((n) => n.id === f.nucleoId)) return false;
    if (f.codccu && p.contrato?.codccu !== f.codccu) return false;
    if (f.ownerId && p.owner.id !== f.ownerId) return false;
    if (termo) {
      const texto = [p.name, p.team.name, p.owner.name, p.contrato?.codccu ?? "", p.contrato?.nome ?? "", ...(p.nucleos ?? []).map((n) => n.name)].join(" ");
      if (!semAcento(texto).includes(termo)) return false;
    }
    return true;
  });
  const comPrazo = (p: T) => (p.endDate ? new Date(p.endDate).getTime() : Infinity);
  if (f.ordem === "nome") return [...saida].sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  if (f.ordem === "saude") return [...saida].sort((a, b) => (GRAVIDADE[a.saude?.nivel ?? "SEM_DADOS"] ?? 9) - (GRAVIDADE[b.saude?.nivel ?? "SEM_DADOS"] ?? 9) || a.name.localeCompare(b.name, "pt-BR"));
  if (f.ordem === "prazo") return [...saida].sort((a, b) => comPrazo(a) - comPrazo(b) || a.name.localeCompare(b.name, "pt-BR"));
  if (f.ordem === "andamento") return [...saida].sort((a, b) => b.percentComplete - a.percentComplete || a.name.localeCompare(b.name, "pt-BR"));
  return saida; // "recentes": a ordem que a API devolveu (mais novos primeiro)
}

/** Opcoes dos filtros, tiradas so' dos projetos que a pessoa ve (nunca lista nucleo, contrato ou responsavel de projeto que ela nao enxerga). */
export function opcoesDosFiltros(lista: ProjetoLista[]) {
  const nucleos = new Map<string, string>();
  const contratos = new Map<string, string>();
  const donos = new Map<string, string>();
  for (const p of lista) {
    for (const n of p.nucleos ?? []) nucleos.set(n.id, n.name);
    if (p.contrato) contratos.set(p.contrato.codccu, p.contrato.nome ? `${p.contrato.codccu} · ${p.contrato.nome}` : p.contrato.codccu);
    donos.set(p.owner.id, p.owner.name);
  }
  const ordenar = (m: Map<string, string>) => Array.from(m, ([id, nome]) => ({ id, nome })).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR", { numeric: true }));
  return { nucleos: ordenar(nucleos), contratos: ordenar(contratos), donos: ordenar(donos) };
}
