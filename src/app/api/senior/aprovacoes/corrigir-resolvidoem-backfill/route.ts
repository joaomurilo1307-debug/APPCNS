import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Correcao ÚNICA (14/09/2026) de um bug real do backfill-titulos: OCs
// historicas criadas por aquele backfill ganharam resolvidoEm=new Date()
// (a data do backfill, HOJE) em vez de null (nao sabemos a data real de
// resolucao) -- inflou "resolvidas recentemente" com ~8.700 OCs fantasma e
// quebrou o requery do sync (ORA-01795, limite de 1000 itens no IN do
// Oracle). Corrige só as linhas com a ASSINATURA exata de terem sido criadas
// pelo backfill (nunca tocadas pelo sync completo -- sem rateioDetalhe nem
// criadorCod) E resolvidoEm no dia do backfill. Remover esta rota depois de
// rodar uma vez e confirmar.
export async function POST(req: Request) {
  const chave = req.headers.get("x-sync-key");
  if (!chave || chave !== process.env.SENIOR_SYNC_KEY) {
    return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });
  }

  const inicioBackfill = new Date("2026-09-14T00:00:00.000Z");

  const candidatas = await prisma.aprovacaoSenior.findMany({
    where: {
      resolvidoEm: { gte: inicioBackfill },
      rateioDetalhe: null,
      criadorCod: null,
      aprovadoresPendentes: null,
    },
    select: { id: true, numOcp: true, dataEmissao: true },
  });

  let corrigidas = 0;
  for (let i = 0; i < candidatas.length; i += 100) {
    const lote = candidatas.slice(i, i + 100);
    await Promise.all(
      lote.map((c) =>
        prisma.aprovacaoSenior.update({ where: { id: c.id }, data: { resolvidoEm: null } })
      )
    );
    corrigidas += lote.length;
  }

  return NextResponse.json({ ok: true, encontradas: candidatas.length, corrigidas });
}
