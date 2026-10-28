// Contestacao de custo por e-mail (28/10/2026): garante o endereco da Monica na lista de quem recebe o pedido (uma vez por endereco, sem tirar ninguem e sem desfazer o que o
// financeiro editou depois) e envia UM e-mail de teste so' para o Joao, para provar que o servidor de e-mail do sistema funciona. O resultado vai para o log de inicializacao.
// Marcas na auditoria: "seed.contestacoes-email.add.<email>", "seed.contestacoes-email.teste" (o teste FUNCIONOU) e "...teste-falhou" (cada tentativa que falhou; para depois de 3, para nao
// atrasar a inicializacao do sistema). Cada tentativa espera no maximo 20 s.
import { PrismaClient } from "@prisma/client";
import fs from "fs";
import path from "path";
import { lerListaDeEmails } from "../src/lib/contestacoes";
import { sendNotificationEmail } from "../src/lib/mailer";

const prisma = new PrismaClient();
const CHAVE = "contestacoes.emails";
const dados = JSON.parse(fs.readFileSync(path.join(process.cwd(), "prisma", "data", "contestacoes_inicial.json"), "utf-8")) as { emails: { email: string; nome: string }[]; testePara: { email: string; nome: string } };

async function main() {
  const atual = lerListaDeEmails((await prisma.configuracao.findUnique({ where: { chave: CHAVE }, select: { valor: true } }))?.valor).validos;
  const lista = [...atual];
  const adicionados: string[] = [];
  for (const e of dados.emails) {
    const marca = `seed.contestacoes-email.add.${e.email}`;
    if (await prisma.auditLog.findFirst({ where: { action: marca }, select: { id: true } })) continue;
    if (!lista.includes(e.email)) {
      lista.push(e.email);
      adicionados.push(e.email);
    }
    await prisma.auditLog.create({ data: { action: marca, entityType: "Configuracao", entityId: CHAVE, metadata: JSON.stringify({ nome: e.nome, jaEstava: !adicionados.includes(e.email) }) } });
  }
  if (adicionados.length) await prisma.configuracao.upsert({ where: { chave: CHAVE }, update: { valor: lista.join(", ") }, create: { chave: CHAVE, valor: lista.join(", ") } });
  console.log(`Contestação por e-mail: quem recebe agora = ${lista.join(", ") || "(ninguém configurado; vão os administradores)"}${adicionados.length ? ` (acrescentado: ${adicionados.join(", ")})` : ""}.`);

  const marcaTeste = "seed.contestacoes-email.teste";
  if (await prisma.auditLog.findFirst({ where: { action: marcaTeste }, select: { id: true } })) return;
  if ((await prisma.auditLog.count({ where: { action: `${marcaTeste}-falhou` } })) >= 3) return console.log("Contestação por e-mail: o teste de envio já falhou 3 vezes; não tento mais no início (ver o servidor de e-mail).");
  const limite = new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 20_000));
  const enviou = await Promise.race([
    sendNotificationEmail({
      to: [{ email: dados.testePara.email, name: dados.testePara.nome }],
      subject: "TESTE do envio de contestação de custo (só para o João)",
      text: "Este é um teste do envio de e-mail do sistema, o mesmo caminho do e-mail de contestação de custo para a Mônica. Se você recebeu, o servidor de e-mail está funcionando. Nenhuma ação é necessária.",
    }),
    limite,
  ]);
  await prisma.auditLog.create({ data: { action: enviou ? marcaTeste : `${marcaTeste}-falhou`, entityType: "Configuracao", entityId: CHAVE, metadata: JSON.stringify({ para: dados.testePara.email }) } });
  console.log(enviou ? `Contestação por e-mail: e-mail de TESTE enviado para ${dados.testePara.email} (servidor de e-mail OK).` : "Contestação por e-mail: o e-mail de TESTE NÃO saiu (o servidor de e-mail recusou, não respondeu ou não está configurado); tenta de novo no próximo início.");
}

main()
  .catch((e) => {
    console.error("Falha na verificação do e-mail de contestação:", e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
    process.exit(process.exitCode ?? 0); // nao espera a conexao de e-mail pendurada (timeout) para encerrar
  });
