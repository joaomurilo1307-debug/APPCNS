import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ehCliente, podeVerDemanda } from "@/lib/demandas";
import { z } from "zod";

const schema = z.object({ texto: z.string().trim().min(1).max(3000), interno: z.boolean().optional() });

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const u = session.user as any;
  if (u.role === "VISUALIZADOR") return NextResponse.json({ error: "Perfil somente leitura" }, { status: 403 });
  const d = await prisma.demanda.findUnique({ where: { id: params.id }, select: { id: true, solicitanteId: true, contrato: { select: { codccu: true } } } });
  if (!d) return NextResponse.json({ error: "Demanda não encontrada" }, { status: 404 });
  if (!(await podeVerDemanda(u, d))) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });
  const c = await prisma.demandaComentario.create({
    data: { demandaId: d.id, autorId: u.id, texto: parsed.data.texto, interno: ehCliente(u) ? false : !!parsed.data.interno },
    select: { id: true },
  });
  await prisma.demanda.update({ where: { id: d.id }, data: { updatedAt: new Date() } });
  return NextResponse.json(c, { status: 201 });
}
