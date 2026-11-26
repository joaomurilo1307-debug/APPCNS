import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { negarSemModulo } from "@/lib/acesso/servidor";
import { decifrar } from "@/lib/segredo";
import { listarPendentes } from "@/lib/senior/aprovarOc";

// OCs pendentes de aprovacao DO USUARIO LOGADO, ao vivo na Senior (buscarPendentes_4 com o login ERP dele; empresa 1, filiais 1 e 2).
export const dynamic = "force-dynamic";

export async function GET() {
  const s = await getServerSession(authOptions);
  if (!s) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const u = s.user as { id: string; role: string };
  const negado = await negarSemModulo(u, "aprovacoes_oc", "aprovacoes_oc_todas");
  if (negado) return negado;

  const d = await prisma.user.findUnique({ where: { id: u.id }, select: { erpUsuario: true, erpSenhaCifrada: true } });
  if (!d?.erpUsuario || !d.erpSenhaCifrada) return NextResponse.json({ semCredencial: true, ocs: [] });
  try {
    const ocs = await listarPendentes({ usuario: d.erpUsuario, senha: decifrar(d.erpSenhaCifrada) });
    return NextResponse.json({ semCredencial: false, ocs });
  } catch (e) {
    return NextResponse.json({ error: `Não foi possível ler as pendências na Senior: ${(e as Error).message}` }, { status: 502 });
  }
}
