import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { negarSemModulo } from "@/lib/acesso/servidor";
import { calcularAlertas, notificarAlertas } from "@/lib/financeiro/alertas";

// Alertas do financeiro (tela). Ao abrir, tambem dispara as notificacoes do sino que ainda nao foram enviadas.


export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const negado = await negarSemModulo(session.user as any, "alertas_financeiro");
  if (negado) return negado;
  try {
    const alertas = await calcularAlertas(new URL(req.url).searchParams.get("atualizar") === "1");
    await notificarAlertas(alertas);
    return NextResponse.json(alertas);
  } catch (e) {
    return NextResponse.json({ error: `Não foi possível calcular os alertas: ${(e as Error).message}` }, { status: 502 });
  }
}
