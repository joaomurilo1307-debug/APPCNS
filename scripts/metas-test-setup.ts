import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const url = new URL(process.env.DATABASE_URL ?? "");
if (url.hostname !== "127.0.0.1" || url.port !== "55439" || url.pathname !== "/consominas_metas_homologacao" || process.env.APP_ENV !== "homologacao") {
  throw new Error("Este preparo só funciona na base isolada de testes de Metas.");
}
if (!process.env.HOMOLOGACAO_LOGIN || !process.env.HOMOLOGACAO_PASSWORD) throw new Error("Faltam credenciais locais fictícias.");
const db = new PrismaClient();
async function main() {
  await db.user.upsert({
    where: { email: process.env.HOMOLOGACAO_LOGIN! },
    update: {},
    create: { email: process.env.HOMOLOGACAO_LOGIN!, name: "Administrador de teste de Metas", role: "ADMIN", passwordHash: await bcrypt.hash(process.env.HOMOLOGACAO_PASSWORD!, 10) },
  });
  console.log("Administrador fictício preparado na base isolada de Metas.");
}
main().finally(() => db.$disconnect());
