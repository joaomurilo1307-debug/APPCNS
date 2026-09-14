import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Rota de diagnostico TEMPORARIA (14/09/2026) -- verificacao final pos-fix
// do bug de aprovador desligado sem marcacao. Remover depois de confirmar.
export async function GET(req: Request) {
  const chave = req.headers.get("x-sync-key");
  if (!chave || chave !== process.env.SENIOR_SYNC_KEY) {
    return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });
  }
  const url = new URL(req.url);
  const termo = (url.searchParams.get("q") || "ceccon").toLowerCase();

  const todas = await prisma.aprovacaoSenior.findMany({
    select: {
      numOcp: true,
      fornecedorNome: true,
      situacaoAtual: true,
      aprovadoresPendentes: true,
      rateioDetalhe: true,
      ultimaSincEm: true,
    },
  });

  const bate = (v: string | null | undefined) => (v || "").toLowerCase().includes(termo);
  const encontradas = todas.filter((a) => bate(a.fornecedorNome) || bate(a.aprovadoresPendentes) || bate(a.rateioDetalhe));

  return NextResponse.json({ encontradas: encontradas.length, itens: encontradas.slice(0, 15) });
}
