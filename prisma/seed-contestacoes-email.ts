// Contestacao de custo por e-mail (28/10/2026): garante o endereco da Monica na lista de quem recebe o pedido (uma vez por endereco, sem tirar ninguem e sem desfazer o que o
// financeiro editou depois) e envia UM e-mail de teste so' para o Joao, para provar que o servidor de e-mail do sistema funciona. O resultado (e, se falhar, o MOTIVO) vai para o log.
// Tambem garante (uma vez) o acesso de REVISORA das contestacoes ao usuario PROPRIO da Monica: ela recebe o aviso e decide dentro do sistema (tela Contestacoes).
// Independente do codigo do app (no contêiner so' existe a pasta prisma): usa so' @prisma/client e nodemailer.
// Marcas na auditoria: "seed.contestacoes-email.add.<email>", "seed.contestacoes-email.teste" (o teste FUNCIONOU) e "...teste-falhou" (cada tentativa que falhou; para depois de 3,
// para nao atrasar a inicializacao). Cada tentativa espera no maximo ~20 s.
import { PrismaClient } from "@prisma/client";
import nodemailer from "nodemailer";
import fs from "fs";
import path from "path";

const prisma = new PrismaClient();
const CHAVE = "contestacoes.emails";
const dados = JSON.parse(fs.readFileSync(path.join(process.cwd(), "prisma", "data", "contestacoes_inicial.json"), "utf-8")) as { emails: { email: string; nome: string }[]; remover?: string[]; versao?: string; corrigirEmailDoUsuario?: { de: string; para: string }; testePara: { email: string; nome: string } };

const lerEmails = (texto: string | null | undefined) => Array.from(new Set((texto ?? "").split(/[\s,;]+/).map((e) => e.trim().toLowerCase()).filter((e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e))));

async function enviarTeste(): Promise<{ ok: boolean; detalhe: string }> {
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) return { ok: false, detalhe: "SMTP_HOST/SMTP_USER/SMTP_PASS não configurados no servidor" };
  try {
    const t = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT ?? 465),
      secure: (process.env.SMTP_SECURE ?? "true") === "true",
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
      connectionTimeout: 15_000,
      greetingTimeout: 15_000,
      socketTimeout: 20_000,
    });
    const info = await t.sendMail({
      from: `"Consominas Gestão" <${process.env.SMTP_USER}>`,
      to: `"${dados.testePara.nome}" <${dados.testePara.email}>`,
      subject: "TESTE do envio de contestação de custo (só para o João)",
      text: "Este é um teste do envio de e-mail do sistema, o mesmo caminho do e-mail de contestação de custo para a Mônica. Se você recebeu, o servidor de e-mail está funcionando. Nenhuma ação é necessária.",
    });
    return info.accepted?.length ? { ok: true, detalhe: `aceito pelo servidor de e-mail (${String(info.response).slice(0, 60)})` } : { ok: false, detalhe: `o servidor recusou o destinatário (${(info.rejected ?? []).join(", ")})` };
  } catch (e) {
    const err = e as { code?: string; message?: string };
    return { ok: false, detalhe: `${err.code ?? "erro"}: ${String(err.message ?? "").slice(0, 160)}` };
  }
}

const semAcento = (t: string) => t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();

/**
 * A revisora das contestacoes e' a MONICA (coordenadora financeira, chapa 2234, "MONICA ADRIANA DE OLIVEIRA B CARNEIRO"), com usuario e e-mail PROPRIOS no sistema; so' o login dela no Senior e' o
 * antigo do Julimar. Procura os usuarios com "Monica" no nome ou no e-mail, MOSTRA todos no log e so' libera quando ha EXATAMENTE UMA candidata compativel (nome com Adriana ou Carneiro, ou e-mail
 * monica.olive..., monica.carneiro ou monica.adriana (o cadastro dela esta como monica.olivera@, sem o i); a bióloga Monica Manoela Tavares de Oliveira Melo, de outro contrato, fica de fora). Liberou, retira o acesso que o seed anterior tinha dado ao usuario do Julimar
 * (premissa errada: ele nao e' a Monica). Cada passo e' feito uma vez (marca na auditoria).
 */
async function garantirRevisora() {
  const todos = await prisma.user.findMany({ where: { active: true }, select: { id: true, name: true, email: true, role: true } });
  const comMonica = todos.filter((u) => semAcento(u.name).includes("MONICA") || semAcento(u.email ?? "").startsWith("MONICA"));
  console.log(`Contestação: usuários ativos com "Mônica" no nome ou no e-mail (${comMonica.length}): ${comMonica.map((u) => `${u.name} <${u.email}> [${u.role}]`).join("; ") || "nenhum"}.`);
  const compativeis = comMonica.filter((u) => {
    const n = semAcento(u.name), e = semAcento(u.email ?? "");
    const outra = n.includes("MELO") || n.includes("MANOELA") || n.includes("TAVARES");
    return !outra && (n.includes("ADRIANA") || n.includes("CARNEIRO") || /^MONICA\.(OLIVE|CARNEIRO|ADRIANA)/.test(e));
  });
  if (compativeis.length !== 1) return console.log(`Contestação: não identifiquei com certeza o usuário da Mônica (${compativeis.length} compatíveis); o acesso de revisora não foi alterado.`);
  const m = compativeis[0];
  const marca = "seed.contestacoes-revisor.monica";
  if (!(await prisma.auditLog.findFirst({ where: { action: marca }, select: { id: true } }))) {
    await prisma.acessoModulo.upsert({
      where: { userId_modulo: { userId: m.id, modulo: "contestacoes_custo" } },
      create: { userId: m.id, modulo: "contestacoes_custo", permitido: true, nivel: "EDITAR", concedidoPor: "seed 28/10/2026" },
      update: { permitido: true, nivel: "EDITAR", concedidoPor: "seed 28/10/2026" },
    });
    await prisma.auditLog.create({ data: { userId: m.id, action: marca, entityType: "AcessoModulo", metadata: JSON.stringify({ modulo: "contestacoes_custo", email: m.email }) } });
    // o usuario do Julimar (quem saiu) nao e' a Monica: tira o acesso de revisor que o seed anterior deu a ele
    const julimar = todos.filter((u) => semAcento(u.name).includes("JULIMAR"));
    if (julimar.length === 1) {
      const r = await prisma.acessoModulo.deleteMany({ where: { userId: julimar[0].id, modulo: "contestacoes_custo" } });
      console.log(`Contestação: retirado o acesso de revisor do usuário "${julimar[0].name}" (${r.count} linha); ele não é a Mônica.`);
    }
  }
  const tem = await prisma.acessoModulo.findUnique({ where: { userId_modulo: { userId: m.id, modulo: "contestacoes_custo" } }, select: { permitido: true } });
  console.log(`Contestação: revisora = "${m.name}" (${m.email}); acesso às contestações: ${tem?.permitido ? "LIBERADO" : "BLOQUEADO (alguém tirou; não mexo de novo)"}.`);
}

/** O cadastro da Monica no sistema esta com o e-mail errado (monica.olivera@); o certo e' o do Outlook (monica.oliveira@). Corrige uma vez, so' se o endereco certo estiver livre. */
async function corrigirEmailDoUsuario() {
  const c = dados.corrigirEmailDoUsuario;
  if (!c) return;
  const marca = `seed.contestacoes-email.corrigir-usuario.${c.de}`;
  if (await prisma.auditLog.findFirst({ where: { action: marca }, select: { id: true } })) return;
  const usuario = await prisma.user.findFirst({ where: { email: { equals: c.de, mode: "insensitive" } }, select: { id: true, name: true, email: true } });
  if (!usuario) return console.log(`Contestação: e-mail do usuário a corrigir (${c.de}) não encontrado; nada feito.`);
  if (await prisma.user.findFirst({ where: { email: { equals: c.para, mode: "insensitive" } }, select: { id: true } })) return console.log(`Contestação: já existe outro usuário com ${c.para}; não troquei o e-mail de "${usuario.name}".`);
  await prisma.user.update({ where: { id: usuario.id }, data: { email: c.para } });
  await prisma.auditLog.create({ data: { userId: usuario.id, action: marca, entityType: "User", entityId: usuario.id, metadata: JSON.stringify({ de: c.de, para: c.para }) } });
  console.log(`Contestação: e-mail do usuário "${usuario.name}" corrigido de ${c.de} para ${c.para} (ela passa a entrar com o endereço certo).`);
}

async function main() {
  await corrigirEmailDoUsuario();
  await garantirRevisora();
  const lista = lerEmails((await prisma.configuracao.findUnique({ where: { chave: CHAVE }, select: { valor: true } }))?.valor);
  const adicionados: string[] = [];
  for (const e of dados.emails) {
    const marca = `seed.contestacoes-email.add.${dados.versao ? `${dados.versao}.` : ""}${e.email}`;
    if (await prisma.auditLog.findFirst({ where: { action: marca }, select: { id: true } })) continue;
    const jaEstava = lista.includes(e.email);
    if (!jaEstava) {
      lista.push(e.email);
      adicionados.push(e.email);
    }
    await prisma.auditLog.create({ data: { action: marca, entityType: "Configuracao", entityId: CHAVE, metadata: JSON.stringify({ nome: e.nome, jaEstava }) } });
  }
  // enderecos errados que entraram na lista (o e-mail da Monica no Outlook e' monica.oliveira@; "olivera", sem o i, e' erro de cadastro): tira, uma vez, para o pedido nao ir a um endereco que nao e' dela
  const removidos: string[] = [];
  for (const e of dados.remover ?? []) {
    const marca = `seed.contestacoes-email.remover.${dados.versao ? `${dados.versao}.` : ""}${e}`;
    if (await prisma.auditLog.findFirst({ where: { action: marca }, select: { id: true } })) continue;
    const k = lista.indexOf(e);
    if (k >= 0) {
      lista.splice(k, 1);
      removidos.push(e);
    }
    await prisma.auditLog.create({ data: { action: marca, entityType: "Configuracao", entityId: CHAVE, metadata: JSON.stringify({ estava: k >= 0 }) } });
  }
  if (adicionados.length || removidos.length) await prisma.configuracao.upsert({ where: { chave: CHAVE }, update: { valor: lista.join(", ") }, create: { chave: CHAVE, valor: lista.join(", ") } });
  console.log(`Contestação por e-mail: quem recebe = ${lista.join(", ") || "(ninguém configurado; vão os administradores)"}${adicionados.length ? ` (acrescentado: ${adicionados.join(", ")})` : ""}${removidos.length ? ` (retirado o endereço errado: ${removidos.join(", ")})` : ""}.`);

  const marcaTeste = "seed.contestacoes-email.teste";
  if (await prisma.auditLog.findFirst({ where: { action: marcaTeste }, select: { id: true } })) return console.log("Contestação por e-mail: teste de envio já feito antes e deu certo.");
  if ((await prisma.auditLog.count({ where: { action: `${marcaTeste}-falhou` } })) >= 3) return console.log("Contestação por e-mail: o teste de envio já falhou 3 vezes; não tento mais no início (ver o servidor de e-mail).");
  const r = await enviarTeste();
  await prisma.auditLog.create({ data: { action: r.ok ? marcaTeste : `${marcaTeste}-falhou`, entityType: "Configuracao", entityId: CHAVE, metadata: JSON.stringify({ para: dados.testePara.email, detalhe: r.detalhe }) } });
  console.log(r.ok ? `Contestação por e-mail: e-mail de TESTE enviado para ${dados.testePara.email} (${r.detalhe}).` : `Contestação por e-mail: o e-mail de TESTE NÃO saiu: ${r.detalhe}.`);
}

main()
  .catch((e) => {
    console.error("Falha na verificação do e-mail de contestação:", e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
    process.exit(process.exitCode ?? 0);
  });
