import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { acessoCustos, ccuValido, podeEditarCentro, podeVerCentro } from "@/lib/custos/acesso";
import { contaConhecida } from "@/lib/custos/planoContas";
import { lerMes } from "@/lib/custos/previsto";

// Previsto (orcamento) do Controle de Custos de UM centro de custo -- o que os coordenadores mantinham na aba DADOS PREVISTO das
// planilhas. GET: linhas ativas + ficha (responsavel/objeto) + se quem pergunta pode editar. POST: cria uma linha de previsto.
// Exclusao e' logica (excluidoEm), entao nada se perde.

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const codccu = new URL(req.url).searchParams.get("codccu");
  if (!ccuValido(codccu)) return NextResponse.json({ error: "codccu inválido" }, { status: 422 });

  const acesso = await acessoCustos(session.user as any);
  if (!(await podeVerCentro(acesso, codccu))) return NextResponse.json({ error: "Sem permissão para este centro de custo" }, { status: 403 });

  const [linhas, ficha, podeEditar] = await Promise.all([
    prisma.custoPrevisto.findMany({ where: { codccu, excluidoEm: null }, orderBy: [{ competencia: "asc" }, { conta: "asc" }, { criadoEm: "asc" }] }),
    prisma.custoCentroFicha.findUnique({ where: { codccu } }),
    podeEditarCentro(acesso, codccu),
  ]);
  return NextResponse.json({
    podeEditar,
    ficha: ficha ? { responsavel: ficha.responsavel, objeto: ficha.objeto } : null,
    linhas: linhas.map((l) => ({
      id: l.id,
      conta: l.conta,
      competencia: l.competencia ? l.competencia.toISOString().slice(0, 7) : null,
      valor: l.valor,
      descricao: l.descricao,
      fornecedor: l.fornecedor,
      origem: l.origem,
    })),
  });
}

const criarSchema = z.object({
  codccu: z.string(),
  conta: z.number().int().positive(),
  competencia: z.string().nullable(), // "aaaa-mm" ou null (previsto sem mes)
  valor: z.number().finite().min(-1_000_000_000).max(1_000_000_000),
  descricao: z.string().max(300).nullable().optional(),
  fornecedor: z.string().max(200).nullable().optional(),
});

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const parsed = criarSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Dados inválidos", detalhes: parsed.error.flatten() }, { status: 422 });
  const d = parsed.data;
  if (!ccuValido(d.codccu)) return NextResponse.json({ error: "codccu inválido" }, { status: 422 });
  if (!contaConhecida(d.conta)) return NextResponse.json({ error: "Conta financeira desconhecida" }, { status: 422 });
  const mes = d.competencia === null ? null : lerMes(d.competencia);
  if (d.competencia !== null && !mes) return NextResponse.json({ error: "Mês inválido (use aaaa-mm)" }, { status: 422 });

  const user = session.user as any;
  const acesso = await acessoCustos(user);
  if (!(await podeEditarCentro(acesso, d.codccu))) return NextResponse.json({ error: "Sem permissão para editar o previsto deste centro de custo" }, { status: 403 });

  const criada = await prisma.custoPrevisto.create({
    data: {
      codccu: d.codccu,
      conta: d.conta,
      competencia: mes ? new Date(`${mes}-01T00:00:00.000Z`) : null,
      valor: d.valor,
      descricao: d.descricao?.trim() || null,
      fornecedor: d.fornecedor?.trim() || null,
      origem: "MANUAL",
      criadoPorId: user.id,
      atualizadoPorId: user.id,
    },
  });
  return NextResponse.json({ id: criada.id }, { status: 201 });
}
