import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { negarSemModulo } from "@/lib/acesso/servidor";
import { iniciarSincronizacao } from "@/lib/senior/sincronizacao/execucao";

// Botao "Atualizar agora" da Programacao de Pagamento (pedido do Joao 16/09/2026). Ate 11/11/2026 disparava um webhook do n8n
// que rodava sincronizar_titulos_pagar.py no VPS e voltava sem saber se algo ia chegar; desde 12/11/2026 o proprio sistema
// busca os titulos na Senior (src/lib/senior/sincronizacao/). Volta na hora com o inicio da busca; a tela acompanha o
// resultado em GET /api/senior/sincronizacao. Clique no meio de uma busca acompanha a que ja esta rodando.
export async function POST() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const negado = await negarSemModulo(session.user as any, "programacao_pagamento", "pagamentos_itau");
  if (negado) return negado;

  const r = iniciarSincronizacao("titulos", "BOTAO", (session.user as any)?.name ?? null);
  return NextResponse.json({ ok: true, fonte: "titulos", iniciadaEm: r.iniciadaEm.toISOString(), jaEmAndamento: r.jaEmAndamento }, { status: 202 });
}
