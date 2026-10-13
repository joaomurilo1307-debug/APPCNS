import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { dataDe, dadosParaRegra, diaDe, exigir, registrar } from "@/lib/efetivos/servidor";
import { campanhaSchema } from "@/lib/efetivos/esquemas";
import { STATUS_CAMPANHA_QUE_LIBERAM, validarAlocacao } from "@/lib/efetivos/disponibilidade";

const schema = campanhaSchema.partial();

// Campanha nao e apagada: cancelar libera as pessoas e preserva o historico.
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const a = await exigir("editar");
  if ("erro" in a) return a.erro;
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success || Object.keys(parsed.data).length === 0) {
    return NextResponse.json({ error: "Dados inválidos", detalhes: parsed.success ? undefined : parsed.error.flatten() }, { status: 422 });
  }
  const antes = await prisma.efetivoCampanha.findUnique({ where: { id: params.id }, include: { alocacoes: true } });
  if (!antes) return NextResponse.json({ error: "Campanha não encontrada" }, { status: 404 });
  const d = parsed.data;
  const novoInicio = d.inicio ?? diaDe(antes.inicio)!;
  const novoFim = d.fim ?? diaDe(antes.fim)!;
  if (novoInicio > novoFim) return NextResponse.json({ error: "O fim não pode ser antes do início" }, { status: 422 });
  const novoStatus = d.status ?? antes.status;

  const segurava = !STATUS_CAMPANHA_QUE_LIBERAM.includes(antes.status);
  const segura = !STATUS_CAMPANHA_QUE_LIBERAM.includes(novoStatus);
  const mudouPeriodo = novoInicio !== diaDe(antes.inicio) || novoFim !== diaDe(antes.fim);

  // Mudou o periodo ou reativou uma campanha cancelada: as pessoas reservadas precisam continuar livres.
  if (segura && antes.alocacoes.length > 0 && (mudouPeriodo || !segurava)) {
    const { regra } = await dadosParaRegra();
    const problemas = validarAlocacao(regra, antes.id, antes.alocacoes.map((x) => x.vagaId), novoInicio, novoFim);
    if (problemas.length > 0) {
      const nomes = new Map(regra.vagas.map((v) => [v.id, v.nome ?? "(sem nome)"]));
      return NextResponse.json(
        {
          error: "Com essa mudança, parte da equipe já escalada deixa de estar livre. Ajuste a equipe antes ou escolha outro período.",
          conflitos: problemas.map((p) => ({ ...p, nome: nomes.get(p.vagaId) })),
        },
        { status: 409 }
      );
    }
  }

  const { inicio, fim, recebidaEm, solicitante, local, observacao, ...resto } = d;
  const campanha = await prisma.$transaction(async (tx) => {
    const c = await tx.efetivoCampanha.update({
      where: { id: params.id },
      data: {
        ...resto,
        ...(inicio ? { inicio: dataDe(inicio) } : {}),
        ...(fim ? { fim: dataDe(fim) } : {}),
        ...(recebidaEm !== undefined ? { recebidaEm: recebidaEm ? dataDe(recebidaEm) : null } : {}),
        ...(solicitante !== undefined ? { solicitante: solicitante || null } : {}),
        ...(local !== undefined ? { local: local || null } : {}),
        ...(observacao !== undefined ? { observacao: observacao || null } : {}),
      },
    });
    // alocacoes que seguiam o periodo da campanha acompanham a mudanca
    if (mudouPeriodo) {
      await tx.efetivoAlocacao.updateMany({
        where: { campanhaId: params.id, inicio: antes.inicio, fim: antes.fim },
        data: { inicio: dataDe(novoInicio), fim: dataDe(novoFim) },
      });
    }
    return c;
  });

  const partes: string[] = [];
  if (antes.status !== campanha.status) partes.push(`status ${antes.status} → ${campanha.status}`);
  if (mudouPeriodo) partes.push(`período ${diaDe(antes.inicio)}–${diaDe(antes.fim)} → ${novoInicio}–${novoFim}`);
  if (d.qtdEquipes !== undefined && d.qtdEquipes !== antes.qtdEquipes) partes.push(`equipes pedidas ${antes.qtdEquipes} → ${d.qtdEquipes}`);
  if (d.grupo && d.grupo !== antes.grupo) partes.push(`grupo ${antes.grupo} → ${d.grupo}`);
  if (partes.length === 0) partes.push("dados atualizados");
  await registrar(a.userId, "CAMPANHA_ALTERADA", "CAMPANHA", campanha.id, `Campanha ${campanha.codigo}: ${partes.join("; ")} (por ${a.nome})`);
  return NextResponse.json({ campanha });
}
