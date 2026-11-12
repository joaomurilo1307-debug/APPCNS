import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { itemOcSchema, processarAprovacoes } from "@/lib/senior/sincronizacao/aprovacoes";
import { comTravaDeGravacao, registrarRecebimentoExterno } from "@/lib/senior/sincronizacao/execucao";

// Entrada das Ordens de Compra enviadas de FORA do sistema -- o script sincronizar_aprovacoes_senior.py do VPS, disparado pelo
// n8n -- autenticada pela SENIOR_SYNC_KEY. Desde 12/11/2026 o proprio sistema busca as OCs na Senior
// (src/lib/senior/sincronizacao/), com a MESMA gravacao usada aqui (processarAprovacoes: upsert por numOcp, evento a cada
// mudanca de situacao, notificacao de OC nova pendente, resolvidoEm quando sai de ANA/PRE). Fica para o envio externo ate o
// n8n ser desligado. O GET abaixo continua servindo ao script (lista do que o sistema acompanha).

const bodySchema = z.object({ itens: z.array(itemOcSchema) });

export async function POST(req: Request) {
  const chave = req.headers.get("x-sync-key");
  if (!chave || chave !== process.env.SENIOR_SYNC_KEY) {
    return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Payload invalido", detalhes: parsed.error.flatten() }, { status: 422 });
  }

  const r = await comTravaDeGravacao("ocs", () => processarAprovacoes(parsed.data.itens));
  await registrarRecebimentoExterno("ocs", r.totalRecebido);
  return NextResponse.json({ ok: true, ...r });
}

export async function GET(req: Request) {
  const chave = req.headers.get("x-sync-key");
  if (!chave || chave !== process.env.SENIOR_SYNC_KEY) {
    return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });
  }
  const pendentesRows = await prisma.aprovacaoSenior.findMany({
    where: { situacaoAtual: { in: ["ANA", "PRE"] } },
    select: { numOcp: true },
  });
  // resolvidas nos ultimos 30 dias -- o sync re-puxa elas uma vez pra
  // corrigir dados que foram gravados antes de um ajuste na regra
  const trintaDiasAtras = new Date(Date.now() - 30 * 86400000);
  const resolvidasRows = await prisma.aprovacaoSenior.findMany({
    where: { resolvidoEm: { gte: trintaDiasAtras } },
    select: { numOcp: true },
  });
  const pendentes = pendentesRows.length;
  const total = await prisma.aprovacaoSenior.count();
  return NextResponse.json({
    pendentes,
    total,
    pendentesNumOcp: pendentesRows.map((r) => r.numOcp),
    resolvidosRecentesNumOcp: resolvidasRows.map((r) => r.numOcp),
  });
}
