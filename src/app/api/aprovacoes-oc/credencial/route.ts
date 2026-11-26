import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { negarSemModulo } from "@/lib/acesso/servidor";
import { cifrar } from "@/lib/segredo";
import { logAudit } from "@/lib/auditLog";

// Login/senha do ERP da PROPRIA pessoa logada (ninguem cadastra a de outro, nem o ADMIN). A senha so' entra aqui: nao volta
// em nenhuma resposta nem vai para log/auditoria.
const MODULOS = ["aprovacoes_oc", "aprovacoes_oc_todas"] as const;

async function sessao() {
  const s = await getServerSession(authOptions);
  return s ? (s.user as { id: string; role: string }) : null;
}

export async function GET() {
  const u = await sessao();
  if (!u) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const negado = await negarSemModulo(u, ...MODULOS);
  if (negado) return negado;
  const d = await prisma.user.findUnique({ where: { id: u.id }, select: { erpUsuario: true, erpSenhaCifrada: true } });
  return NextResponse.json({ usuario: d?.erpUsuario ?? "", temSenha: !!d?.erpSenhaCifrada });
}

const corpo = z.object({ usuario: z.string().trim().min(1).max(60), senha: z.string().min(1).max(200).optional() });

export async function PUT(req: Request) {
  const u = await sessao();
  if (!u) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const negado = await negarSemModulo(u, ...MODULOS);
  if (negado) return negado;
  const p = corpo.safeParse(await req.json().catch(() => null));
  if (!p.success) return NextResponse.json({ error: "Informe o usuário do ERP." }, { status: 400 });

  const atual = await prisma.user.findUnique({ where: { id: u.id }, select: { erpSenhaCifrada: true } });
  if (!p.data.senha && !atual?.erpSenhaCifrada) return NextResponse.json({ error: "Informe a senha do ERP." }, { status: 400 });
  let senhaCifrada: string | undefined;
  try {
    if (p.data.senha) senhaCifrada = cifrar(p.data.senha);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
  await prisma.user.update({ where: { id: u.id }, data: { erpUsuario: p.data.usuario, ...(senhaCifrada ? { erpSenhaCifrada: senhaCifrada } : {}) } });
  await logAudit({ userId: u.id, action: "ERP_CREDENCIAL_SALVA", entityType: "User", entityId: u.id, metadata: { usuario: p.data.usuario, trocouSenha: !!senhaCifrada } });
  return NextResponse.json({ ok: true });
}

export async function DELETE() {
  const u = await sessao();
  if (!u) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  await prisma.user.update({ where: { id: u.id }, data: { erpUsuario: null, erpSenhaCifrada: null } });
  await logAudit({ userId: u.id, action: "ERP_CREDENCIAL_REMOVIDA", entityType: "User", entityId: u.id });
  return NextResponse.json({ ok: true });
}
