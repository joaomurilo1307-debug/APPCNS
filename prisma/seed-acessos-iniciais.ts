// Acessos iniciais da liberacao do novo controle de acesso (22/10/2026), para ninguem do financeiro ficar sem acesso quando o financeiro
// passa a ser liberado por pessoa, e para a Denise, o Allan e o Vitor ja nascerem com o que o Joao pediu. Roda no boot, uma vez por pessoa
// (marca "seed.acessos-iniciais.<chapa>" na auditoria); quem nao for encontrada tenta de novo no proximo boot.
//   financeiro        -> libera as telas de pagamento (SISPAG, programacao, conferencia de OC, recorrentes, alertas, notas, todas as OCs)
//   visao_total       -> tudo, menos o financeiro de pagamento; ve todos os projetos e todos os contratos
//   membro_projetos   -> so' Projetos (e o basico de rotina); bloqueia as demais telas
// Nao altera papel, senha nem nada alem das linhas de acesso (e da visao de projetos / contratos da Denise).
import { PrismaClient } from "@prisma/client";
import fs from "fs";
import path from "path";
import { acharUsuario } from "./achar-usuario";

const prisma = new PrismaClient();
type Pessoa = { chapa: string; nome: string; perfil: string; escopoProjetos?: string; verTodosContratos?: boolean; bloquearOutros?: boolean; marca?: string };
const dados = JSON.parse(fs.readFileSync(path.join(process.cwd(), "prisma", "data", "acessos_iniciais.json"), "utf-8")) as {
  perfis: Record<string, string[]>;
  todosOsModulos: string[];
  pessoas: Pessoa[];
};
const QUEM = "seed 22/10/2026";

async function main() {
  const usuarios = await prisma.user.findMany({ select: { id: true, name: true } });
  const ligados: string[] = [];
  const naoAchados: string[] = [];

  for (const p of dados.pessoas) {
    const marca = `seed.acessos-iniciais.${p.chapa}${p.marca ? "." + p.marca : ""}`; // "marca" distingue uma segunda aplicacao na mesma pessoa
    if (await prisma.auditLog.findFirst({ where: { action: marca }, select: { id: true } })) continue;
    const achado = await acharUsuario(prisma, p.chapa, p.nome, usuarios);
    if (!achado) {
      naoAchados.push(`${p.chapa} ${p.nome} (${p.perfil})`);
      continue;
    }
    const liberar = dados.perfis[p.perfil] ?? [];
    const bloquear = p.bloquearOutros ? dados.todosOsModulos.filter((m) => !liberar.includes(m)) : [];

    await prisma.$transaction(async (tx) => {
      for (const modulo of liberar) {
        await tx.acessoModulo.upsert({
          where: { userId_modulo: { userId: achado.id, modulo } },
          create: { userId: achado.id, modulo, permitido: true, nivel: "EDITAR", concedidoPor: QUEM },
          update: { permitido: true, nivel: "EDITAR", concedidoPor: QUEM },
        });
      }
      for (const modulo of bloquear) {
        await tx.acessoModulo.upsert({
          where: { userId_modulo: { userId: achado.id, modulo } },
          create: { userId: achado.id, modulo, permitido: false, nivel: "EDITAR", concedidoPor: QUEM },
          update: { permitido: false, concedidoPor: QUEM },
        });
      }
      if (p.escopoProjetos || p.verTodosContratos !== undefined) {
        await tx.user.update({
          where: { id: achado.id },
          data: { ...(p.escopoProjetos ? { escopoProjetos: p.escopoProjetos } : {}), ...(p.verTodosContratos !== undefined ? { verTodosCustos: p.verTodosContratos } : {}) },
        });
      }
      await tx.auditLog.create({
        data: { action: marca, entityType: "User", entityId: achado.id, metadata: JSON.stringify({ chapa: p.chapa, perfil: p.perfil, via: achado.via, liberou: liberar.length, bloqueou: bloquear.length }) },
      });
    });
    ligados.push(`${p.chapa}/${p.perfil}/${achado.via}`);
  }
  console.log(`Acessos iniciais: ${ligados.length} aplicados (${ligados.join(", ") || "-"}); nao encontrados: ${naoAchados.length ? naoAchados.join(" | ") : "nenhum"}.`);
}

main()
  .catch((e) => {
    console.error("Falha nos acessos iniciais:", e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
