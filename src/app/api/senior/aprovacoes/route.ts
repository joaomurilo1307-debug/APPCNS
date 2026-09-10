import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// Lista as Ordens de Compra do Senior (pendentes + resolvidas recentes) pro
// Relatorio de Aprovacoes. Visivel pra ADMIN/DIRETOR/GESTOR_PROJETO/APROVADOR
// ou quem tem nivelHierarquico de coordenacao pra cima -- mesma regra usada
// pra decidir quem recebe a notificacao de aprovacao pendente.
export async function GET() {
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

  const [pendentes, resolvidasRecentes, usuariosSenior] = await Promise.all([
    prisma.aprovacaoSenior.findMany({
      where: { situacaoAtual: { in: ["ANA", "PRE"] } },
      orderBy: { dataEmissao: "desc" },
      include: {
        eventos: { orderBy: { detectadoEm: "asc" } },
        proximoAprovador: { select: { id: true, name: true } },
      },
    }),
    prisma.aprovacaoSenior.findMany({
      where: { resolvidoEm: { not: null } },
      orderBy: { resolvidoEm: "desc" },
      take: 50,
      include: {
        eventos: { orderBy: { detectadoEm: "asc" } },
        proximoAprovador: { select: { id: true, name: true } },
      },
    }),
    prisma.usuarioSenior.findMany({
      include: { user: { select: { name: true } } },
    }),
  ]);

  // {codigoSenior: nome} pra resolver os codigos que aparecem no historico
  // de niveis (E614USU) dentro do mapa da OC
  const codToNome: Record<string, string> = {};
  for (const u of usuariosSenior) {
    codToNome[u.codigo] = u.user?.name || u.nome;
  }

  return NextResponse.json({ pendentes, resolvidasRecentes, codToNome });
}
