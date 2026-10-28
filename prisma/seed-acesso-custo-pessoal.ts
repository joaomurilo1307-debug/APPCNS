// Acesso ao modulo EXCLUSIVO "custo_pessoal" (folha, encargos e provisoes dos CLT por centro de custo). Decisao do Joao (28/10/2026): por enquanto SO' ELE e a
// conta administrativa que ele usa (os outros ADMIN nao entram: o modulo exige liberacao gravada ate para ADMIN). Nivel VER (a tela so' consulta).
//   contas  : e-mail exato de uma conta de uso do Joao (ex.: o usuario administrativo); recebe a liberacao uma vez (marca "seed.acesso-custo-pessoal.conta.<email>")
//   pessoas : recebe a liberacao (uma vez por pessoa, marca "seed.acesso-custo-pessoal.<chapa>" na auditoria)
//   revogar : retira a liberacao que o primeiro seed deu a Carolina, Andre, Elaine, Virginia e Kathleen (uma vez por pessoa, marca ".revogar.<chapa>")
// Quem nao for encontrada tenta de novo no proximo boot. So' mexe na linha de acesso desse modulo. Mais gente: pelo painel Usuarios > Acesso.
import { PrismaClient } from "@prisma/client";
import fs from "fs";
import path from "path";
import { acharPorEmail, acharUsuario } from "./achar-usuario";

const prisma = new PrismaClient();
const QUEM = "seed 28/10/2026";
const dados = JSON.parse(fs.readFileSync(path.join(process.cwd(), "prisma", "data", "acesso_custo_pessoal.json"), "utf-8")) as { modulo: string; nivel: "VER" | "EDITAR"; contas: { email: string; nome: string; motivo: string }[]; pessoas: { chapa: string; nome: string; motivo: string }[]; revogar: { chapa: string; nome: string }[] };

async function main() {
  const usuarios = await prisma.user.findMany({ select: { id: true, name: true } });
  const liberados: string[] = [];
  const naoAchados: string[] = [];
  for (const p of dados.pessoas) {
    const marca = `seed.acesso-custo-pessoal.${p.chapa}`;
    if (await prisma.auditLog.findFirst({ where: { action: marca }, select: { id: true } })) continue;
    const achado = await acharUsuario(prisma, p.chapa, p.nome, usuarios);
    if (!achado) {
      naoAchados.push(`${p.chapa} ${p.nome}`);
      continue;
    }
    await prisma.acessoModulo.upsert({
      where: { userId_modulo: { userId: achado.id, modulo: dados.modulo } },
      create: { userId: achado.id, modulo: dados.modulo, permitido: true, nivel: dados.nivel, concedidoPor: QUEM },
      update: { permitido: true, nivel: dados.nivel, concedidoPor: QUEM },
    });
    await prisma.auditLog.create({ data: { userId: achado.id, action: marca, entityType: "AcessoModulo", metadata: JSON.stringify({ modulo: dados.modulo, nivel: dados.nivel, motivo: p.motivo, via: achado.via }) } });
    liberados.push(`${p.chapa} ${p.nome} (via ${achado.via})`);
  }
  for (const c of dados.contas) {
    const marca = `seed.acesso-custo-pessoal.conta.${c.email}`;
    if (await prisma.auditLog.findFirst({ where: { action: marca }, select: { id: true } })) continue;
    const achado = await acharPorEmail(prisma, c.email);
    if (!achado) {
      naoAchados.push(`${c.email} (${c.nome})`);
      continue;
    }
    await prisma.acessoModulo.upsert({
      where: { userId_modulo: { userId: achado.id, modulo: dados.modulo } },
      create: { userId: achado.id, modulo: dados.modulo, permitido: true, nivel: dados.nivel, concedidoPor: QUEM },
      update: { permitido: true, nivel: dados.nivel, concedidoPor: QUEM },
    });
    await prisma.auditLog.create({ data: { userId: achado.id, action: marca, entityType: "AcessoModulo", metadata: JSON.stringify({ modulo: dados.modulo, nivel: dados.nivel, motivo: c.motivo, via: achado.via }) } });
    liberados.push(`${c.email} (${c.nome}, via ${achado.via})`);
  }
  const retirados: string[] = [];
  for (const p of dados.revogar) {
    const marca = `seed.acesso-custo-pessoal.revogar.${p.chapa}`;
    if (await prisma.auditLog.findFirst({ where: { action: marca }, select: { id: true } })) continue;
    const achado = await acharUsuario(prisma, p.chapa, p.nome, usuarios);
    if (!achado) {
      naoAchados.push(`${p.chapa} ${p.nome} (revogar)`);
      continue;
    }
    const apagadas = await prisma.acessoModulo.deleteMany({ where: { userId: achado.id, modulo: dados.modulo } });
    await prisma.auditLog.create({ data: { userId: achado.id, action: marca, entityType: "AcessoModulo", metadata: JSON.stringify({ modulo: dados.modulo, retiradas: apagadas.count, via: achado.via }) } });
    retirados.push(`${p.chapa} ${p.nome} (${apagadas.count} linha(s), via ${achado.via})`);
  }
  console.log(`Custo de pessoal: ${liberados.length} liberado(s)${liberados.length ? ": " + liberados.join("; ") : ""}.`);
  console.log(`Custo de pessoal: ${retirados.length} acesso(s) retirado(s)${retirados.length ? ": " + retirados.join("; ") : ""}.`);
  if (naoAchados.length) console.log(`Custo de pessoal: ${naoAchados.length} sem usuario no sistema (tenta de novo no proximo boot): ${naoAchados.join("; ")}.`);
}

main()
  .catch((e) => {
    console.error("Falha ao liberar o acesso ao custo de pessoal:", e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
