import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { dispararMedicao, estadoMedicao } from "@/lib/medicao/sincronizar";

// Botao "Atualizar" da Medicao: le o Senior de novo em segundo plano (so' leitura). Quem pode ver a Medicao pode pedir a atualizacao.

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const e = await estadoMedicao();
  return NextResponse.json({
    emCurso: e.emCurso && { etapa: e.emCurso.etapa, progresso: e.emCurso.progresso },
    ultimaOk: e.ultimaOk?.finalizadoEm ?? null,
    erro: e.ultimoErro?.erro ?? null,
    dadosVelhos: e.dadosVelhos,
  });
}

export async function POST() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const r = await dispararMedicao(`${(session.user as any).name ?? "usuário"} (botão Atualizar)`);
  return NextResponse.json(r);
}
