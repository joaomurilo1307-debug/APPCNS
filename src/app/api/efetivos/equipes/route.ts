import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { exigir, registrar } from "@/lib/efetivos/servidor";
import { STATUS_EQUIPE } from "@/lib/efetivos/disponibilidade";

const schema = z.object({
  codigo: z.string().trim().min(1).max(20).optional(),
  nome: z.string().trim().min(1).max(120),
  projeto: z.string().trim().min(1).max(60),
  gestor: z.string().trim().max(80).nullable().optional(),
  grupo: z.string().trim().min(1).max(40),
  status: z.enum(STATUS_EQUIPE).default("Ativa"),
});

export async function POST(req: Request) {
  const a = await exigir("editar");
  if ("erro" in a) return a.erro;
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Dados inválidos", detalhes: parsed.error.flatten() }, { status: 422 });
  const d = parsed.data;

  let codigo = d.codigo;
  if (!codigo) {
    const todas = await prisma.efetivoEquipe.findMany({ select: { codigo: true } });
    const maior = todas.reduce((m, e) => Math.max(m, Number(/^EQ-(\d+)$/.exec(e.codigo)?.[1] ?? 0)), 0);
    codigo = `EQ-${String(maior + 1).padStart(2, "0")}`;
  }
  if (await prisma.efetivoEquipe.findUnique({ where: { codigo } })) {
    return NextResponse.json({ error: `Já existe a equipe ${codigo}` }, { status: 409 });
  }
  const total = await prisma.efetivoEquipe.count();
  const equipe = await prisma.efetivoEquipe.create({
    data: { codigo, nome: d.nome, projeto: d.projeto, gestor: d.gestor || null, grupo: d.grupo, status: d.status, ordem: total + 1 },
  });
  await registrar(a.userId, "EQUIPE_CRIADA", "EQUIPE", equipe.id, `Equipe ${codigo} (${d.nome}) criada por ${a.nome}`);
  return NextResponse.json({ equipe }, { status: 201 });
}
