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

async function log(action: string, metadata: Record<string, unknown>) {
  try {
    await prisma.auditLog.create({ data: { action, entityType: "SeedSeniorTeams", metadata: JSON.stringify(metadata) } });
  } catch {
    // nunca deixa o log quebrar o seed
  }
}

async function main() {
  await log("seed.senior.iniciado", { cwd: process.cwd(), dirname: __dirname });

  const caminhosPossiveis = [
    path.join(__dirname, "data", "roster_ccu_senior.json"),
    path.join(process.cwd(), "prisma", "data", "roster_ccu_senior.json"),
  ];
  const caminho = caminhosPossiveis.find((p) => fs.existsSync(p));
  if (!caminho) {
    await log("seed.senior.erro", { motivo: "arquivo de dados nao encontrado", tentativas: caminhosPossiveis });
    throw new Error(`roster_ccu_senior.json nao encontrado em: ${caminhosPossiveis.join(", ")}`);
  }
  await log("seed.senior.arquivo_encontrado", { caminho });

  const dados: Record<string, CcuInfo> = JSON.parse(fs.readFileSync(caminho, "utf-8"));
  await log("seed.senior.dados_carregados", { totalCcus: Object.keys(dados).length });

  const senhaHash = await bcrypt.hash(SENHA_TEMPORARIA, 10);

  let equipesCriadas = 0;
  let usuariosCriados = 0;
  let usuariosExistentes = 0;
  let vinculosCriados = 0;

  let ccuIndex = 0;
  const totalCcus = Object.keys(dados).length;
  for (const [codccu, info] of Object.entries(dados)) {
    ccuIndex++;
    if (!info.nome) continue;
    await log("seed.senior.progresso", { ccuIndex, totalCcus, codccu, nome: info.nome, pessoas: info.pessoas.length });

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

  const resumo = { equipesCriadas, usuariosCriados, usuariosExistentes, vinculosCriados };
  console.log(`Seed Senior concluido: ${JSON.stringify(resumo)}`);
  await log("seed.senior.concluido", resumo);
}

main()
  .catch(async (e) => {
    console.error(e);
    await log("seed.senior.erro_fatal", { mensagem: String(e?.message || e), stack: String(e?.stack || "") });
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
