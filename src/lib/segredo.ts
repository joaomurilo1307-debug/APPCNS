// Cifra de segredos guardados no banco (senha do ERP de cada usuario, 17/11/2026).
// AES-256-GCM; a chave vem SO' de ERP_CRED_KEY (32 bytes em base64), nunca do codigo nem do banco.
//   gerar uma chave:  node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
// Formato guardado: "v1:<iv>:<tag>:<cifrado>" (base64). Perder a chave = todas as senhas precisam ser cadastradas de novo.

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

function chave(): Buffer {
  const k = Buffer.from(process.env.ERP_CRED_KEY ?? "", "base64");
  if (k.length !== 32) throw new Error("Defina ERP_CRED_KEY (32 bytes em base64) no .env do servidor.");
  return k;
}

export function cifrar(texto: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", chave(), iv);
  const cifrado = Buffer.concat([c.update(texto, "utf8"), c.final()]);
  return ["v1", iv.toString("base64"), c.getAuthTag().toString("base64"), cifrado.toString("base64")].join(":");
}

export function decifrar(guardado: string): string {
  const [versao, iv, tag, cifrado] = guardado.split(":");
  if (versao !== "v1" || !iv || !tag || !cifrado) throw new Error("Segredo guardado em formato inválido.");
  const d = createDecipheriv("aes-256-gcm", chave(), Buffer.from(iv, "base64"));
  d.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([d.update(Buffer.from(cifrado, "base64")), d.final()]).toString("utf8");
}
