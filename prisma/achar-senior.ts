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
export type UsuarioSeniorComEmail = UsuarioSeniorLinha & { email?: string | null };

/**
 * PURA: o usuario do Senior que corresponde a um e-mail do sistema, ou null (na duvida nunca chuta).
 *  1) e-mail IGUAL ao e-mail cadastrado no Senior (E099USU.INTNET): vale se so' um usuario do Senior tem esse e-mail;
 *  2) se varios usuarios do Senior tem o mesmo e-mail (caixa de grupo ou de chefia), vale so' o que tem o login igual a parte antes do @;
 *  3) sem e-mail igual: o unico usuario do Senior cujo login e' igual a parte do e-mail antes do @.
 */
export function acharSeniorPorEmail(email: string, usuarios: UsuarioSeniorComEmail[]): UsuarioSeniorLinha | null {
  const completo = email.trim().toLowerCase();
  const alvoLogin = chaveLogin((completo.split("@")[0] ?? "").trim());
  const limpo = (u: UsuarioSeniorComEmail): UsuarioSeniorLinha => ({ codigo: u.codigo, nome: u.nome });
  if (completo.includes("@")) {
    const iguais = usuarios.filter((u) => (u.email ?? "").trim().toLowerCase() === completo);
    if (iguais.length === 1) return limpo(iguais[0]);
    if (iguais.length > 1 && alvoLogin.length >= 3) {
      const peloLogin = iguais.filter((u) => chaveLogin(u.nome) === alvoLogin);
      if (peloLogin.length === 1) return limpo(peloLogin[0]);
    }
  }
  if (alvoLogin.length < 3) return null;
  const porLogin = usuarios.filter((u) => chaveLogin(u.nome) === alvoLogin);
  return porLogin.length === 1 ? limpo(porLogin[0]) : null;
}

/** Vincula (manualmente, como o admin faria) o login do Senior achado pelo e-mail. Devolve o login vinculado ou null. */
export async function vincularSeniorPorEmail(
  prisma: Pick<PrismaClient, "usuarioSenior" | "vinculoSenior">,
  userId: string,
  email: string,
  criadoPor: string
): Promise<UsuarioSeniorLinha | null> {
  const achado = acharSeniorPorEmail(email, await prisma.usuarioSenior.findMany({ select: { codigo: true, nome: true, email: true } }));
  if (!achado) return null;
  await prisma.vinculoSenior.upsert({
    where: { userId_codigo: { userId, codigo: achado.codigo } },
    create: { userId, codigo: achado.codigo, criadoPor },
    update: {},
  });
  return achado;
}
