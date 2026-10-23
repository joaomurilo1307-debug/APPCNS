// Acha o usuario do Senior que corresponde a um e-mail do sistema: o login do Senior e' a parte do e-mail antes do @
// (bruno.teixeira@consominas.com.br -> "bruno.teixeira"). So' vale quando ha exatamente um usuario do Senior com esse login; na duvida
// devolve null e nunca chuta. Usado ao criar o usuario (API e painel de Acesso) e pelo seed que vincula quem ja existe.
import type { PrismaClient } from "@prisma/client";

/** "bruno.teixeira" e "Bruno Teixeira" dao a mesma chave (sem acento, sem pontuacao, maiusculas). */
export function chaveLogin(bruto: string): string {
  return bruto
    .replace(/[._\-]+/g, " ")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export type UsuarioSeniorLinha = { codigo: string; nome: string };

/** PURA: o unico usuario do Senior cujo login e' igual ao do e-mail, ou null. */
export function acharSeniorPorEmail(email: string, usuarios: UsuarioSeniorLinha[]): UsuarioSeniorLinha | null {
  const alvo = chaveLogin((email.split("@")[0] ?? "").trim());
  if (alvo.length < 3) return null;
  const iguais = usuarios.filter((u) => chaveLogin(u.nome) === alvo);
  return iguais.length === 1 ? iguais[0] : null;
}

/** Vincula (manualmente, como o admin faria) o login do Senior achado pelo e-mail. Devolve o login vinculado ou null. */
export async function vincularSeniorPorEmail(
  prisma: Pick<PrismaClient, "usuarioSenior" | "vinculoSenior">,
  userId: string,
  email: string,
  criadoPor: string
): Promise<UsuarioSeniorLinha | null> {
  const achado = acharSeniorPorEmail(email, await prisma.usuarioSenior.findMany({ select: { codigo: true, nome: true } }));
  if (!achado) return null;
  await prisma.vinculoSenior.upsert({
    where: { userId_codigo: { userId, codigo: achado.codigo } },
    create: { userId, codigo: achado.codigo, criadoPor },
    update: {},
  });
  return achado;
}
