// Quem enxerga quais centros de custo (CCU) na tela Custo por Centro de Custo -- UM so' lugar para a regra, usado por todas as
// rotas. Cada pessoa tem:
//   - TODOS: papel ADMIN/DIRETOR ou User.verTodosCustos;
//   - ou um conjunto de CCUs = os liberados para ela (AcessoCentroCusto) + os das equipes de que participa (Team.codccu);
//   - conjunto vazio = NENHUM.

import type { prisma as prismaReal } from "@/lib/prisma";

export type EscopoCustos = {
  todos: boolean;
  ccus: ReadonlySet<string>; // so' vale quando todos = false
  tipo: "todos" | "varios" | "um" | "nenhum";
  quantidade: number | null; // null = todos
};

export function montarEscopo(todos: boolean, ccus: Iterable<string>): EscopoCustos {
  if (todos) return { todos: true, ccus: new Set(), tipo: "todos", quantidade: null };
  const conjunto = new Set(ccus);
  const n = conjunto.size;
  return { todos: false, ccus: conjunto, tipo: n === 0 ? "nenhum" : n === 1 ? "um" : "varios", quantidade: n };
}

export function podeVerCcu(escopo: EscopoCustos, codccu: string): boolean {
  return escopo.todos || escopo.ccus.has(codccu);
}

export async function escopoDeCustos(db: typeof prismaReal, usuario: { id: string; role?: string }): Promise<EscopoCustos> {
  if (usuario.role && ["ADMIN", "DIRETOR"].includes(usuario.role)) return montarEscopo(true, []);
  const eu = await db.user.findUnique({
    where: { id: usuario.id },
    select: {
      verTodosCustos: true,
      acessosCentroCusto: { select: { codccu: true } },
      teams: { select: { team: { select: { codccu: true } } } },
    },
  });
  if (!eu) return montarEscopo(false, []);
  if (eu.verTodosCustos) return montarEscopo(true, []);
  const ccus = new Set<string>();
  for (const a of eu.acessosCentroCusto) ccus.add(a.codccu);
  for (const t of eu.teams) if (t.team.codccu) ccus.add(t.team.codccu);
  return montarEscopo(false, ccus);
}

// ---------------------------------------------------------------- importacao em lote ("email;190, 230, 102235")

export type LinhaAcesso = { email: string; todos: boolean; ccus: string[] };

/** PURA: le linhas "email;ccu, ccu, ccu" (ou "email;todos"). Aceita ; , tab como separador do e-mail e virgula/espaco entre CCUs. */
export function lerListaDeAcessos(texto: string): { linhas: LinhaAcesso[]; erros: string[] } {
  const linhas: LinhaAcesso[] = [];
  const erros: string[] = [];
  texto.split(/\r?\n/).forEach((bruta, i) => {
    const l = bruta.trim();
    if (!l || l.startsWith("#")) return;
    const m = /^([^\s;,\t]+@[^\s;,\t]+)\s*[;\t,]\s*(.+)$/.exec(l);
    if (!m) {
      erros.push(`linha ${i + 1}: use "email;190, 230" ou "email;todos" — "${l.slice(0, 60)}"`);
      return;
    }
    const resto = m[2].trim().toLowerCase();
    if (resto === "todos" || resto === "todos os centros de custo") {
      linhas.push({ email: m[1].toLowerCase(), todos: true, ccus: [] });
      return;
    }
    const ccus = Array.from(new Set(resto.split(/[\s,;]+/).filter(Boolean)));
    const invalido = ccus.find((c) => !/^\d+$/.test(c));
    if (invalido) {
      erros.push(`linha ${i + 1}: centro de custo "${invalido}" não é um número`);
      return;
    }
    linhas.push({ email: m[1].toLowerCase(), todos: false, ccus });
  });
  return { linhas, erros };
}
