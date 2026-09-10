// Seed pontual: cria/atualiza 1 Team por Centro de Custo do Senior (Rito de
// Gestao) e o roster de pessoas atuais de cada um, como conta com "primeiro
// acesso" pendente -- login inicial = nome.sobrenome@consominas.com.br
// (placeholder gerado, nao necessariamente o email real da pessoa), senha
// temporaria compartilhada. No primeiro login, a tela /completar-cadastro
// obriga a pessoa a confirmar o email real e trocar a senha.
//
// Idempotente (upsert em tudo) -- seguro rodar mais de uma vez. Roda MANUAL,
// uma vez, via: docker exec <container> npx tsx prisma/seed-senior-teams.ts
// (nao entra no docker-entrypoint.sh -- nao deve rodar sozinho a cada deploy).
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import fs from "fs";
import path from "path";

const prisma = new PrismaClient();

const SENHA_TEMPORARIA = process.env.SEED_SENHA_TEMPORARIA || "Consominas@2026";

type Pessoa = { matricula: string; nome: string; email: string };
type CcuInfo = { nome: string; classificacao: string; pessoas: Pessoa[] };

async function main() {
  const caminho = path.join(__dirname, "data", "roster_ccu_senior.json");
  const dados: Record<string, CcuInfo> = JSON.parse(fs.readFileSync(caminho, "utf-8"));

  const senhaHash = await bcrypt.hash(SENHA_TEMPORARIA, 10);

  let equipesCriadas = 0;
  let usuariosCriados = 0;
  let usuariosExistentes = 0;
  let vinculosCriados = 0;

  for (const [codccu, info] of Object.entries(dados)) {
    if (!info.nome) continue;

    const nomeEquipe = `${info.nome} [${codccu}]`;
    const team = await prisma.team.upsert({
      where: { name: nomeEquipe },
      update: { description: info.classificacao === "contrato_cliente" ? "Contrato de cliente (Senior)" : "ADM / Overhead (Senior)" },
      create: {
        name: nomeEquipe,
        description: info.classificacao === "contrato_cliente" ? "Contrato de cliente (Senior)" : "ADM / Overhead (Senior)",
      },
    });
    equipesCriadas++;

    for (const pessoa of info.pessoas) {
      let user = await prisma.user.findUnique({ where: { matriculaSenior: pessoa.matricula } });

      if (!user) {
        // tambem confere por email, caso a matricula tenha mudado mas a
        // pessoa ja tenha sido importada antes com o mesmo nome
        const porEmail = await prisma.user.findUnique({ where: { email: pessoa.email } });
        if (porEmail) {
          user = await prisma.user.update({
            where: { id: porEmail.id },
            data: { matriculaSenior: pessoa.matricula },
          });
          usuariosExistentes++;
        } else {
          user = await prisma.user.create({
            data: {
              name: pessoa.nome,
              email: pessoa.email,
              passwordHash: senhaHash,
              role: "COLABORADOR",
              active: true,
              primeiroAcesso: true,
              origemCadastro: "SENIOR",
              matriculaSenior: pessoa.matricula,
            },
          });
          usuariosCriados++;
        }
      } else {
        usuariosExistentes++;
      }

      await prisma.userTeam.upsert({
        where: { userId_teamId: { userId: user.id, teamId: team.id } },
        update: {},
        create: { userId: user.id, teamId: team.id, role: "MEMBRO" },
      });
      vinculosCriados++;
    }
  }

  console.log(
    `Seed Senior concluido: ${equipesCriadas} equipes, ${usuariosCriados} usuarios novos, ` +
    `${usuariosExistentes} ja existentes (reaproveitados), ${vinculosCriados} vinculos equipe-usuario.`
  );
  console.log(`Senha temporaria de todos os novos: ${SENHA_TEMPORARIA} (troca obrigatoria no primeiro login).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
