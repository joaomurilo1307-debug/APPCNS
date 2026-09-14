import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// Busca UMA OC por numOcp, com o mapa completo (rateio, níveis, eventos).
// Existe pra abrir o descritivo da OC a partir de outra tela (ex: coluna
// "OC" da Programação de Pagamento) sem depender da lista de /api/senior/
// /aprovacoes, que só traz pendentes + últimas 50 resolvidas -- a maioria
// das OCs vinculadas a título (histórico 2024/2025) não estaria lá.
export async function GET(req: Request, { params }: { params: { numOcp: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const user = session.user as any;
  let podeVer = ["ADMIN", "DIRETOR", "GESTOR_PROJETO", "APROVADOR"].includes(user.role);
  if (!podeVer) {
    const perfil = await prisma.user.findUnique({ where: { id: user.id }, select: { nivelHierarquico: true } });
    podeVer = !!perfil?.nivelHierarquico && ["DIRETORIA", "GERENCIA", "COORDENACAO"].includes(perfil.nivelHierarquico);
  }
  if (!podeVer) {
    return NextResponse.json({ error: "Sem permissão para ver aprovações do Senior" }, { status: 403 });
  }

  const aprovacao = await prisma.aprovacaoSenior.findUnique({
    where: { numOcp: params.numOcp },
    include: {
      eventos: { orderBy: { detectadoEm: "asc" } },
      proximoAprovador: { select: { id: true, name: true } },
    },
  });
  if (!aprovacao) return NextResponse.json({ error: "OC não encontrada na base sincronizada" }, { status: 404 });

  const usuariosSenior = await prisma.usuarioSenior.findMany({
    include: { user: { select: { name: true } } },
  });
  const codToNome: Record<string, string> = {};
  for (const u of usuariosSenior) codToNome[u.codigo] = u.user?.name || u.nome;

  return NextResponse.json({ aprovacao, codToNome });
}
