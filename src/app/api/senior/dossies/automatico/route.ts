import { NextResponse } from "next/server";
import { dispararCiclo, estadoAutomatico } from "@/lib/dossie/automatico";

// Mesmo estado/disparo de /api/dossies/automatico para monitores e agendadores externos: autentica pela chave
// compartilhada SENIOR_SYNC_KEY, como os outros /api/senior/*. Serve para conferir de fora se a geracao automatica
// esta viva (campo ultimo.terminouEm) e quantas OCs seguem sem dossie (pendentes.length).

function naoAutorizado(req: Request) {
  const chave = req.headers.get("x-sync-key");
  return !chave || chave !== process.env.SENIOR_SYNC_KEY;
}

export async function GET(req: Request) {
  if (naoAutorizado(req)) return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });
  return NextResponse.json(estadoAutomatico());
}

export async function POST(req: Request) {
  if (naoAutorizado(req)) return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });
  const { iniciado } = dispararCiclo("chave de sincronização");
  return NextResponse.json({ iniciado, ...estadoAutomatico() }, { status: 202 });
}
