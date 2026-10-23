import test from "node:test";
import assert from "node:assert/strict";

// nomeLivreDeEquipe nao toca o banco: recebe a funcao que diz se o nome ja existe. Importa o modulo sem carregar o Prisma real.
async function carregar() {
  process.env.DATABASE_URL ??= "postgresql://x:x@localhost:5432/x";
  return (await import("../src/lib/pessoas")).nomeLivreDeEquipe;
}

test("nome de equipe: usa o desejado quando esta livre e acrescenta (2), (3)... quando ja existe", async () => {
  const nomeLivreDeEquipe = await carregar();
  assert.equal(await nomeLivreDeEquipe("Projeto A · equipe", async () => false), "Projeto A · equipe");
  const usados = new Set(["Projeto A · equipe", "Projeto A · equipe (2)"]);
  assert.equal(await nomeLivreDeEquipe("Projeto A · equipe", async (n) => usados.has(n)), "Projeto A · equipe (3)");
});
