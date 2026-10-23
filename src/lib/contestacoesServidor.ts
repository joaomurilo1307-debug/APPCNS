// Contestacao de custo NO SERVIDOR: quem revisa, quem recebe aviso e como o aviso e' gravado. As regras puras estao em contestacoes.ts.

import { prisma } from "@/lib/prisma";
import { podeAcessarModulo, type UsuarioDaSessao } from "@/lib/acesso/servidor";

/** Revisa quem e' ADMIN ou tem o modulo "Aprovar contestacoes de custo" (liberado na tela Usuarios > Acesso). */
export async function ehRevisorDeContestacao(usuario: UsuarioDaSessao): Promise<boolean> {
  if (usuario.role === "ADMIN") return true;
  return podeAcessarModulo(usuario, "contestacoes_custo");
}

/**
 * Quem recebe o aviso de uma contestacao nova: as pessoas com o modulo liberado (a coordenacao financeira). Se ninguem tiver, os administradores,
 * para a contestacao nunca ficar sem destinatario.
 */
export async function destinatariosDaRevisao(): Promise<string[]> {
  const liberados = await prisma.acessoModulo.findMany({
    where: { modulo: "contestacoes_custo", permitido: true, user: { active: true } },
    select: { userId: true },
  });
  if (liberados.length) return Array.from(new Set(liberados.map((l) => l.userId)));
  const admins = await prisma.user.findMany({ where: { role: "ADMIN", active: true }, select: { id: true } });
  return admins.map((a) => a.id);
}

export async function avisar(userIds: string[], aviso: { title: string; body: string; tipo?: "APROVACAO_PENDENTE" | "OUTRO" }) {
  const unicos = Array.from(new Set(userIds));
  if (!unicos.length) return;
  await prisma.notification.createMany({
    data: unicos.map((userId) => ({ userId, type: aviso.tipo ?? "OUTRO", title: aviso.title, body: aviso.body, link: "/aprovacoes#contestacoes" })),
  });
}
