import { mkdir, writeFile } from "fs/promises";
import path from "path";
import crypto from "crypto";

export const UPLOAD_DIR = process.env.UPLOAD_DIR || "/app/uploads";
export const MAX_FILE_SIZE = 200 * 1024 * 1024; // 200MB — teto de segurança pro VPS (RAM/disco compartilhados), não literalmente "sem limite"
export const BLOCKED_EXTENSIONS = [".exe", ".bat", ".cmd", ".msi", ".sh", ".ps1", ".vbs", ".js", ".jar", ".com", ".scr"];

export function validateUploadFile(file: File): { ok: true } | { ok: false; status: number; error: string } {
  if (file.size > MAX_FILE_SIZE) {
    return { ok: false, status: 413, error: "Arquivo maior que 200MB" };
  }
  const ext = path.extname(file.name).toLowerCase();
  if (BLOCKED_EXTENSIONS.includes(ext)) {
    return { ok: false, status: 422, error: "Tipo de arquivo não permitido" };
  }
  return { ok: true };
}

/**
 * Grava o arquivo em disco sob UPLOAD_DIR/subDir/<nome seguro> e retorna o filePath
 * relativo (subDir/nomeSeguro) pra guardar no banco — nunca o caminho absoluto.
 */
export async function saveUploadedFile(file: File, subDir: string) {
  const buffer = Buffer.from(await file.arrayBuffer());
  const safeName = `${crypto.randomUUID()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
  const dir = path.join(UPLOAD_DIR, subDir);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, safeName), buffer);
  return { filePath: path.join(subDir, safeName), fileSize: buffer.length };
}
