import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { acessoCustos, ccuValido, podeEditarCentro } from "@/lib/custos/acesso";
import { contaConhecida } from "@/lib/custos/planoContas";
import { lerMes } from "@/lib/custos/previsto";

// Edicao na GRADE conta x mes: define o TOTAL do previsto de uma celula. As linhas ativas daquela conta/mes saem (exclusao logica) e
// entra uma unica linha com o valor novo -- nada e' apagado de verdade, e quem mexeu fica registrado.

const schema = z.object({
  codccu: z.string(),
  conta: z.number().int().positive(),
  competencia: z.string(), // aaaa-mm
  valor: z.number().finite().min(0).max(1_000_000_000),
});

export async function PUT(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Dados inválidos", detalhes: parsed.error.flatten() }, { status: 422 });
  const d = parsed.data;
  const mes = lerMes(d.competencia);
  if (!ccuValido(d.codccu) || !mes) return NextResponse.json({ error: "Centro de custo ou mês inválido" }, { status: 422 });
  if (!contaConhecida(d.conta)) return NextResponse.json({ error: "Conta financeira desconhecida" }, { status: 422 });
  const user = session.user as any;
  if (!(await podeEditarCentro(await acessoCustos(user), d.codccu))) return NextResponse.json({ error: "Sem permissão para editar o previsto deste centro de custo" }, { status: 403 });

  const competencia = new Date(`${mes}-01T00:00:00.000Z`);
  const valor = Math.round(d.valor * 100) / 100;
  const resultado = await prisma.$transaction(async (tx) => {
    const atuais = await tx.custoPrevisto.findMany({ where: { codccu: d.codccu, conta: d.conta, competencia, excluidoEm: null } });
    const soma = Math.round(atuais.reduce((s, l) => s + l.valor, 0) * 100) / 100;
    if (soma === valor) return { alterado: false, id: atuais[0]?.id ?? null };
    if (atuais.length) await tx.custoPrevisto.updateMany({ where: { id: { in: atuais.map((l) => l.id) } }, data: { excluidoEm: new Date(), atualizadoPorId: user.id } });
    if (valor === 0) return { alterado: true, id: null };
    const nova = await tx.custoPrevisto.create({
      data: { codccu: d.codccu, conta: d.conta, competencia, valor, descricao: "Ajustado na grade", origem: "MANUAL", criadoPorId: user.id, atualizadoPorId: user.id },
    });
    return { alterado: true, id: nova.id };
  });
  return NextResponse.json({ ok: true, ...resultado });
}
