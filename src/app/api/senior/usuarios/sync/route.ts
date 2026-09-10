import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { chaveNome } from "@/lib/nomes";

// De-para dos usuarios do Senior: recebe [{codigo, nome}] (do export da
// tela Cadastros > Usuarios do Senior, enviado pelo script Python ou colado
// na tela /usuarios/senior) e faz upsert em UsuarioSenior. Tenta casar cada
// um com uma conta do consominas-gestao pelo nome normalizado (sem acento,
// upper). Protegido pela mesma SENIOR_SYNC_KEY das outras sincronizacoes.
//
// Depois disso, o proximo sync de aprovacoes ja resolve proximoAprovadorNome
// e proximoAprovadorUserId sozinho (a logica ja esta em .../aprovacoes/sync).

const schema = z.object({
  usuarios: z
    .array(
      z.object({
        codigo: z.string().min(1),
        nome: z.string().min(1),
      })
    )
    .max(2000),
});

export async function POST(req: Request) {
  const chave = req.headers.get("x-sync-key");
  if (!chave || chave !== process.env.SENIOR_SYNC_KEY) {
    return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Payload invalido", detalhes: parsed.error.flatten() }, { status: 422 });
  }

  // indice nome-normalizado -> userId (so conta ativa; se houver colisao de
  // nome, fica sem match automatico e o admin resolve na tela)
  const usuarios = await prisma.user.findMany({ where: { active: true }, select: { id: true, name: true } });
  const porNome = new Map<string, string | null>();
  for (const u of usuarios) {
    const k = chaveNome(u.name);
    if (!k) continue;
    porNome.set(k, porNome.has(k) ? null : u.id); // null = ambiguo
  }

  let upserts = 0;
  let casados = 0;
  for (const item of parsed.data.usuarios) {
    const existente = await prisma.usuarioSenior.findUnique({ where: { codigo: item.codigo } });
    // nao sobrescreve um userId ajustado manualmente na tela
    let userId = existente?.userId ?? null;
    if (!userId) {
      const m = porNome.get(chaveNome(item.nome));
      if (m) {
        userId = m;
        casados++;
      }
    }
    await prisma.usuarioSenior.upsert({
      where: { codigo: item.codigo },
      update: { nome: item.nome, userId },
      create: { codigo: item.codigo, nome: item.nome, userId },
    });
    upserts++;
  }

  return NextResponse.json({ ok: true, recebidos: parsed.data.usuarios.length, upserts, casadosAutomaticamente: casados });
}
