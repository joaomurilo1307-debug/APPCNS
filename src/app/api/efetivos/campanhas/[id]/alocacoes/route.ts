import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { dataDe, dadosParaRegra, diaDe, exigir, registrar } from "@/lib/efetivos/servidor";
import { STATUS_CAMPANHA_QUE_LIBERAM, validarAlocacao } from "@/lib/efetivos/disponibilidade";

const schema = z.object({ vagaIds: z.array(z.string().min(1)).max(300) });

// "Montar equipe": grava exatamente o conjunto de pessoas escolhido para a campanha.
// Quem esta ausente ou ja reservado em outra campanha no periodo e recusado (409), sem gravar nada.
export async function PUT(req: Request, { params }: { params: { id: string } }) {
  const a = await exigir("editar");
  if ("erro" in a) return a.erro;
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Dados inválidos" }, { status: 422 });
  const vagaIds = Array.from(new Set(parsed.data.vagaIds));

  const campanha = await prisma.efetivoCampanha.findUnique({ where: { id: params.id }, include: { alocacoes: true } });
  if (!campanha) return NextResponse.json({ error: "Campanha não encontrada" }, { status: 404 });
  if (STATUS_CAMPANHA_QUE_LIBERAM.includes(campanha.status)) {
    return NextResponse.json({ error: `Campanha ${campanha.status.toLowerCase()}: reative-a antes de escalar pessoas` }, { status: 409 });
  }
  const inicio = diaDe(campanha.inicio)!;
  const fim = diaDe(campanha.fim)!;

  const { regra } = await dadosParaRegra();
  const problemas = validarAlocacao(regra, campanha.id, vagaIds, inicio, fim);
  const nomes = new Map(regra.vagas.map((v) => [v.id, v.nome ?? "(sem nome)"]));
  if (problemas.length > 0) {
    return NextResponse.json(
      {
        error: "Algumas pessoas não estão livres em todo o período da campanha. Nada foi gravado.",
        conflitos: problemas.map((p) => ({ ...p, nome: nomes.get(p.vagaId) ?? null })),
      },
      { status: 409 }
    );
  }

  const atuais = new Set(campanha.alocacoes.map((x) => x.vagaId));
  const novos = vagaIds.filter((v) => !atuais.has(v));
  const saem = campanha.alocacoes.filter((x) => !vagaIds.includes(x.vagaId));

  await prisma.$transaction([
    ...(saem.length ? [prisma.efetivoAlocacao.deleteMany({ where: { id: { in: saem.map((s) => s.id) } } })] : []),
    ...(novos.length
      ? [
          prisma.efetivoAlocacao.createMany({
            data: novos.map((vagaId) => ({ campanhaId: campanha.id, vagaId, inicio: dataDe(inicio), fim: dataDe(fim), criadoPorNome: a.nome })),
          }),
        ]
      : []),
  ]);

  if (novos.length || saem.length) {
    const lista = (ids: string[]) => ids.map((id) => nomes.get(id) ?? id).join(", ");
    await registrar(
      a.userId,
      "EQUIPE_MONTADA",
      "CAMPANHA",
      campanha.id,
      `Campanha ${campanha.codigo} (${inicio} a ${fim}): ${novos.length ? `entraram ${lista(novos)}` : ""}${novos.length && saem.length ? "; " : ""}${saem.length ? `saíram ${lista(saem.map((s) => s.vagaId))}` : ""} (por ${a.nome})`
    );
  }
  const alocacoes = await prisma.efetivoAlocacao.findMany({ where: { campanhaId: campanha.id } });
  return NextResponse.json({
    alocacoes: alocacoes.map((x) => ({ id: x.id, campanhaId: x.campanhaId, vagaId: x.vagaId, inicio: diaDe(x.inicio)!, fim: diaDe(x.fim)! })),
    entraram: novos.length,
    sairam: saem.length,
  });
}
