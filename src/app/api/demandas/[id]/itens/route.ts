import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { podeGerirDemandas, podeVerDemanda } from "@/lib/demandas";
import { z } from "zod";

// Itens da lista da demanda. Quem pediu mexe enquanto a demanda esta NOVA; a gestao mexe sempre.
async function autorizar(id: string) {
  const session = await getServerSession(authOptions);
  if (!session) return { erro: NextResponse.json({ error: "Não autenticado" }, { status: 401 }) };
  const u = session.user as any;
  const d = await prisma.demanda.findUnique({ where: { id }, select: { id: true, status: true, solicitanteId: true, contrato: { select: { codccu: true } } } });
  if (!d) return { erro: NextResponse.json({ error: "Demanda não encontrada" }, { status: 404 }) };
  if (!(await podeVerDemanda(u, d))) return { erro: NextResponse.json({ error: "Sem permissão" }, { status: 403 }) };
  const gerir = await podeGerirDemandas(u);
  if (!gerir && !(d.solicitanteId === u.id && d.status === "NOVA")) return { erro: NextResponse.json({ error: "A lista só pode ser alterada pela gestão (ou por quem pediu, enquanto a demanda é nova)" }, { status: 403 }) };
  return { d, gerir };
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const a = await autorizar(params.id);
  if (a.erro) return a.erro;
  const parsed = z.object({ texto: z.string().trim().min(1).max(300) }).safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });
  const ultimo = await prisma.demandaItem.findFirst({ where: { demandaId: params.id }, orderBy: { ordem: "desc" }, select: { ordem: true } });
  const item = await prisma.demandaItem.create({ data: { demandaId: params.id, texto: parsed.data.texto, ordem: (ultimo?.ordem ?? -1) + 1 } });
  return NextResponse.json(item, { status: 201 });
}
