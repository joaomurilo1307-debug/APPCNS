import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { vinculosSuspeitos } from "@/lib/senior/vinculosUsuario";
import { logAudit } from "@/lib/auditLog";

// Vinculos usuario Senior -> conta que nao batem com o nome (ver lib/senior/vinculosUsuario.ts). So' ADMIN.
// GET lista (nao grava nada). POST {codigos} corrige SO' os codigos pedidos que ainda forem suspeitos: a proposta e' recalculada
// no servidor (nunca vem do navegador) -- troca para a conta de nome exato igual ou desvincula.
async function admin() {
  const s = await getServerSession(authOptions);
  if (!s) return { erro: NextResponse.json({ error: "Não autenticado" }, { status: 401 }), id: "" };
  if ((s.user as any).role !== "ADMIN") return { erro: NextResponse.json({ error: "Só ADMIN" }, { status: 403 }), id: "" };
  return { erro: null, id: (s.user as any).id as string };
}

async function calcular() {
  const [linhas, contas] = await Promise.all([
    prisma.usuarioSenior.findMany({ include: { user: { select: { id: true, name: true, email: true } } } }),
    prisma.user.findMany({ where: { active: true }, select: { id: true, name: true } }),
  ]);
  return vinculosSuspeitos(linhas, contas);
}

export async function GET() {
  const { erro } = await admin();
  if (erro) return erro;
  return NextResponse.json({ suspeitos: await calcular() });
}

export async function POST(req: Request) {
  const { erro, id } = await admin();
  if (erro) return erro;
  const p = z.object({ codigos: z.array(z.string().min(1)).min(1).max(500) }).safeParse(await req.json().catch(() => null));
  if (!p.success) return NextResponse.json({ error: "Envie { codigos: [...] }" }, { status: 422 });

  const pedidos = new Set(p.data.codigos);
  const alvo = (await calcular()).filter((s) => pedidos.has(s.codigo));
  for (const s of alvo) {
    await prisma.usuarioSenior.update({ where: { codigo: s.codigo }, data: { userId: s.proposta?.id ?? null } });
    // reflete nas OCs pendentes que esperam esse codigo
    await prisma.aprovacaoSenior.updateMany({
      where: { proximoAprovadorCod: s.codigo, situacaoAtual: { in: ["ANA", "PRE"] } },
      data: { proximoAprovadorUserId: s.proposta?.id ?? null, proximoAprovadorNome: s.proposta?.name ?? s.nomeSenior },
    });
  }
  await logAudit({
    userId: id,
    action: "VINCULO_USUARIO_SENIOR_CORRIGIDO",
    entityType: "UsuarioSenior",
    metadata: { corrigidos: alvo.map((s) => ({ codigo: s.codigo, de: s.contaAtual.name, para: s.proposta?.name ?? null })) },
  });
  return NextResponse.json({ ok: true, corrigidos: alvo.length });
}
