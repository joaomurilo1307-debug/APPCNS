import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { pagamentoDaOc } from "@/lib/senior/pagamentoDaOc";

// Tipo de pagamento da OC (cartao, PIX, boleto...) lido ao vivo da Senior.
// Rota separada de /api/senior/aprovacoes/[numOcp] pra o resumo da OC abrir na
// hora e este dado entrar quando a Senior responder (a consulta ao vivo pode
// demorar alguns segundos).
export async function GET(_req: Request, { params }: { params: { numOcp: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const user = session.user as any;
  let podeVer = ["ADMIN", "DIRETOR", "GESTOR_PROJETO", "APROVADOR"].includes(user.role);
  if (!podeVer) {
    const perfil = await prisma.user.findUnique({ where: { id: user.id }, select: { nivelHierarquico: true } });
    podeVer = !!perfil?.nivelHierarquico && ["DIRETORIA", "GERENCIA", "COORDENACAO"].includes(perfil.nivelHierarquico);
  }
  if (!podeVer) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

  const oc = await prisma.aprovacaoSenior.findUnique({ where: { numOcp: params.numOcp }, select: { codFil: true } });
  if (!oc) return NextResponse.json({ error: "OC não encontrada na base sincronizada" }, { status: 404 });

  try {
    return NextResponse.json(await pagamentoDaOc(params.numOcp, oc.codFil));
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message ?? e).replace(/<[^>]+>/g, " ").slice(0, 200) }, { status: 502 });
  }
}
