import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { calcularAlertas, notificarAlertas } from "@/lib/financeiro/alertas";

// Alertas do financeiro (tela). Ao abrir, tambem dispara as notificacoes do sino que ainda nao foram enviadas.

const PAPEIS = ["ADMIN", "DIRETOR", "GESTOR_PROJETO", "APROVADOR"];

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  if (!PAPEIS.includes((session.user as any).role)) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  try {
    const alertas = await calcularAlertas(new URL(req.url).searchParams.get("atualizar") === "1");
    await notificarAlertas(alertas);
    return NextResponse.json(alertas);
  } catch (e) {
    return NextResponse.json({ error: `Não foi possível calcular os alertas: ${(e as Error).message}` }, { status: 502 });
  }
}
