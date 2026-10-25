// Vinculo da pessoa ao usuario do Senior (CODUSU), que define quais OCs ela ve. Decisao do Joao (25/10/2026):
//  - se o e-mail da pessoa for IGUAL ao e-mail do usuario no Senior, o vinculo e' automatico (regra em prisma/achar-senior.ts);
//  - o vinculo MANUAL (escolhido ao criar o usuario ou no painel de Acesso) vale no lugar do automatico: quem tem algum vinculo manual
//    usa so' o que o administrador escolheu.
import { prisma } from "@/lib/prisma";
import { acharSeniorPorEmail, type UsuarioSeniorLinha } from "../../../prisma/achar-senior";

/** O usuario do Senior achado pelo e-mail da pessoa (sem gravar nada), ou null. */
export async function seniorAutomaticoDe(userId: string): Promise<UsuarioSeniorLinha | null> {
  const eu = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
  if (!eu?.email) return null;
  return acharSeniorPorEmail(eu.email, await prisma.usuarioSenior.findMany({ select: { codigo: true, nome: true, email: true } }));
}

/** CODUSU que valem para a pessoa: os manuais, e so' se nao houver nenhum, o automatico por e-mail igual. */
export async function codigosDoSenior(userId: string): Promise<string[]> {
  const manuais = (await prisma.vinculoSenior.findMany({ where: { userId }, select: { codigo: true } })).map((v) => v.codigo);
  if (manuais.length > 0) return manuais;
  const auto = await seniorAutomaticoDe(userId);
  return auto ? [auto.codigo] : [];
}
