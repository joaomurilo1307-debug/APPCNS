import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { exigir, registrar } from "@/lib/efetivos/servidor";
import { STATUS_EQUIPE } from "@/lib/efetivos/disponibilidade";

const schema = z
  .object({
    nome: z.string().trim().min(1).max(120),
    projeto: z.string().trim().min(1).max(60),
    gestor: z.string().trim().max(80).nullable(),
    grupo: z.string().trim().min(1).max(40),
    status: z.enum(STATUS_EQUIPE),
  })
  .partial();

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const a = await exigir("editar");
  if ("erro" in a) return a.erro;
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success || Object.keys(parsed.data).length === 0) {
    return NextResponse.json({ error: "Dados inválidos" }, { status: 422 });
  }
  const antes = await prisma.efetivoEquipe.findUnique({ where: { id: params.id } });
  if (!antes) return NextResponse.json({ error: "Equipe não encontrada" }, { status: 404 });
  const equipe = await prisma.efetivoEquipe.update({ where: { id: params.id }, data: parsed.data });
  // viaturas que estao com esta equipe (passagem aberta no contrato antigo) acompanham o novo contrato
  if (parsed.data.projeto && antes.projeto !== equipe.projeto) {
    await prisma.efetivoVeiculoMovimento.updateMany({
      where: { equipeId: equipe.id, fim: null, projeto: antes.projeto },
      data: { projeto: equipe.projeto },
    });
  }
  const mudou = Object.keys(parsed.data).filter((k) => (antes as any)[k] !== (equipe as any)[k]);
  if (mudou.length) {
    await registrar(a.userId, "EQUIPE_ALTERADA", "EQUIPE", equipe.id, `Equipe ${equipe.codigo}: ${mudou.map((k) => `${k} "${(antes as any)[k] ?? ""}" → "${(equipe as any)[k] ?? ""}"`).join("; ")}`);
  }
  return NextResponse.json({ equipe });
}
