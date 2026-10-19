// Leitura (somente leitura) dos titulos EM ABERTO do Senior com o centro de custo de cada um.
// O Senior grava o CC no proprio titulo (E501TCP.CODCCU) so' em parte dos titulos; no restante o CC existe na ORDEM DE COMPRA de origem.
// Regra, sem estimar nada:
//   1. CC do proprio titulo                                    -> origem "titulo"
//   2. senao, CC da OC vinculada (mesmo motor da Programacao de Pagamento, so' vinculo confirmado) quando a OC tem UM so' CC -> origem "oc"
//   3. OC rateada entre varios CCs, ou sem OC/CC                -> sem CC (nao e' atribuido a nenhum contrato)

import type { prisma as prismaReal } from "@/lib/prisma";
import { criarMotorVinculo, aplicarCorrecaoManual } from "@/lib/vinculoOcTitulo";
import type { TituloPrevisao } from "./previsao";

export type OrigemCcu = "titulo" | "oc" | "oc-rateada" | null;
export type TituloAbertoComCcu = Omit<TituloPrevisao, "vencimento"> & { vencimento: string | null; ccu: string | null; origemCcu: OrigemCcu; numOcpVinculada: string | null };

export async function titulosAbertosComCcu(db: typeof prismaReal): Promise<TituloAbertoComCcu[]> {
  const [titulos, ocs, manuais] = await Promise.all([
    db.tituloContasAPagar.findMany({
      where: { pago: false, valorAberto: { gt: 0 } },
      select: { numTit: true, codFil: true, codFor: true, fornecedorNome: true, tipo: true, numOcp: true, filOcp: true, numNfc: true, valorOriginal: true, valorAberto: true, dataEmissao: true, vencimentoProgramado: true, vencimentoOriginal: true, codccu: true, descricao: true, numOcpCorrigido: true },
    }),
    db.aprovacaoSenior.findMany({
      select: { numOcp: true, codFil: true, fornecedorCodigo: true, fornecedorNome: true, valor: true, dataEmissao: true, situacaoAtual: true, usuNumTit: true, usuNumNfc: true, codccu: true, contratoNome: true, temRateio: true, previsaoPagamento: true },
    }),
    db.tituloOcVinculo.findMany(),
  ]);
  const manualDe = new Map(manuais.map((v) => [`${v.numTit}|${v.codFil}|${v.codFor}`, v.numOcp]));
  const ocPorNumero = new Map(ocs.map((o) => [o.numOcp, o]));
  const motor = criarMotorVinculo(ocs);

  return titulos.map((t) => {
    const vencimento = (t.vencimentoProgramado ?? t.vencimentoOriginal)?.toISOString().slice(0, 10) ?? null;
    const base = { numTit: t.numTit, tipo: t.tipo, fornecedorNome: t.fornecedorNome, descricao: t.descricao, numOcp: t.numOcp, numNfc: t.numNfc, vencimento, valorAberto: t.valorAberto };
    if (t.codccu) return { ...base, ccu: t.codccu, origemCcu: "titulo" as const, numOcpVinculada: null };
    const vinculo = aplicarCorrecaoManual({ numOcpCorrigido: manualDe.get(`${t.numTit}|${t.codFil}|${t.codFor}`) ?? t.numOcpCorrigido }, (n) => ocPorNumero.get(n), motor.ocRelacionadaDe(t));
    const numOcpVinculada = vinculo.ocRelacionada?.numOcp ?? null;
    const oc = numOcpVinculada ? ocPorNumero.get(numOcpVinculada) : undefined;
    if (!oc) return { ...base, ccu: null, origemCcu: null, numOcpVinculada };
    if (oc.temRateio) return { ...base, ccu: null, origemCcu: "oc-rateada" as const, numOcpVinculada };
    return { ...base, ccu: oc.codccu ?? null, origemCcu: oc.codccu ? ("oc" as const) : null, numOcpVinculada };
  });
}
