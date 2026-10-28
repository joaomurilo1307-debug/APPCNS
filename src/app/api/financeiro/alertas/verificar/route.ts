import { NextResponse } from "next/server";
import { calcularAlertas, notificarAlertas } from "@/lib/financeiro/alertas";
import { chaveSyncValida } from "@/lib/senior/chaveSync";

// Gatilho para um cron (n8n): POST com o header x-sync-key. Calcula e envia as notificacoes pendentes,
// sem precisar de ninguem com a tela aberta.

export async function POST(req: Request) {
  const chave = req.headers.get("x-sync-key");
  if (!chaveSyncValida(chave)) {
    return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });
  }
  try {
    const a = await calcularAlertas(true);
    const notificacoes = await notificarAlertas(a);
    return NextResponse.json({
      notificacoes,
      notasNovas: a.notasNovas.length,
      notasVencidas: a.notasVencidas.length,
      notasVencendo: a.notasVencendo.length,
      titulosVencidos: a.titulosVencidos.length,
      titulosVencendo: a.titulosVencendo.length,
      avisos: a.avisos,
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
