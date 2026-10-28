// Contestacao de custo por e-mail (28/10/2026): garante o endereco da Monica na lista de quem recebe o pedido (uma vez por endereco, sem tirar ninguem e sem desfazer o que o
// financeiro editou depois) e envia UM e-mail de teste so' para o Joao, para provar que o servidor de e-mail do sistema funciona. O resultado (e, se falhar, o MOTIVO) vai para o log.
// Tambem garante (uma vez) o acesso de REVISORA das contestacoes na conta JULIMAR, o cadastro que a Monica usa para entrar: ela recebe o aviso e decide dentro do sistema (tela Aprovacoes).
// Independente do codigo do app (no contêiner so' existe a pasta prisma): usa so' @prisma/client e nodemailer.
// Marcas na auditoria: "seed.contestacoes-email.add.<email>", "seed.contestacoes-email.teste" (o teste FUNCIONOU) e "...teste-falhou" (cada tentativa que falhou; para depois de 3,
// para nao atrasar a inicializacao). Cada tentativa espera no maximo ~20 s.
import { PrismaClient } from "@prisma/client";
import nodemailer from "nodemailer";
import fs from "fs";
import path from "path";

const prisma = new PrismaClient();
const CHAVE = "contestacoes.emails";
const dados = JSON.parse(fs.readFileSync(path.join(process.cwd(), "prisma", "data", "contestacoes_inicial.json"), "utf-8")) as { emails: { email: string; nome: string }[]; testePara: { email: string; nome: string } };

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

async function garantirRevisora() {
  const marca = "seed.contestacoes-revisor.julimar";
  const achados = await prisma.user.findMany({ where: { active: true, name: { contains: "JULIMAR", mode: "insensitive" } }, select: { id: true, name: true, email: true } });
  if (achados.length !== 1) return console.log(`Contestação: conta JULIMAR (usada pela Mônica) não identificada com certeza (${achados.length} usuário(s) ativo(s) com esse nome); o acesso não foi alterado.`);
  const u = achados[0];
  if (!(await prisma.auditLog.findFirst({ where: { action: marca }, select: { id: true } }))) {
    await prisma.acessoModulo.upsert({
      where: { userId_modulo: { userId: u.id, modulo: "contestacoes_custo" } },
      create: { userId: u.id, modulo: "contestacoes_custo", permitido: true, nivel: "EDITAR", concedidoPor: "seed 28/10/2026" },
      update: { permitido: true, nivel: "EDITAR", concedidoPor: "seed 28/10/2026" },
    });
    await prisma.auditLog.create({ data: { userId: u.id, action: marca, entityType: "AcessoModulo", metadata: JSON.stringify({ modulo: "contestacoes_custo" }) } });
  }
  const tem = await prisma.acessoModulo.findUnique({ where: { userId_modulo: { userId: u.id, modulo: "contestacoes_custo" } }, select: { permitido: true } });
  console.log(`Contestação: revisora = conta "${u.name}" (${u.email}); acesso às contestações: ${tem?.permitido ? "LIBERADO" : "BLOQUEADO (alguém tirou; não mexo de novo)"}.`);
}

async function main() {
  await garantirRevisora();
  const lista = lerEmails((await prisma.configuracao.findUnique({ where: { chave: CHAVE }, select: { valor: true } }))?.valor);
  const adicionados: string[] = [];
  for (const e of dados.emails) {
    const marca = `seed.contestacoes-email.add.${e.email}`;
    if (await prisma.auditLog.findFirst({ where: { action: marca }, select: { id: true } })) continue;
    const jaEstava = lista.includes(e.email);
    if (!jaEstava) {
      lista.push(e.email);
      adicionados.push(e.email);
    }
    await prisma.auditLog.create({ data: { action: marca, entityType: "Configuracao", entityId: CHAVE, metadata: JSON.stringify({ nome: e.nome, jaEstava }) } });
  }
  if (adicionados.length) await prisma.configuracao.upsert({ where: { chave: CHAVE }, update: { valor: lista.join(", ") }, create: { chave: CHAVE, valor: lista.join(", ") } });
  console.log(`Contestação por e-mail: quem recebe = ${lista.join(", ") || "(ninguém configurado; vão os administradores)"}${adicionados.length ? ` (acrescentado: ${adicionados.join(", ")})` : ""}.`);

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
