// Cifra de segredos guardados no banco (senha do ERP de cada usuario, 17/11/2026).
// AES-256-GCM. A chave NAO precisa de configuracao nova: e' derivada (HKDF-SHA256, rotulo proprio) do NEXTAUTH_SECRET, que o
// container ja recebe. ERP_CRED_KEY (32 bytes em base64) continua valendo como chave separada, se existir.
// ATENCAO: trocar o NEXTAUTH_SECRET (ou a ERP_CRED_KEY) torna as senhas guardadas ilegiveis -- cada pessoa recadastra a sua.
// Formato guardado: "v1:<iv>:<tag>:<cifrado>" (base64).

import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";

function chave(): Buffer {
  const propria = Buffer.from(process.env.ERP_CRED_KEY ?? "", "base64");
  if (propria.length === 32) return propria;
  const base = process.env.NEXTAUTH_SECRET ?? "";
  if (base.length < 16) throw new Error("Segredo do servidor (NEXTAUTH_SECRET) ausente ou curto demais para cifrar a senha do ERP.");
  return Buffer.from(hkdfSync("sha256", base, "appcns-salt-v1", "erp-credencial-v1", 32));
}

export function cifrar(texto: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", chave(), iv);
  const cifrado = Buffer.concat([c.update(texto, "utf8"), c.final()]);
  return ["v1", iv.toString("base64"), c.getAuthTag().toString("base64"), cifrado.toString("base64")].join(":");
}

export function decifrar(guardado: string): string {
  const [versao, iv, tag, cifrado] = guardado.split(":");
  if (versao !== "v1" || !iv || !tag || !cifrado) throw new Error("Senha do ERP guardada em formato inválido. Cadastre-a de novo.");
  const d = createDecipheriv("aes-256-gcm", chave(), Buffer.from(iv, "base64"));
  d.setAuthTag(Buffer.from(tag, "base64"));
  try {
    return Buffer.concat([d.update(Buffer.from(cifrado, "base64")), d.final()]).toString("utf8");
  } catch {
    // chave mudou ou dado adulterado: pede novo cadastro em vez de mostrar erro interno de criptografia
    throw new Error("A senha do ERP guardada não pode ser lida (a chave do servidor mudou). Cadastre-a de novo em 'Meu acesso ao ERP'.");
  }
}
