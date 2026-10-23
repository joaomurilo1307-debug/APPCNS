import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { GRUPOS, MODULOS, PAPEIS_DO_SISTEMA, PERFIS_PRONTOS, acessosEfetivos } from "@/lib/acesso/catalogo";

// Mesma estrutura de GET /api/users/[id]/acesso, para quem ainda nao existe: alimenta a tela "Novo usuario", que cria a pessoa e
// define o acesso (telas de Projetos e do Financeiro, projetos, contratos, nucleos e Senior) tudo de uma vez. So' leitura; so' ADMIN.
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  if ((session.user as any).role !== "ADMIN") return NextResponse.json({ error: "Só administradores gerenciam acessos" }, { status: 403 });

  const [projetos, centros, nucleos] = await Promise.all([
    prisma.project.findMany({ select: { id: true, name: true, status: true, team: { select: { name: true } } }, orderBy: { name: "asc" } }),
    prisma.custoContaFinanceira.groupBy({ by: ["codccu", "contrato"], _sum: { valor: true } }),
    prisma.nucleo.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);

  const nomesCentro = new Map<string, string>();
  for (const c of centros) if (!nomesCentro.has(c.codccu)) nomesCentro.set(c.codccu, c.contrato.replace(new RegExp(`^${c.codccu}\\s*-\\s*`), "").trim() || c.contrato);

  const papelInicial = "COLABORADOR";
  return NextResponse.json({
    usuario: { id: "", name: "", email: "", role: papelInicial, active: true, escopoProjetos: "PROPRIOS", verTodosCustos: false, nucleoId: null },
    papeis: PAPEIS_DO_SISTEMA,
    grupos: GRUPOS,
    modulos: MODULOS.map((m) => ({ id: m.id, label: m.label, grupo: m.grupo, restrito: m.restrito, descricao: m.descricao })),
    perfis: PERFIS_PRONTOS,
    acessos: acessosEfetivos(papelInicial, new Map(), new Map()),
    projetos: { disponiveis: projetos.map((p) => ({ id: p.id, name: p.name, status: p.status, equipe: p.team?.name ?? null })), liberados: [] },
    contratos: {
      disponiveis: Array.from(nomesCentro.entries()).map(([codccu, nome]) => ({ codccu, nome })).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")),
      liberados: [],
      verTodos: false,
      verTodosPeloPapel: false,
    },
    nucleos: { todos: nucleos, membroDe: null, gerente: [], coordenador: [] },
    senior: { vinculos: [], sugestoes: [] },
  });
}
