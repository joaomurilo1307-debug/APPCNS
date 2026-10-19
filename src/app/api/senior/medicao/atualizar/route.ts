import { NextResponse } from "next/server";
import { dispararMedicao, estadoMedicao } from "@/lib/medicao/sincronizar";

// Disparo e estado da atualizacao da Medicao para agendadores externos / conferencia: autentica pela chave compartilhada SENIOR_SYNC_KEY,
// como os outros /api/senior/*. Roda em segundo plano e respeita a trava de "uma por vez". O GET devolve tambem o resumo da ultima leitura
// (contratos, itens, conferencia com o Senior, avisos), para conferir o resultado sem abrir a tela.

const nao = () => NextResponse.json({ error: "Nao autorizado" }, { status: 401 });

export async function POST(req: Request) {
  const chave = req.headers.get("x-sync-key");
  if (!chave || chave !== process.env.SENIOR_SYNC_KEY) return nao();
  const forcar = new URL(req.url).searchParams.get("forcar") === "1";
  const r = await dispararMedicao("agendador (chave de sincronização)", { forcar });
  return NextResponse.json({ ...r, estado: await estadoMedicao() });
}

export async function GET(req: Request) {
  const chave = req.headers.get("x-sync-key");
  if (!chave || chave !== process.env.SENIOR_SYNC_KEY) return nao();
  const e = await estadoMedicao();
  return NextResponse.json({
    emCurso: e.emCurso && { etapa: e.emCurso.etapa, progresso: e.emCurso.progresso, iniciadoEm: e.emCurso.iniciadoEm },
    ultimaOk: e.ultimaOk && { finalizadoEm: e.ultimaOk.finalizadoEm, disparadoPor: e.ultimaOk.disparadoPor, resumo: e.ultimaOk.resumo },
    ultimoErro: e.ultimoErro && { finalizadoEm: e.ultimoErro.finalizadoEm, erro: e.ultimoErro.erro },
    dadosVelhos: e.dadosVelhos,
  });
}
