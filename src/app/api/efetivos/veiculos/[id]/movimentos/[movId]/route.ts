import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { diaDe, exigir, registrar } from "@/lib/efetivos/servidor";

// Corrige um lancamento errado de localizacao (o historico da remocao fica registrado).
export async function DELETE(_req: Request, { params }: { params: { id: string; movId: string } }) {
  const a = await exigir("editar");
  if ("erro" in a) return a.erro;
  const mov = await prisma.efetivoVeiculoMovimento.findFirst({ where: { id: params.movId, veiculoId: params.id }, include: { veiculo: true } });
  if (!mov) return NextResponse.json({ error: "Passagem não encontrada" }, { status: 404 });
  await prisma.efetivoVeiculoMovimento.delete({ where: { id: mov.id } });
  await registrar(
    a.userId,
    "VEICULO_PASSAGEM_REMOVIDA",
    "VEICULO",
    params.id,
    `Veículo ${mov.veiculo.codigo} (${mov.veiculo.identificacao}): passagem em ${mov.projeto} de ${diaDe(mov.inicio)} a ${diaDe(mov.fim) ?? "sem fim"} removida (por ${a.nome})`
  );
  return NextResponse.json({ ok: true });
}
