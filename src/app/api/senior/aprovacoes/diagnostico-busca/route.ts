import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Rota de diagnostico TEMPORARIA (14/09/2026) -- investigar reclamacao do
// Joao de que "gabriel.ceccon" aparece como aprovador sem estar marcado
// "(desligado)". Remover depois de identificar a causa.
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
      dataEmissao: true,
      fornecedorCodigo: true,
      fornecedorNome: true,
      valor: true,
      situacaoAtual: true,
      criadorCod: true,
      criadorNome: true,
      aprovadoresPendentes: true,
      aprovadoresPendentesCod: true,
      proximoAprovadorCod: true,
      proximoAprovadorNome: true,
      rateioDetalhe: true,
      historicoNiveis: true,
      niveisExigidos: true,
      niveisAprovados: true,
      temRateio: true,
      contratoTexto: true,
      codccu: true,
      usuNumTit: true,
      ultimaSincEm: true,
      primeiraDeteccaoEm: true,
    },
  });

  const bate = (v: string | null | undefined) => (v || "").toLowerCase().includes(termo);

  const encontradas = todas.filter(
    (a) =>
      bate(a.fornecedorNome) ||
      bate(a.criadorNome) ||
      bate(a.aprovadoresPendentes) ||
      bate(a.proximoAprovadorNome) ||
      bate(a.rateioDetalhe) ||
      bate(a.historicoNiveis)
  );

  return NextResponse.json({
    totalAprovacoes: todas.length,
    encontradas: encontradas.length,
    itens: encontradas.slice(0, 15),
  });
}
