// Vincula ao login do Senior quem ja existe no sistema e ainda nao tem nenhum vinculo: o login do Senior e' a parte do e-mail antes do @
// (breno.lana@consominas.com.br -> "breno.lana"). Sem isso a pessoa nao ve nenhuma OC em Aprovacoes de OC. So' mexe em quem nao tem vinculo
// nenhum, so' quando ha exatamente um login igual, e escreve uma marca por pessoa na auditoria: se o admin desfizer o vinculo depois, o
// seed nao refaz. Quem nao achar login fica sem mudanca (o admin vincula pelo botao no painel de Acesso).
import { PrismaClient } from "@prisma/client";
import { acharSeniorPorEmail } from "./achar-senior";

const prisma = new PrismaClient();
const QUEM = "vinculo automatico por e-mail";

async function main() {
  const senior = await prisma.usuarioSenior.findMany({ select: { codigo: true, nome: true } });
  if (senior.length === 0) {
    console.log("Vinculos Senior por e-mail: nenhum usuario do Senior sincronizado ainda; nada a fazer.");
    return;
  }
  const pessoas = await prisma.user.findMany({
    where: { active: true, anonymizedAt: null },
    select: { id: true, email: true, _count: { select: { vinculosSenior: true } } },
  });
  const feitos = new Set((await prisma.auditLog.findMany({ where: { action: { startsWith: "seed.vinculo-senior-email." } }, select: { action: true } })).map((a) => a.action));
  const ligados: string[] = [];
  let semLogin = 0;
  for (const p of pessoas) {
    const marca = `seed.vinculo-senior-email.${p.id}`;
    if (p._count.vinculosSenior > 0 || feitos.has(marca)) continue;
    const achado = acharSeniorPorEmail(p.email, senior);
    if (!achado) {
      semLogin++;
      continue;
    }
    await prisma.$transaction(async (tx) => {
      await tx.vinculoSenior.upsert({
        where: { userId_codigo: { userId: p.id, codigo: achado.codigo } },
        create: { userId: p.id, codigo: achado.codigo, criadoPor: QUEM },
        update: {},
      });
      await tx.auditLog.create({ data: { action: marca, entityType: "User", entityId: p.id, metadata: JSON.stringify({ codigo: achado.codigo, login: achado.nome }) } });
    });
    ligados.push(`${p.email.split("@")[0]}->#${achado.codigo}`);
  }
  console.log(`Vinculos Senior por e-mail: ${ligados.length} vinculados (${ligados.join(", ") || "-"}); sem login igual ao e-mail: ${semLogin}.`);
}

main()
  .catch((e) => {
    console.error("Falha nos vinculos Senior por e-mail:", e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
