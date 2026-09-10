// Normaliza a caixa (maiuscula/minuscula) de TODOS os nomes de usuario pro
// mesmo padrao -- o Senior guarda nome em CAIXA ALTA pra algumas pessoas e
// nao pra outras, o que deixou a lista de equipes inconsistente. Idempotente
// (pode rodar quantas vezes quiser, sempre chega no mesmo resultado).
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const CONECTIVOS = new Set(["de", "da", "do", "das", "dos", "e"]);

function normalizarNome(nome: string): string {
  return nome
    .toLowerCase()
    .split(" ")
    .filter((p) => p.length > 0)
    .map((palavra, i) => {
      if (i > 0 && CONECTIVOS.has(palavra)) return palavra;
      // preserva apostrofos/hifens internos (ex: D'Ávila, Silva-Costa)
      return palavra
        .split("-")
        .map((parte) => parte.charAt(0).toUpperCase() + parte.slice(1))
        .join("-");
    })
    .join(" ");
}

async function log(action: string, metadata: Record<string, unknown>) {
  try {
    await prisma.auditLog.create({ data: { action, entityType: "FixNomesCaixa", metadata: JSON.stringify(metadata) } });
  } catch {
    // nunca deixa o log quebrar o fix
  }
}

async function main() {
  await log("fix.nomes.iniciado", {});

  const users = await prisma.user.findMany({ select: { id: true, name: true } });
  let alterados = 0;
  const exemplos: { antes: string; depois: string }[] = [];

  for (const user of users) {
    const novoNome = normalizarNome(user.name);
    if (novoNome !== user.name) {
      await prisma.user.update({ where: { id: user.id }, data: { name: novoNome } });
      alterados++;
      if (exemplos.length < 15) exemplos.push({ antes: user.name, depois: novoNome });
    }
  }

  const resumo = { totalUsuarios: users.length, alterados, exemplos };
  console.log(`Fix de nomes concluido: ${JSON.stringify(resumo)}`);
  await log("fix.nomes.concluido", resumo);
}

main()
  .catch(async (e) => {
    console.error(e);
    await log("fix.nomes.erro_fatal", { mensagem: String(e?.message || e), stack: String(e?.stack || "") });
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
