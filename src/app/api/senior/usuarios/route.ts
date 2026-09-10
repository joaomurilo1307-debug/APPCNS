import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { chaveNome } from "@/lib/nomes";

// Tela admin do de-para de usuarios do Senior (codigo -> nome -> conta).
// GET: lista. POST: cola o texto do export do Senior ("codigo<algo>nome"
// por linha) e faz upsert + auto-match por nome. PATCH: corrige o match
// manualmente (codigo + userId, ou userId null pra desvincular).

async function exigeAdmin() {
  const session = await getServerSession(authOptions);
  if (!session) return { erro: NextResponse.json({ error: "Não autenticado" }, { status: 401 }) };
  if ((session.user as any).role !== "ADMIN")
    return { erro: NextResponse.json({ error: "Só ADMIN" }, { status: 403 }) };
  return { erro: null };
}

export async function GET() {
  const { erro } = await exigeAdmin();
  if (erro) return erro;

  const [linhas, usuarios] = await Promise.all([
    prisma.usuarioSenior.findMany({
      orderBy: { nome: "asc" },
      include: { user: { select: { id: true, name: true, email: true } } },
    }),
    prisma.user.findMany({ where: { active: true }, select: { id: true, name: true, email: true }, orderBy: { name: "asc" } }),
  ]);

  return NextResponse.json({ linhas, usuarios });
}

const pasteSchema = z.object({ texto: z.string().min(1).max(200_000) });

export async function POST(req: Request) {
  const { erro } = await exigeAdmin();
  if (erro) return erro;

  const parsed = pasteSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Envie { texto }" }, { status: 422 });

  // cada linha: primeiro token numerico = codigo, resto = nome. Aceita
  // separador por tab, ; , ou multiplos espacos.
  const itens: { codigo: string; nome: string }[] = [];
  for (const linhaRaw of parsed.data.texto.split(/\r?\n/)) {
    const linha = linhaRaw.trim();
    if (!linha) continue;
    const m = linha.match(/^(\d{1,6})\s*[\t;,|]?\s*(.+)$/);
    if (!m) continue;
    const nome = m[2].replace(/[\t;,|]+/g, " ").trim();
    if (nome.length < 2) continue;
    itens.push({ codigo: m[1], nome });
  }
  if (itens.length === 0) {
    return NextResponse.json({ error: "Nenhuma linha no formato 'codigo nome' foi reconhecida." }, { status: 422 });
  }

  const usuarios = await prisma.user.findMany({ where: { active: true }, select: { id: true, name: true } });
  const porNome = new Map<string, string | null>();
  for (const u of usuarios) {
    const k = chaveNome(u.name);
    if (!k) continue;
    porNome.set(k, porNome.has(k) ? null : u.id);
  }

  let casados = 0;
  for (const item of itens) {
    const existente = await prisma.usuarioSenior.findUnique({ where: { codigo: item.codigo } });
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
  }

  return NextResponse.json({ ok: true, reconhecidos: itens.length, casadosAutomaticamente: casados });
}

const patchSchema = z.object({ codigo: z.string().min(1), userId: z.string().nullable() });

export async function PATCH(req: Request) {
  const { erro } = await exigeAdmin();
  if (erro) return erro;

  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Envie { codigo, userId }" }, { status: 422 });

  await prisma.usuarioSenior.update({
    where: { codigo: parsed.data.codigo },
    data: { userId: parsed.data.userId },
  });

  // reflete na hora nas OCs pendentes desse codigo
  const u = parsed.data.userId
    ? await prisma.user.findUnique({ where: { id: parsed.data.userId }, select: { name: true } })
    : null;
  await prisma.aprovacaoSenior.updateMany({
    where: { proximoAprovadorCod: parsed.data.codigo },
    data: { proximoAprovadorUserId: parsed.data.userId, proximoAprovadorNome: u?.name ?? null },
  });

  return NextResponse.json({ ok: true });
}
