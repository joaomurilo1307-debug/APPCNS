import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { diaDe, exigir, registrar } from "@/lib/efetivos/servidor";

// Remove um lancamento de ausencia (corrigir engano ou ausencia cancelada). Fica no historico.
export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const a = await exigir("editar");
  if ("erro" in a) return a.erro;
  const aus = await prisma.efetivoAusencia.findUnique({ where: { id: params.id }, include: { vaga: { include: { equipe: true } } } });
  if (!aus) return NextResponse.json({ error: "Ausência não encontrada" }, { status: 404 });
  await prisma.efetivoAusencia.delete({ where: { id: params.id } });
  await registrar(
    a.userId,
    "AUSENCIA_REMOVIDA",
    "AUSENCIA",
    params.id,
    `${aus.tipo} de ${aus.vaga.nome ?? "vaga sem nome"} (${aus.vaga.equipe.codigo}) de ${diaDe(aus.inicio)} a ${diaDe(aus.fim)} removida`
  );
  return NextResponse.json({ ok: true });
}
