// Libera o modulo restrito "custo_pessoal" (folha, encargos e provisoes dos CLT por centro de custo) para quem o Joao nomeou em 28/10/2026:
// direcao (Carolina e Andre) e o pessoal do DP. Os administradores (papel ADMIN) entram sozinhos. Nivel VER (a tela so' consulta).
// Roda no boot, uma vez por pessoa (marca "seed.acesso-custo-pessoal.<chapa>" na auditoria); quem nao for encontrada tenta de novo no proximo boot.
// So' mexe na linha de acesso desse modulo: nao altera papel, senha nem nenhum outro acesso. Mais gente: pelo painel Usuarios > Acesso.
import { PrismaClient } from "@prisma/client";
import fs from "fs";
import path from "path";
import { acharUsuario } from "./achar-usuario";

const prisma = new PrismaClient();
const QUEM = "seed 28/10/2026";
const dados = JSON.parse(fs.readFileSync(path.join(process.cwd(), "prisma", "data", "acesso_custo_pessoal.json"), "utf-8")) as { modulo: string; nivel: "VER" | "EDITAR"; pessoas: { chapa: string; nome: string; motivo: string }[] };

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
  console.log(`Custo de pessoal: ${liberados.length} liberado(s)${liberados.length ? ": " + liberados.join("; ") : ""}.`);
  if (naoAchados.length) console.log(`Custo de pessoal: ${naoAchados.length} sem usuario no sistema (tenta de novo no proximo boot): ${naoAchados.join("; ")}.`);
}

main()
  .catch((e) => {
    console.error("Falha ao liberar o acesso ao custo de pessoal:", e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
