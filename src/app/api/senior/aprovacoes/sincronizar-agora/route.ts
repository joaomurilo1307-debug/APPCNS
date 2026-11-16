import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { negarSemModulo } from "@/lib/acesso/servidor";
import { iniciarSincronizacao } from "@/lib/senior/sincronizacao/execucao";

// Botao "Atualizar agora" das telas de OC (pedido do Joao 15/09/2026). Ate 11/11/2026 disparava um webhook do n8n que rodava
// sincronizar_aprovacoes_senior.py no VPS e voltava sem saber se algo ia chegar; desde 12/11/2026 o proprio sistema busca as
// OCs na Senior (src/lib/senior/sincronizacao/). Volta na hora com o inicio da busca; a tela acompanha o resultado em
// GET /api/senior/sincronizacao. Clique no meio de uma busca acompanha a que ja esta rodando.
export async function POST() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const user = session.user as any;

  const negado = await negarSemModulo(user, "aprovacoes_oc", "aprovacoes_oc_todas", "programacao_pagamento", "conferencia_oc");
  if (negado) return negado;

  const r = iniciarSincronizacao("ocs", "BOTAO", user?.name ?? null);
  return NextResponse.json({ ok: true, fonte: "ocs", iniciadaEm: r.iniciadaEm.toISOString(), jaEmAndamento: r.jaEmAndamento }, { status: 202 });
}
