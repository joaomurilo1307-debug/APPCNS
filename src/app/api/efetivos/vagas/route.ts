import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { dataDe, exigir, registrar } from "@/lib/efetivos/servidor";
import { STATUS_VAGA, dataValida } from "@/lib/efetivos/disponibilidade";

const dia = z.string().refine(dataValida, "Data inválida (AAAA-MM-DD)");

const schema = z.object({
  equipeId: z.string().min(1),
  atividade: z.string().trim().min(1).max(60).default("Resgate"),
  empresa: z.string().trim().min(1).max(60),
  cargo: z.string().trim().min(1).max(120),
  nome: z.string().trim().max(120).nullable().optional(),
  status: z.enum(STATUS_VAGA).default("Vigente"),
  previsaoInicio: dia.nullable().optional(),
  nivel: z.string().trim().max(30).nullable().optional(),
  direcao4x4: z.boolean().nullable().optional(),
  contratoAtual: z.string().trim().max(60).nullable().optional(),
  disponivelAPartir: dia.nullable().optional(),
  destino: z.string().trim().max(120).nullable().optional(),
  observacao: z.string().trim().max(300).nullable().optional(),
});

export async function POST(req: Request) {
  const a = await exigir("editar");
  if ("erro" in a) return a.erro;
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Dados inválidos", detalhes: parsed.error.flatten() }, { status: 422 });
  const d = parsed.data;
  const equipe = await prisma.efetivoEquipe.findUnique({ where: { id: d.equipeId } });
  if (!equipe) return NextResponse.json({ error: "Equipe não encontrada" }, { status: 404 });
  const maior = await prisma.efetivoVaga.aggregate({ _max: { numero: true } });
  const vaga = await prisma.efetivoVaga.create({
    data: {
      numero: (maior._max.numero ?? 0) + 1,
      equipeId: d.equipeId,
      atividade: d.atividade,
      empresa: d.empresa,
      cargo: d.cargo,
      nome: d.nome || null,
      status: d.status,
      previsaoInicio: d.previsaoInicio ? dataDe(d.previsaoInicio) : null,
      nivel: d.nivel || null,
      direcao4x4: d.direcao4x4 ?? null,
      contratoAtual: d.contratoAtual || null,
      disponivelAPartir: d.disponivelAPartir ? dataDe(d.disponivelAPartir) : null,
      destino: d.destino || null,
      observacao: d.observacao || null,
    },
  });
  await registrar(a.userId, "VAGA_CRIADA", "VAGA", vaga.id, `Vaga de ${d.cargo} criada na equipe ${equipe.codigo} por ${a.nome}`);
  return NextResponse.json({ vaga }, { status: 201 });
}
