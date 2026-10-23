import { prisma } from "@/lib/prisma";

/** Pessoas que podem ser escolhidas para uma equipe, demanda ou projeto: ativas e que nao sejam contratante. Devolve so' os ids validos. */
export async function pessoasValidas(ids: string[]): Promise<string[]> {
  const unicos = Array.from(new Set(ids));
  if (!unicos.length) return [];
  const achadas = await prisma.user.findMany({ where: { id: { in: unicos }, active: true, anonymizedAt: null, role: { not: "CLIENTE" } }, select: { id: true } });
  return achadas.map((a) => a.id);
}

/** Nome livre para uma equipe nova: o desejado, ou "nome (2)", "nome (3)"... (Team.name e' unico). */
export async function nomeLivreDeEquipe(base: string, existe: (nome: string) => Promise<boolean>): Promise<string> {
  let nome = base;
  for (let i = 2; await existe(nome); i++) nome = `${base} (${i})`;
  return nome;
}
