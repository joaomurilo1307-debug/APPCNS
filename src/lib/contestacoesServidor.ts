// Contestacao de custo NO SERVIDOR: quem revisa, quem recebe aviso e como o aviso e' gravado. As regras puras estao em contestacoes.ts.

import { prisma } from "@/lib/prisma";
import { podeAcessarModulo, type UsuarioDaSessao } from "@/lib/acesso/servidor";
import { sendAvisoEmail, sendNotificationEmail } from "@/lib/mailer";
import { emailDaContestacao, lerListaDeEmails, notificacaoDecisao, validarDecisao, type DadosDoEmail, type StatusContestacao } from "@/lib/contestacoes";
import { logAudit } from "@/lib/auditLog";

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

/**
 * Envia o pedido por e-mail (OC, titulo, descricao e os links de resposta). Tenta o remetente de avisos automaticos e, se nao houver, o remetente padrao. Nunca derruba o pedido.
 * O resultado (para quem foi, ou por que nao foi) fica gravado na contestacao e aparece na tela Aprovacoes: nada de e-mail "que talvez foi".
 */
export async function enviarEmailDaContestacao(
  c: DadosDoEmail,
  p: { autor: string; justificativa: string; indicado?: string | null; anexos?: string[]; links?: { ok: string; realocado: string; discordo: string } | null },
  contestacaoId?: string
) {
  const gravar = async (enviado: boolean, texto: string) => {
    if (!contestacaoId) return;
    await prisma.contestacaoCusto.update({ where: { id: contestacaoId }, data: { emailEnviadoEm: enviado ? new Date() : null, emailEnvio: texto.slice(0, 500) } }).catch(() => {});
  };
  try {
    const para = await enderecosDaRevisao();
    if (!para.length) return gravar(false, "Não enviado: ninguém está configurado para receber (tela Aprovações > e-mails que recebem).");
    const { subject, text } = emailDaContestacao(c, { ...p, dominio: process.env.APP_DOMAIN });
    const enviou = (await sendAvisoEmail({ to: para, subject, text })) || (await sendNotificationEmail({ to: para, subject, text }));
    await gravar(enviou, enviou ? `Enviado para: ${para.map((d) => d.email).join(", ")}` : `Não enviado: o servidor de e-mail recusou ou não está configurado (destinatários: ${para.map((d) => d.email).join(", ")}).`);
  } catch (e) {
    console.error("Falha ao enviar o e-mail da contestação:", e);
    await gravar(false, `Não enviado: ${(e as Error)?.message ?? "erro desconhecido"}`);
  }
}

export type QuemDecide = { userId: string | null; nome: string; via: "sistema" | "e-mail" };

/**
 * Registra a decisao do financeiro (aceitar, realocado, rejeitar) vinda da tela Aprovacoes ou do link do e-mail: valida a etapa, grava, avisa quem contestou (e o indicado) dentro do sistema
 * e registra na auditoria. O Senior nao e' alterado.
 */
export async function decidirContestacao(
  id: string,
  status: Exclude<StatusContestacao, "PENDENTE">,
  parecer: string | null | undefined,
  quem: QuemDecide
): Promise<{ ok: true; id: string; status: string } | { ok: false; erro: string; codigo: number }> {
  const c = await prisma.contestacaoCusto.findUnique({ where: { id } });
  if (!c) return { ok: false, erro: "Contestação não encontrada", codigo: 404 };
  const erro = validarDecisao(c.status, status, parecer);
  if (erro) return { ok: false, erro, codigo: c.status === "PENDENTE" ? 422 : 409 };
  const agora = new Date();
  const atual = await prisma.contestacaoCusto.update({
    where: { id: c.id },
    data: { status, parecer: parecer?.trim() || c.parecer || null, decididoPorId: quem.userId, decididoEm: agora, decididoVia: quem.via, ...(status === "REALOCADA" ? { realocadoEm: agora } : {}) },
    select: { id: true, status: true },
  });
  const aviso = notificacaoDecisao({ fornecedor: c.fornecedor, numTit: c.numTit, numOcp: c.numOcp, valor: c.valor, ccuNome: c.ccuNome, codccu: c.codccu }, status, quem.nome, parecer);
  await avisar([c.autorId, ...(c.indicadoId ? [c.indicadoId] : [])].filter((u) => u !== quem.userId), aviso);
  const acao = status === "ACEITA" ? "aceitar" : status === "REALOCADA" ? "realocar" : "rejeitar";
  await logAudit({ userId: quem.userId, action: `contestacao.${acao}`, entityType: "ContestacaoCusto", entityId: c.id, metadata: { chave: c.chave, codccu: c.codccu, via: quem.via } });
  return { ok: true, id: atual.id, status: atual.status };
}
