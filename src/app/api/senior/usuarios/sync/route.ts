import { NextResponse } from "next/server";
import { processarUsuarios, usuariosSchema } from "@/lib/senior/sincronizacao/usuarios";

// De-para dos usuarios do Senior. Recebe [{codigo, nome, email?, login?}] -- do E099USU (script do VPS) ou colado na tela
// /usuarios/senior -- protegido pela SENIOR_SYNC_KEY. A busca de OCs feita pelo proprio sistema (12/11/2026) roda a mesma
// gravacao (src/lib/senior/sincronizacao/usuarios.ts) antes de gravar as OCs.

export async function POST(req: Request) {
  const chave = req.headers.get("x-sync-key");
  if (!chave || chave !== process.env.SENIOR_SYNC_KEY) {
    return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const parsed = usuariosSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Payload invalido", detalhes: parsed.error.flatten() }, { status: 422 });
  }

  return NextResponse.json({ ok: true, ...(await processarUsuarios(parsed.data.usuarios)) });
}
