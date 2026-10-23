// Contestacao de custo NO SERVIDOR: quem revisa, quem recebe aviso e como o aviso e' gravado. As regras puras estao em contestacoes.ts.

import { prisma } from "@/lib/prisma";
import { podeAcessarModulo, type UsuarioDaSessao } from "@/lib/acesso/servidor";
import { sendAvisoEmail, sendNotificationEmail } from "@/lib/mailer";
import { emailDaContestacao, lerListaDeEmails, type DadosDoEmail } from "@/lib/contestacoes";

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

// ---------------------------------------------------------------- e-mail
export const CHAVE_EMAILS = "contestacoes.emails";

/** E-mails extras que recebem os pedidos (tela Aprovacoes, para o financeiro). Vem de Configuracao; vazio se nao houver. */
export async function emailsConfigurados(): Promise<string[]> {
  const c = await prisma.configuracao.findUnique({ where: { chave: CHAVE_EMAILS }, select: { valor: true } });
  return lerListaDeEmails(c?.valor).validos;
}

export async function gravarEmailsConfigurados(lista: string[]) {
  await prisma.configuracao.upsert({ where: { chave: CHAVE_EMAILS }, update: { valor: lista.join(", ") }, create: { chave: CHAVE_EMAILS, valor: lista.join(", ") } });
}

/** Quem recebe o e-mail: a lista configurada + o e-mail de cada pessoa que revisa (sem repetir). */
export async function enderecosDaRevisao(): Promise<{ email: string; name: string }[]> {
  const mapa = new Map<string, string>();
  for (const e of await emailsConfigurados()) mapa.set(e, e);
  const ids = await destinatariosDaRevisao();
  if (ids.length) {
    for (const u of await prisma.user.findMany({ where: { id: { in: ids }, active: true }, select: { email: true, name: true } })) {
      if (u.email) mapa.set(u.email.toLowerCase(), u.name);
    }
  }
  return Array.from(mapa.entries()).map(([email, name]) => ({ email, name }));
}

/** Envia o pedido por e-mail (OC, titulo e descricao). Tenta o remetente de avisos automaticos e, se nao houver, o remetente padrao. Nunca derruba o pedido. */
export async function enviarEmailDaContestacao(c: DadosDoEmail, p: { autor: string; justificativa: string; indicado?: string | null; anexos?: string[] }) {
  try {
    const para = await enderecosDaRevisao();
    if (!para.length) return;
    const { subject, text } = emailDaContestacao(c, { ...p, dominio: process.env.APP_DOMAIN });
    const enviou = await sendAvisoEmail({ to: para, subject, text });
    if (!enviou) await sendNotificationEmail({ to: para, subject, text });
  } catch (e) {
    console.error("Falha ao enviar o e-mail da contestação:", e);
  }
}
