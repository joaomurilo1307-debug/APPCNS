import type { Prisma } from "@prisma/client";

export type MetadadosRetorno = {
  versao: 1; remessaIds: string[]; naoReconhecidos: string[]; resumoStatus: Record<string, number>;
};

export function metadadosRetorno(resultado: Prisma.JsonValue | null, remessaId: string | null): MetadadosRetorno {
  if (resultado && typeof resultado === "object" && !Array.isArray(resultado) && resultado.versao === 1) {
    return resultado as unknown as MetadadosRetorno;
  }
  return { versao: 1, remessaIds: remessaId ? [remessaId] : [], naoReconhecidos: [], resumoStatus: {} };
}

export async function remessasDoRetorno(db: Pick<Prisma.TransactionClient, "remessaPagamento">, ids: string[]) {
  const remessas = await db.remessaPagamento.findMany({ where: { id: { in: [...new Set(ids)] } }, select: {
    id: true, nomeArquivo: true, contaBancaria: { select: { numCcoSenior: true } }, itens: { select: {
      status: true, tituloId: true, dataEfetivacao: true, valorEfetivado: true, baixaSeniorStatus: true,
    } },
  } });
  return remessas.map(r => ({
    id: r.id, nomeArquivo: r.nomeArquivo, contaNumCcoSenior: r.contaBancaria.numCcoSenior,
    qtdProntos: r.itens.filter(i => i.status === "PAGO" && i.tituloId && i.dataEfetivacao && i.valorEfetivado && !["ENVIADA", "JA_BAIXADO", "EM_PROCESSAMENTO", "INDETERMINADO"].includes(i.baixaSeniorStatus ?? "")).length,
    qtdConferir: r.itens.filter(i => ["EM_PROCESSAMENTO", "INDETERMINADO"].includes(i.baixaSeniorStatus ?? "")).length,
    qtdConcluidos: r.itens.filter(i => ["ENVIADA", "JA_BAIXADO"].includes(i.baixaSeniorStatus ?? "")).length,
  }));
}
