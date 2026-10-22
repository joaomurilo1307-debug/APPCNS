// Acha o usuario do sistema que corresponde a uma pessoa da planilha de ativos (chapa + nome completo), para os seeds de nucleos e acessos.
// Ordem: matricula do Senior (unica) -> nome completo igual (so' se unico) -> nomes curtos cadastrados no sistema ("Renata Marinho")
// cujas palavras estao todas no nome completo e comecam pelo mesmo primeiro nome (so' se unico). Na duvida devolve null: nunca chuta.
import type { PrismaClient } from "@prisma/client";

export function chaveNome(bruto: string): string {
  return bruto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export type Candidato = { id: string; name: string };

/** PURA: escolhe entre os usuarios; devolve o id e o criterio, ou null se nao houver exatamente um. */
export function escolherUsuario(usuarios: Candidato[], nomeCompleto: string): { id: string; via: "nome" | "nome-curto" } | null {
  const alvo = chaveNome(nomeCompleto);
  const iguais = usuarios.filter((u) => chaveNome(u.name) === alvo);
  if (iguais.length === 1) return { id: iguais[0].id, via: "nome" };
  if (iguais.length > 1) return null;
  const palavrasAlvo = alvo.split(" ");
  const curtos = usuarios.filter((u) => {
    const p = chaveNome(u.name).split(" ").filter(Boolean);
    return p.length >= 2 && p[0] === palavrasAlvo[0] && p.every((w) => palavrasAlvo.includes(w));
  });
  return curtos.length === 1 ? { id: curtos[0].id, via: "nome-curto" } : null;
}

export async function acharUsuario(prisma: PrismaClient, chapa: string, nomeCompleto: string, todos?: Candidato[]) {
  const porMatricula = await prisma.user.findUnique({ where: { matriculaSenior: chapa }, select: { id: true } });
  if (porMatricula) return { id: porMatricula.id, via: "matricula" as const };
  const usuarios = todos ?? (await prisma.user.findMany({ select: { id: true, name: true } }));
  return escolherUsuario(usuarios, nomeCompleto);
}

/** PURA: usuario cujo nome tem esta palavra (ex.: "JULIMAR"); so' se houver exatamente um. Para cadastros usados por outra pessoa, que nao constam da planilha. */
export function escolherPorPalavra(usuarios: Candidato[], palavra: string): { id: string; via: "palavra" } | null {
  const alvo = chaveNome(palavra);
  const achados = usuarios.filter((u) => chaveNome(u.name).split(" ").includes(alvo));
  return achados.length === 1 ? { id: achados[0].id, via: "palavra" } : null;
}
