import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const adminEmail = process.env.SEED_ADMIN_EMAIL || "admin@consominas.com.br";
  const adminPassword = process.env.SEED_ADMIN_PASSWORD || "TrocarSenha123!";

  const passwordHash = await bcrypt.hash(adminPassword, 10);

  const admin = await prisma.user.upsert({
    where: { email: adminEmail },
    update: { role: "ADMIN", active: true },
    create: {
      name: "Administrador",
      email: adminEmail,
      passwordHash,
      role: "ADMIN",
    },
  });

  const nucleo = await prisma.team.upsert({
    where: { name: "Núcleo de Inovação" },
    update: {},
    create: { name: "Núcleo de Inovação", description: "Equipe padrão inicial" },
  });

  await prisma.userTeam.upsert({
    where: { userId_teamId: { userId: admin.id, teamId: nucleo.id } },
    update: {},
    create: { userId: admin.id, teamId: nucleo.id, role: "GESTOR" },
  });

  console.log(`Seed concluído. Login: ${adminEmail} / senha: ${adminPassword}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
