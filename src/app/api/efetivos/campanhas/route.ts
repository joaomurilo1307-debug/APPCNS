import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { dataDe, exigir, registrar } from "@/lib/efetivos/servidor";
import { campanhaSchema } from "@/lib/efetivos/esquemas";

export async function POST(req: Request) {
  const a = await exigir("editar");
  if ("erro" in a) return a.erro;
  const parsed = campanhaSchema
    .refine((v) => v.inicio <= v.fim, { message: "O fim não pode ser antes do início", path: ["fim"] })
    .safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Dados inválidos", detalhes: parsed.error.flatten() }, { status: 422 });
  const d = parsed.data;

  // codigo sequencial CAM-001...; tenta de novo se dois cadastros colidirem
  for (let tentativa = 0; tentativa < 3; tentativa++) {
    const todas = await prisma.efetivoCampanha.findMany({ select: { codigo: true } });
    const maior = todas.reduce((m, c) => Math.max(m, Number(/^CAM-(\d+)$/.exec(c.codigo)?.[1] ?? 0)), 0);
    const codigo = `CAM-${String(maior + 1).padStart(3, "0")}`;
    try {
      const campanha = await prisma.efetivoCampanha.create({
        data: {
          codigo,
          recebidaEm: d.recebidaEm ? dataDe(d.recebidaEm) : null,
          solicitante: d.solicitante || null,
          projeto: d.projeto,
          grupo: d.grupo,
          atividade: d.atividade,
          local: d.local || null,
          inicio: dataDe(d.inicio),
          fim: dataDe(d.fim),
          qtdEquipes: d.qtdEquipes,
          prioridade: d.prioridade,
          status: d.status,
          observacao: d.observacao || null,
          criadoPorNome: a.nome,
        },
      });
      await registrar(a.userId, "CAMPANHA_CRIADA", "CAMPANHA", campanha.id, `Campanha ${codigo} (${d.projeto}, ${d.grupo}, ${d.atividade}) de ${d.inicio} a ${d.fim} criada por ${a.nome}`);
      return NextResponse.json({ campanha }, { status: 201 });
    } catch (e: any) {
      if (e?.code !== "P2002") throw e;
    }
  }
  return NextResponse.json({ error: "Não foi possível gerar o código da campanha, tente de novo" }, { status: 409 });
}
