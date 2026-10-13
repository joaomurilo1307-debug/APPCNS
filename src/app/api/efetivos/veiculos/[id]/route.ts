import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { exigir, registrar } from "@/lib/efetivos/servidor";
import { STATUS_VEICULO } from "@/lib/efetivos/veiculos";

const schema = z
  .object({
    identificacao: z.string().trim().min(1).max(60),
    placa: z.string().trim().max(15).nullable(),
    modelo: z.string().trim().max(80).nullable(),
    tracao4x4: z.boolean().nullable(),
    status: z.enum(STATUS_VEICULO),
    observacao: z.string().trim().max(300).nullable(),
  })
  .partial();

// Veiculo nao e apagado: devolvido/baixado vira status "Devolvido" e o historico de onde andou fica.
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const a = await exigir("editar");
  if ("erro" in a) return a.erro;
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success || Object.keys(parsed.data).length === 0) return NextResponse.json({ error: "Dados inválidos" }, { status: 422 });
  const antes = await prisma.efetivoVeiculo.findUnique({ where: { id: params.id } });
  if (!antes) return NextResponse.json({ error: "Veículo não encontrado" }, { status: 404 });
  const { placa, modelo, observacao, ...resto } = parsed.data;
  const placaNorm = placa === undefined ? undefined : placa ? placa.toUpperCase().replace(/\s+/g, "") : null;
  if (placaNorm && placaNorm !== antes.placa && (await prisma.efetivoVeiculo.findFirst({ where: { placa: placaNorm, id: { not: antes.id } } }))) {
    return NextResponse.json({ error: `Já existe um veículo com a placa ${placaNorm}` }, { status: 409 });
  }
  const veiculo = await prisma.efetivoVeiculo.update({
    where: { id: params.id },
    data: {
      ...resto,
      ...(placaNorm !== undefined ? { placa: placaNorm } : {}),
      ...(modelo !== undefined ? { modelo: modelo || null } : {}),
      ...(observacao !== undefined ? { observacao: observacao || null } : {}),
    },
  });
  const partes: string[] = [];
  if (parsed.data.status && antes.status !== veiculo.status) partes.push(`status ${antes.status} → ${veiculo.status}`);
  if (placaNorm !== undefined && (antes.placa ?? "") !== (veiculo.placa ?? "")) partes.push(`placa "${antes.placa ?? ""}" → "${veiculo.placa ?? ""}"`);
  if (parsed.data.identificacao && antes.identificacao !== veiculo.identificacao) partes.push(`identificação "${antes.identificacao}" → "${veiculo.identificacao}"`);
  if (modelo !== undefined && (antes.modelo ?? "") !== (veiculo.modelo ?? "")) partes.push("modelo alterado");
  if (partes.length) await registrar(a.userId, "VEICULO_ALTERADO", "VEICULO", veiculo.id, `Veículo ${veiculo.codigo} (${veiculo.identificacao}): ${partes.join("; ")} (por ${a.nome})`);
  return NextResponse.json({ veiculo });
}
