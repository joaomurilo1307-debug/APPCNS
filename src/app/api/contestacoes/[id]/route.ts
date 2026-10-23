import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { notificacaoDecisao, validarDecisao, type StatusContestacao } from "@/lib/contestacoes";
import { avisar, ehRevisorDeContestacao } from "@/lib/contestacoesServidor";
import { logAudit } from "@/lib/auditLog";

// Decisao do financeiro sobre uma contestacao de custo. Aceitar NAO altera o Senior: registra a decisao e o financeiro ajusta o lancamento la.
const schema = z.object({ status: z.enum(["ACEITA", "REJEITADA"]), parecer: z.string().trim().max(4000).nullable().optional() });

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  const user = session?.user as any;
  if (!user?.id) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  if (!(await ehRevisorDeContestacao(user))) return NextResponse.json({ error: "Só o financeiro decide contestações de custo" }, { status: 403 });

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Decisão inválida." }, { status: 422 });
  const c = await prisma.contestacaoCusto.findUnique({ where: { id: params.id } });
  if (!c) return NextResponse.json({ error: "Contestação não encontrada" }, { status: 404 });
  const erro = validarDecisao(c.status, parsed.data.status, parsed.data.parecer);
  if (erro) return NextResponse.json({ error: erro }, { status: c.status === "PENDENTE" ? 422 : 409 });

  const atual = await prisma.contestacaoCusto.update({
    where: { id: c.id },
    data: { status: parsed.data.status, parecer: parsed.data.parecer || null, decididoPorId: user.id, decididoEm: new Date() },
    select: { id: true, status: true },
  });
  const aviso = notificacaoDecisao(
    { fornecedor: c.fornecedor, numTit: c.numTit, numOcp: c.numOcp, valor: c.valor, ccuNome: c.ccuNome, codccu: c.codccu },
    parsed.data.status as StatusContestacao, user.name ?? "O financeiro", parsed.data.parecer
  );
  await avisar([c.autorId, ...(c.indicadoId ? [c.indicadoId] : [])].filter((id) => id !== user.id), aviso);
  await logAudit({ userId: user.id, action: `contestacao.${parsed.data.status === "ACEITA" ? "aceitar" : "rejeitar"}`, entityType: "ContestacaoCusto", entityId: c.id, metadata: { chave: c.chave, codccu: c.codccu } });
  return NextResponse.json(atual);
}
