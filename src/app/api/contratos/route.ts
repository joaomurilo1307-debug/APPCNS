import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { escopoDeCustos, escopoDeVisao, podeVerCcu } from "@/lib/custos/acesso";
import { negarSemModulo } from "@/lib/acesso/servidor";

// A lista de contratos tambem alimenta o filtro "Contratos" das telas de pagamento e de aprovacao de OC, entao quem entra em qualquer tela de contratos,
// custos ou financeiro pode listar (o que cada um enxerga continua limitado aos centros de custo dele).
const MODULOS_QUE_LISTAM_CONTRATOS = ["contratos", "custos", "medicao", "previsao", "p0", "resultado_operacional", "programacao_pagamento", "pagamentos_itau", "conferencia_oc", "despesas_recorrentes", "alertas_financeiro", "notas_fiscais", "aprovacoes_oc", "aprovacoes_oc_todas", "contestacoes_custo"] as const;

// Lista de contratos (centros de custo do Senior) que a pessoa pode acompanhar. A ficha de cada um (cliente, numero, vigencia,
// valor) e' do administrador; os centros de custo novos que aparecem nos custos do Senior viram contrato automaticamente.
const ADMINISTRATIVO = /^(adm\b|administrativ|diretoria|escrit[oó]rio|sede|matriz)/i;

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  { const negado = await negarSemModulo(session.user as any, ...MODULOS_QUE_LISTAM_CONTRATOS); if (negado) return negado; }
  const user = session.user as any;

  // cria o que falta (idempotente): um Contrato por centro de custo que ja tem custo lido do Senior
  const existentes = new Set((await prisma.contrato.findMany({ select: { codccu: true } })).map((c) => c.codccu));
  const ccus = await prisma.custoContaFinanceira.findMany({ distinct: ["codccu"], select: { codccu: true, contrato: true } });
  const novos = ccus
    .filter((c) => !existentes.has(c.codccu))
    .map((c) => {
      const nome = c.contrato.replace(new RegExp(`^${c.codccu}\\s*-\\s*`), "").trim() || c.contrato;
      return { codccu: c.codccu, nome, tipo: ADMINISTRATIVO.test(nome) ? "ADMINISTRATIVO" : "CONTRATO" };
    });
  if (novos.length) await prisma.contrato.createMany({ data: novos, skipDuplicates: true });

  const sp = new URL(req.url).searchParams;
  const modo = sp.get("acompanhamento");
  const opcoes = sp.get("opcoes") === "1";
  const area = opcoes && sp.get("area") === "projetos" ? "PROJETOS" : "FINANCEIRO";
  const escopo = await escopoDeVisao(await escopoDeCustos(prisma, user, area), {
    incluirForaDosResultados: !opcoes && (modo === "todos" || modo === "fora"),
    ignorarSelecao: opcoes || sp.get("ignorarSelecao") === "1",
  });
  const todos = await prisma.contrato.findMany({ orderBy: { nome: "asc" } });
  const contratos = todos.filter((c) => podeVerCcu(escopo, c.codccu) && (modo !== "fora" || c.acompanharResultados === false));
  return NextResponse.json({ contratos, podeEditar: user.role === "ADMIN" });
}
