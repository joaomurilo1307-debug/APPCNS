import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { dataDe, diaDe, exigir, registrar } from "@/lib/efetivos/servidor";
import { dia } from "@/lib/efetivos/esquemas";
import { planejarMovimento } from "@/lib/efetivos/veiculos";

const schema = z.object({
  inicio: dia,
  fim: dia.nullable().optional(),
  projeto: z.string().trim().min(1).max(60),
  equipeId: z.string().nullable().optional(),
  campanhaId: z.string().nullable().optional(),
  local: z.string().trim().max(160).nullable().optional(),
  observacao: z.string().trim().max(300).nullable().optional(),
});

// "Mover o veiculo": registra que, a partir de `inicio`, ele esta em outro contrato/equipe/local.
// A passagem anterior que estava aberta e fechada no dia anterior; nada e apagado.
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const a = await exigir("editar");
  if ("erro" in a) return a.erro;
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Dados inválidos", detalhes: parsed.error.flatten() }, { status: 422 });
  const d = parsed.data;
  const veiculo = await prisma.efetivoVeiculo.findUnique({ where: { id: params.id }, include: { movimentos: true } });
  if (!veiculo) return NextResponse.json({ error: "Veículo não encontrado" }, { status: 404 });
  if (d.equipeId && !(await prisma.efetivoEquipe.findUnique({ where: { id: d.equipeId } }))) return NextResponse.json({ error: "Equipe não encontrada" }, { status: 404 });
  if (d.campanhaId && !(await prisma.efetivoCampanha.findUnique({ where: { id: d.campanhaId } }))) return NextResponse.json({ error: "Campanha não encontrada" }, { status: 404 });

  const existentes = veiculo.movimentos.map((m) => ({
    id: m.id,
    veiculoId: m.veiculoId,
    inicio: diaDe(m.inicio)!,
    fim: diaDe(m.fim),
    projeto: m.projeto,
    equipeId: m.equipeId,
    campanhaId: m.campanhaId,
    local: m.local,
  }));
  const plano = planejarMovimento(existentes, { inicio: d.inicio, fim: d.fim ?? null });
  if (!plano.ok) return NextResponse.json({ error: plano.erro }, { status: 409 });

  const anterior = existentes.find((m) => plano.fecharAnterior && m.id === plano.fecharAnterior.id);
  const criar = prisma.efetivoVeiculoMovimento.create({
    data: {
      veiculoId: veiculo.id,
      inicio: dataDe(d.inicio),
      fim: plano.fimNovo ? dataDe(plano.fimNovo) : null,
      projeto: d.projeto,
      equipeId: d.equipeId || null,
      campanhaId: d.campanhaId || null,
      local: d.local || null,
      observacao: d.observacao || null,
      criadoPorNome: a.nome,
    },
  });
  const movimento = plano.fecharAnterior
    ? (await prisma.$transaction([prisma.efetivoVeiculoMovimento.update({ where: { id: plano.fecharAnterior.id }, data: { fim: dataDe(plano.fecharAnterior.fim) } }), criar]))[1]
    : await criar;
  await registrar(
    a.userId,
    "VEICULO_MOVIDO",
    "VEICULO",
    veiculo.id,
    `Veículo ${veiculo.codigo} (${veiculo.identificacao}${veiculo.placa ? `, ${veiculo.placa}` : ""}): ${anterior ? `saiu de ${anterior.projeto} e ` : ""}passou para ${d.projeto}${d.local ? ` (${d.local})` : ""} a partir de ${d.inicio} (por ${a.nome})`
  );
  return NextResponse.json({ movimento }, { status: 201 });
}
