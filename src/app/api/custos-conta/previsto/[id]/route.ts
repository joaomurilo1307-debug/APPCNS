import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { acessoCustos, podeEditarCentro } from "@/lib/custos/acesso";
import { contaConhecida } from "@/lib/custos/planoContas";
import { lerMes } from "@/lib/custos/previsto";

// Ajusta ou exclui (logicamente) UMA linha de previsto. So' ADMIN/DIRETOR ou quem participa da equipe daquele centro de custo.

const ajusteSchema = z.object({
  conta: z.number().int().positive().optional(),
  competencia: z.string().nullable().optional(),
  valor: z.number().finite().min(-1_000_000_000).max(1_000_000_000).optional(),
  descricao: z.string().max(300).nullable().optional(),
  fornecedor: z.string().max(200).nullable().optional(),
});

async function carregar(id: string) {
  const linha = await prisma.custoPrevisto.findUnique({ where: { id } });
  if (!linha || linha.excluidoEm) return null;
  return linha;
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const linha = await carregar(params.id);
  if (!linha) return NextResponse.json({ error: "Linha de previsto não encontrada" }, { status: 404 });
  const user = session.user as any;
  if (!(await podeEditarCentro(await acessoCustos(user), linha.codccu))) return NextResponse.json({ error: "Sem permissão para editar o previsto deste centro de custo" }, { status: 403 });

  const parsed = ajusteSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Dados inválidos", detalhes: parsed.error.flatten() }, { status: 422 });
  const d = parsed.data;
  if (d.conta !== undefined && !contaConhecida(d.conta)) return NextResponse.json({ error: "Conta financeira desconhecida" }, { status: 422 });
  let competencia: Date | null | undefined;
  if (d.competencia !== undefined) {
    const mes = d.competencia === null ? null : lerMes(d.competencia);
    if (d.competencia !== null && !mes) return NextResponse.json({ error: "Mês inválido (use aaaa-mm)" }, { status: 422 });
    competencia = mes ? new Date(`${mes}-01T00:00:00.000Z`) : null;
  }
  await prisma.custoPrevisto.update({
    where: { id: linha.id },
    data: {
      ...(d.conta !== undefined ? { conta: d.conta } : {}),
      ...(competencia !== undefined ? { competencia } : {}),
      ...(d.valor !== undefined ? { valor: d.valor } : {}),
      ...(d.descricao !== undefined ? { descricao: d.descricao?.trim() || null } : {}),
      ...(d.fornecedor !== undefined ? { fornecedor: d.fornecedor?.trim() || null } : {}),
      atualizadoPorId: user.id,
    },
  });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const linha = await carregar(params.id);
  if (!linha) return NextResponse.json({ error: "Linha de previsto não encontrada" }, { status: 404 });
  const user = session.user as any;
  if (!(await podeEditarCentro(await acessoCustos(user), linha.codccu))) return NextResponse.json({ error: "Sem permissão para editar o previsto deste centro de custo" }, { status: 403 });
  await prisma.custoPrevisto.update({ where: { id: linha.id }, data: { excluidoEm: new Date(), atualizadoPorId: user.id } });
  return NextResponse.json({ ok: true });
}
