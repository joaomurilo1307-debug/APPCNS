import { NextResponse } from "next/server";
import { dispararAtualizacao, estadoAtualizacao } from "@/lib/custos/atualizacaoCusto";
import { chaveSyncValida } from "@/lib/senior/chaveSync";

// Mesmo disparo do botao da tela, para agendadores externos (n8n etc.): autentica pela chave compartilhada
// SENIOR_SYNC_KEY, como os outros /api/senior/*. Roda em segundo plano e respeita a trava de "uma por vez".

export async function POST(req: Request) {
  const chave = req.headers.get("x-sync-key");
  if (!chaveSyncValida(chave)) {
    return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });
  }
  const resultado = await dispararAtualizacao("agendador (chave de sincronização)");
  return NextResponse.json({ ...resultado, estado: await estadoAtualizacao() });
}

export async function GET(req: Request) {
  const chave = req.headers.get("x-sync-key");
  if (!chaveSyncValida(chave)) {
    return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });
  }
  return NextResponse.json(await estadoAtualizacao());
}
