import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { dataDe, diaDe, exigir, registrar } from "@/lib/efetivos/servidor";
import { STATUS_VAGA, dataValida } from "@/lib/efetivos/disponibilidade";

const dia = z.string().refine(dataValida, "Data inválida (AAAA-MM-DD)");

const schema = z
  .object({
    equipeId: z.string().min(1),
    atividade: z.string().trim().min(1).max(60),
    empresa: z.string().trim().min(1).max(60),
    cargo: z.string().trim().min(1).max(120),
    nome: z.string().trim().max(120).nullable(),
    status: z.enum(STATUS_VAGA),
    previsaoInicio: dia.nullable(),
    nivel: z.string().trim().max(30).nullable(),
    direcao4x4: z.boolean().nullable(),
    contratoAtual: z.string().trim().max(60).nullable(),
    disponivelAPartir: dia.nullable(),
    destino: z.string().trim().max(120).nullable(),
    observacao: z.string().trim().max(300).nullable(),
  })
  .partial();

// Vaga nao e apagada: quem sai vira "Desmobilizado" e o historico fica.
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const a = await exigir("editar");
  if ("erro" in a) return a.erro;
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success || Object.keys(parsed.data).length === 0) {
    return NextResponse.json({ error: "Dados inválidos", detalhes: parsed.success ? undefined : parsed.error.flatten() }, { status: 422 });
  }
  const antes = await prisma.efetivoVaga.findUnique({ where: { id: params.id }, include: { equipe: true } });
  if (!antes) return NextResponse.json({ error: "Vaga não encontrada" }, { status: 404 });
  if (parsed.data.equipeId && parsed.data.equipeId !== antes.equipeId) {
    const nova = await prisma.efetivoEquipe.findUnique({ where: { id: parsed.data.equipeId } });
    if (!nova) return NextResponse.json({ error: "Equipe de destino não encontrada" }, { status: 404 });
  }
  const { previsaoInicio, disponivelAPartir, nome, observacao, nivel, contratoAtual, destino, ...resto } = parsed.data;
  const vaga = await prisma.efetivoVaga.update({
    where: { id: params.id },
    data: {
      ...resto,
      ...(nome !== undefined ? { nome: nome || null } : {}),
      ...(observacao !== undefined ? { observacao: observacao || null } : {}),
      ...(nivel !== undefined ? { nivel: nivel || null } : {}),
      ...(contratoAtual !== undefined ? { contratoAtual: contratoAtual || null } : {}),
      ...(destino !== undefined ? { destino: destino || null } : {}),
      ...(previsaoInicio !== undefined ? { previsaoInicio: previsaoInicio ? dataDe(previsaoInicio) : null } : {}),
      ...(disponivelAPartir !== undefined ? { disponivelAPartir: disponivelAPartir ? dataDe(disponivelAPartir) : null } : {}),
    },
    include: { equipe: true },
  });
  const partes: string[] = [];
  if (nome !== undefined && (antes.nome ?? "") !== (vaga.nome ?? "")) partes.push(`profissional "${antes.nome ?? ""}" → "${vaga.nome ?? ""}"`);
  if (parsed.data.status && antes.status !== vaga.status) partes.push(`status ${antes.status} → ${vaga.status}`);
  if (parsed.data.equipeId && antes.equipeId !== vaga.equipeId) partes.push(`equipe ${antes.equipe.codigo} → ${vaga.equipe.codigo}`);
  if (previsaoInicio !== undefined && diaDe(antes.previsaoInicio) !== diaDe(vaga.previsaoInicio)) partes.push("previsão de início alterada");
  if (contratoAtual !== undefined && (antes.contratoAtual ?? "") !== (vaga.contratoAtual ?? "")) partes.push(`contrato atual "${antes.contratoAtual ?? ""}" → "${vaga.contratoAtual ?? ""}"`);
  if (disponivelAPartir !== undefined && diaDe(antes.disponivelAPartir) !== diaDe(vaga.disponivelAPartir)) partes.push(`livre a partir de ${diaDe(antes.disponivelAPartir) ?? "—"} → ${diaDe(vaga.disponivelAPartir) ?? "—"}`);
  if (destino !== undefined && (antes.destino ?? "") !== (vaga.destino ?? "")) partes.push(`destino previsto "${vaga.destino ?? ""}"`);
  if (parsed.data.direcao4x4 !== undefined && antes.direcao4x4 !== vaga.direcao4x4) partes.push("habilitação 4x4 alterada");
  if (partes.length) await registrar(a.userId, "VAGA_ALTERADA", "VAGA", vaga.id, `Vaga ${vaga.numero ?? ""} (${vaga.cargo}, ${vaga.equipe.codigo}): ${partes.join("; ")}`);
  // troca de profissional na vaga: as reservas ja feitas continuam na VAGA, entao avisa quantas existem
  let alocacoesFuturas = 0;
  if (nome !== undefined && (antes.nome ?? "") !== (vaga.nome ?? "")) {
    alocacoesFuturas = await prisma.efetivoAlocacao.count({ where: { vagaId: vaga.id, fim: { gte: dataDe(new Date().toISOString().slice(0, 10)) } } });
  }
  return NextResponse.json({ vaga, alocacoesFuturas });
}
