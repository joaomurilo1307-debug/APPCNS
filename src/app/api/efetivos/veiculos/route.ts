import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { dataDe, exigir, registrar } from "@/lib/efetivos/servidor";
import { dia } from "@/lib/efetivos/esquemas";
import { STATUS_VEICULO } from "@/lib/efetivos/veiculos";

const schema = z.object({
  identificacao: z.string().trim().min(1).max(60),
  placa: z.string().trim().max(15).nullable().optional(),
  modelo: z.string().trim().max(80).nullable().optional(),
  tracao4x4: z.boolean().nullable().optional(),
  status: z.enum(STATUS_VEICULO).default("Em operação"),
  observacao: z.string().trim().max(300).nullable().optional(),
  // onde o veiculo esta desde ja (opcional): contrato/projeto, equipe e local
  localizacao: z
    .object({
      inicio: dia,
      projeto: z.string().trim().min(1).max(60),
      equipeId: z.string().nullable().optional(),
      local: z.string().trim().max(160).nullable().optional(),
    })
    .optional(),
});

export async function POST(req: Request) {
  const a = await exigir("editar");
  if ("erro" in a) return a.erro;
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Dados inválidos", detalhes: parsed.error.flatten() }, { status: 422 });
  const d = parsed.data;
  const placa = d.placa ? d.placa.toUpperCase().replace(/\s+/g, "") : null;
  if (placa && (await prisma.efetivoVeiculo.findFirst({ where: { placa } }))) {
    return NextResponse.json({ error: `Já existe um veículo com a placa ${placa}` }, { status: 409 });
  }

  for (let tentativa = 0; tentativa < 3; tentativa++) {
    const todos = await prisma.efetivoVeiculo.findMany({ select: { codigo: true } });
    const maior = todos.reduce((m, v) => Math.max(m, Number(/^VEI-(\d+)$/.exec(v.codigo)?.[1] ?? 0)), 0);
    const codigo = `VEI-${String(maior + 1).padStart(3, "0")}`;
    try {
      const veiculo = await prisma.efetivoVeiculo.create({
        data: { codigo, identificacao: d.identificacao, placa, modelo: d.modelo || null, tracao4x4: d.tracao4x4 ?? null, status: d.status, observacao: d.observacao || null },
      });
      if (d.localizacao) {
        await prisma.efetivoVeiculoMovimento.create({
          data: {
            veiculoId: veiculo.id,
            inicio: dataDe(d.localizacao.inicio),
            projeto: d.localizacao.projeto,
            equipeId: d.localizacao.equipeId || null,
            local: d.localizacao.local || null,
            criadoPorNome: a.nome,
          },
        });
      }
      await registrar(a.userId, "VEICULO_CRIADO", "VEICULO", veiculo.id, `Veículo ${codigo} (${d.identificacao}${placa ? `, ${placa}` : ""}) cadastrado por ${a.nome}${d.localizacao ? ` em ${d.localizacao.projeto}` : ""}`);
      return NextResponse.json({ veiculo }, { status: 201 });
    } catch (e: any) {
      if (e?.code !== "P2002") throw e;
    }
  }
  return NextResponse.json({ error: "Não foi possível gerar o código do veículo, tente de novo" }, { status: 409 });
}
