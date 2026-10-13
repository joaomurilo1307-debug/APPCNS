import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { dataDe, exigir, registrar } from "@/lib/efetivos/servidor";
import { TIPOS_AUSENCIA, dataValida } from "@/lib/efetivos/disponibilidade";

const dia = z.string().refine(dataValida, "Data inválida (AAAA-MM-DD)");

const schema = z
  .object({
    vagaId: z.string().min(1),
    tipo: z.enum(TIPOS_AUSENCIA),
    inicio: dia,
    fim: dia,
    observacao: z.string().trim().max(300).nullable().optional(),
  })
  .refine((v) => v.inicio <= v.fim, { message: "O fim não pode ser antes do início", path: ["fim"] });

export async function POST(req: Request) {
  const a = await exigir("editar");
  if ("erro" in a) return a.erro;
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Dados inválidos", detalhes: parsed.error.flatten() }, { status: 422 });
  const d = parsed.data;
  const vaga = await prisma.efetivoVaga.findUnique({ where: { id: d.vagaId }, include: { equipe: true } });
  if (!vaga) return NextResponse.json({ error: "Vaga não encontrada" }, { status: 404 });

  const ausencia = await prisma.efetivoAusencia.create({
    data: { vagaId: d.vagaId, tipo: d.tipo, inicio: dataDe(d.inicio), fim: dataDe(d.fim), observacao: d.observacao || null },
  });
  // se a pessoa ja estava reservada para uma campanha nesse periodo, a tela precisa avisar
  const conflitos = await prisma.efetivoAlocacao.findMany({
    where: { vagaId: d.vagaId, inicio: { lte: dataDe(d.fim) }, fim: { gte: dataDe(d.inicio) }, campanha: { status: { notIn: ["Cancelada", "Concluída"] } } },
    include: { campanha: { select: { codigo: true } } },
  });
  await registrar(a.userId, "AUSENCIA_CRIADA", "AUSENCIA", ausencia.id, `${d.tipo} de ${vaga.nome ?? "vaga sem nome"} (${vaga.equipe.codigo}) de ${d.inicio} a ${d.fim}`);
  return NextResponse.json({ ausencia, conflitos: conflitos.map((c) => c.campanha.codigo) }, { status: 201 });
}
