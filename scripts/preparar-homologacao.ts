import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { contaTeste, dataTeste, boletoTeste } from "./homologacao/fixtures";

const DB = "consominas_gestao_itau_homologacao";
async function main() {
  const origem = new URL(process.env.DATABASE_URL ?? "");
  if (!["localhost", "127.0.0.1"].includes(origem.hostname) || origem.pathname !== "/consominas_gestao_dev") {
    throw new Error("Preparacao permitida somente a partir do banco local consominas_gestao_dev.");
  }
  const admin = new PrismaClient();
  try {
    const existentes = await admin.$queryRaw<{ datname: string }[]>`SELECT datname FROM pg_database WHERE datname = ${DB}`;
    if (!existentes.length) await admin.$executeRawUnsafe(`CREATE DATABASE "${DB}"`);
  } finally { await admin.$disconnect(); }
  origem.pathname = `/${DB}`;
  const envPath = ".env.homologacao";
  const antigo = existsSync(envPath) ? Object.fromEntries(readFileSync(envPath, "utf8").split(/\r?\n/).filter(l => l.includes("=")).map(l => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)])) : {};
  const ambiente: Record<string, string> = {
    DATABASE_URL: origem.toString(), NEXTAUTH_URL: "http://localhost:3001", NEXTAUTH_SECRET: antigo.NEXTAUTH_SECRET || randomBytes(32).toString("hex"),
    UPLOAD_DIR: "uploads-homologacao", APP_ENV: "homologacao", NEXT_PUBLIC_APP_ENV: "homologacao",
    SENIOR_WS_SAPIENS_URL: "http://127.0.0.1:3099/leitura", SENIOR_WS_BAIXA_URL: "http://127.0.0.1:3099/baixa",
    SENIOR_WS_SAPIENS_USER: "homologacao-ficticia", SENIOR_WS_SAPIENS_PASSWORD: "credencial-ficticia-sem-acesso-real",
    SENIOR_SYNC_KEY: antigo.SENIOR_SYNC_KEY || randomBytes(32).toString("hex"),
    HOMOLOGACAO_LOGIN: "homologacao@consominas.local", HOMOLOGACAO_PASSWORD: antigo.HOMOLOGACAO_PASSWORD || randomBytes(18).toString("base64url"),
  };
  writeFileSync(envPath, Object.entries(ambiente).map(([k, v]) => `${k}=${v}`).join("\n") + "\n", "utf8");
  const cli = spawnSync(process.execPath, ["node_modules/prisma/build/index.js", "db", "push", "--skip-generate"], { env: { ...process.env, DATABASE_URL: ambiente.DATABASE_URL }, stdio: "inherit" });
  if (cli.status !== 0) throw new Error("Falha ao preparar schema da base de testes.");
  const db = new PrismaClient({ datasources: { db: { url: ambiente.DATABASE_URL } } });
  try {
    await db.user.upsert({ where: { email: ambiente.HOMOLOGACAO_LOGIN }, update: {}, create: {
      email: ambiente.HOMOLOGACAO_LOGIN, name: "ADMIN HOMOLOGACAO", role: "ADMIN", passwordHash: await bcrypt.hash(ambiente.HOMOLOGACAO_PASSWORD, 10),
    } });
    await db.contaBancaria.upsert({ where: { id: "homologacao-conta" }, update: {}, create: {
      id: "homologacao-conta", apelido: contaTeste.nomeEmpresa, banco: "341", cnpj: contaTeste.cnpj,
      agencia: contaTeste.agencia, conta: contaTeste.conta, dac: contaTeste.dac, numCcoSenior: "TESTE",
    } });
    for (const [i, forma] of ["credito", "ted", "pix", "boleto"].entries()) {
      await db.tituloContasAPagar.upsert({ where: { id: `homologacao-titulo-${forma}` }, update: { documentoFavorecido: "52998224725" }, create: {
        id: `homologacao-titulo-${forma}`, numTit: `TESTE${i + 1}`, codFil: "1", codFor: "999999", tipo: "DUP", situacao: "AB", pago: false,
        dataEmissao: dataTeste, vencimentoProgramado: dataTeste, valorOriginal: 100, valorAberto: 100,
        fornecedorNome: "FORNECEDOR TESTE - NAO PAGAR", documentoFavorecido: "52998224725", revisadoStatus: "APROVADO",
        ...(forma === "boleto" ? { codigoBarrasBoleto: boletoTeste(), codFpg: "18" } : forma === "pix" ? { chavePix: "homologacao@example.invalid", tipoChavePix: "2", codFpg: "19" } : {
          bancoFavorecido: forma === "credito" ? "341" : "237", agenciaFavorecido: "9999", contaFavorecido: "99999", dacFavorecido: "1", codFpg: "3",
        }),
      } });
    }
    for (const [codigo, descricao] of [["3", "Deposito em Conta"], ["18", "Boleto"], ["19", "PIX"]]) {
      await db.formaPagamentoSenior.upsert({ where: { codigo }, update: {}, create: { codigo, descricao } });
    }
    console.log(`Base pronta: ${DB} em localhost. Login e senha locais em .env.homologacao. Nenhuma credencial real da Senior foi copiada.`);
  } finally { await db.$disconnect(); }
}
main().catch(e => { console.error(e.message); process.exitCode = 1; });
