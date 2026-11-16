import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { negarSemModulo } from "@/lib/acesso/servidor";
import { estadoDasSincronizacoes } from "@/lib/senior/sincronizacao/execucao";

// Estado da busca de titulos e OCs na Senior (12/11/2026): em andamento (e em que etapa), ultima concluida (quando, quantos)
// e ultima falha. So' horarios, contagens e mensagens -- nenhum dado de pagamento nem credencial.
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const negado = await negarSemModulo(session.user as any, "programacao_pagamento", "pagamentos_itau", "aprovacoes_oc", "aprovacoes_oc_todas", "conferencia_oc");
  if (negado) return negado;
  return NextResponse.json({ fontes: await estadoDasSincronizacoes() }, { headers: { "Cache-Control": "no-store" } });
}
