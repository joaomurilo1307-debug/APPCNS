import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { negarSemModulo } from "@/lib/acesso/servidor";
import { dispararCiclo, estadoAutomatico, opcoesPadrao } from "@/lib/dossie/automatico";

// Geracao automatica de dossies (lib/dossie/automatico.ts): estado da ultima verificacao e "verificar agora".
// GET devolve a cobertura (quantas OCs precisam de dossie, quantas estao em dia e o que falta, com o motivo);
// POST dispara um ciclo em segundo plano (nunca dois ao mesmo tempo).


export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const negado = await negarSemModulo(session.user as any, "conferencia_oc", "programacao_pagamento");
  if (negado) return negado;
  const { diasAtras, diasFrente, diasAtrasPagas, lote } = opcoesPadrao();
  return NextResponse.json({ ...estadoAutomatico(), politica: { diasAtras, diasFrente, diasAtrasPagas, lote, janela: "segunda a sábado, 06h às 21h59", intervaloMin: 5 } });
}

export async function POST() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const negado = await negarSemModulo(session.user as any, "conferencia_oc", "programacao_pagamento");
  if (negado) return negado;
  const { iniciado } = dispararCiclo(`manual (${(session.user as any).name ?? "usuário"})`);
  return NextResponse.json({ iniciado, ...estadoAutomatico() }, { status: 202 });
}
