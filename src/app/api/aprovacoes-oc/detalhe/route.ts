import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { negarSemModulo } from "@/lib/acesso/servidor";
import { decifrar } from "@/lib/segredo";
import { listarPendentes } from "@/lib/senior/aprovarOc";
import { detalheAprovacao } from "@/lib/senior/detalheAprovacao";

// Niveis de aprovacao e vencimento de UMA OC, ao vivo na Senior. So' para OC que esta na lista de pendentes da propria pessoa
// (mesma trava do decidir): evita ler a alcada de OC alheia por numero.
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const s = await getServerSession(authOptions);
  if (!s) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const u = s.user as { id: string; role: string };
  const negado = await negarSemModulo(u, "aprovacoes_oc", "aprovacoes_oc_todas");
  if (negado) return negado;

  const q = new URL(req.url).searchParams;
  const numero = Number(q.get("numero"));
  const filial = Number(q.get("filial"));
  if (!Number.isSafeInteger(numero) || numero <= 0 || !Number.isSafeInteger(filial) || filial <= 0) return NextResponse.json({ error: "OC/filial inválida." }, { status: 400 });

  const d = await prisma.user.findUnique({ where: { id: u.id }, select: { erpUsuario: true, erpSenhaCifrada: true } });
  if (!d?.erpUsuario || !d.erpSenhaCifrada) return NextResponse.json({ error: "Cadastre seu usuário e senha do ERP primeiro." }, { status: 400 });
  try {
    const pendentes = await listarPendentes({ usuario: d.erpUsuario, senha: decifrar(d.erpSenhaCifrada) });
    if (!pendentes.some((o) => o.numero === numero && o.codigoFilial === filial)) return NextResponse.json({ error: "Esta OC não está pendente para você na Senior." }, { status: 404 });
    return NextResponse.json(await detalheAprovacao(numero, filial));
  } catch (e) {
    return NextResponse.json({ error: `Não foi possível ler o detalhe na Senior: ${(e as Error).message}` }, { status: 502 });
  }
}
