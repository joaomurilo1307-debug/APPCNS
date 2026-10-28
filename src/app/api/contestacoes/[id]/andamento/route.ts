import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { avisar, destinatariosDaRevisao, ehRevisorDeContestacao, registrarEvento } from "@/lib/contestacoesServidor";
import { descricaoDoLancamento } from "@/lib/contestacoes";
import { logAudit } from "@/lib/auditLog";

// Recado de andamento na contestacao (tela Contestacoes), sem mudar o status: o financeiro conta o que esta fazendo ("ajustando no Senior"), quem contestou responde ou complementa.
// Quem escreve nao e' avisado; o outro lado e': o financeiro avisa quem contestou e o indicado; quem contestou avisa o financeiro.
const schema = z.object({ texto: z.string().trim().min(3, "Escreva o recado.").max(2000) });

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  const user = session?.user as any;
  if (!user?.id) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Recado inválido." }, { status: 422 });
  const c = await prisma.contestacaoCusto.findUnique({ where: { id: params.id }, select: { id: true, autorId: true, indicadoId: true, fornecedor: true, numTit: true, numOcp: true, valor: true, ccuNome: true, codccu: true, status: true } });
  if (!c) return NextResponse.json({ error: "Contestação não encontrada" }, { status: 404 });
  const revisor = await ehRevisorDeContestacao(user);
  if (!revisor && c.autorId !== user.id && c.indicadoId !== user.id) return NextResponse.json({ error: "Sem permissão para esta contestação" }, { status: 403 });
  if (c.status === "REALOCADA" || c.status === "REJEITADA") return NextResponse.json({ error: "Esta contestação já foi encerrada." }, { status: 409 });

  await registrarEvento(c.id, { tipo: "NOTA", porNome: user.name ?? "Alguém", texto: parsed.data.texto });
  const quem = user.name ?? "Alguém";
  const resumo = descricaoDoLancamento({ fornecedor: c.fornecedor, numTit: c.numTit, numOcp: c.numOcp, valor: c.valor, ccuNome: c.ccuNome, codccu: c.codccu });
  if (revisor) await avisar([c.autorId, ...(c.indicadoId ? [c.indicadoId] : [])].filter((u) => u !== user.id), { title: "Andamento da sua contestação", body: `${quem}: ${parsed.data.texto} (${resumo})` }, c.id);
  else await avisar((await destinatariosDaRevisao()).filter((u) => u !== user.id), { title: "Recado em uma contestação", body: `${quem}: ${parsed.data.texto} (${resumo})` }, c.id);
  await logAudit({ userId: user.id, action: "contestacao.recado", entityType: "ContestacaoCusto", entityId: c.id, metadata: { revisor } });
  return NextResponse.json({ ok: true });
}
