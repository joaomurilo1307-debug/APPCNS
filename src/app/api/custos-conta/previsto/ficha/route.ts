import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { acessoCustos, ccuValido, podeEditarCentro } from "@/lib/custos/acesso";

// Ficha do centro de custo (responsavel e objeto do contrato, como no cabecalho das planilhas). So' texto informativo.

const schema = z.object({ codccu: z.string(), responsavel: z.string().max(200).nullable(), objeto: z.string().max(600).nullable() });

export async function PUT(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success || !ccuValido(parsed.data.codccu)) return NextResponse.json({ error: "Dados inválidos" }, { status: 422 });
  const d = parsed.data;
  const user = session.user as any;
  if (!(await podeEditarCentro(await acessoCustos(user), d.codccu))) return NextResponse.json({ error: "Sem permissão para editar este centro de custo" }, { status: 403 });
  const dados = { responsavel: d.responsavel?.trim() || null, objeto: d.objeto?.trim() || null, atualizadoPorId: user.id };
  await prisma.custoCentroFicha.upsert({ where: { codccu: d.codccu }, create: { codccu: d.codccu, ...dados }, update: dados });
  return NextResponse.json({ ok: true });
}
