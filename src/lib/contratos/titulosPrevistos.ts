// Leitura (somente leitura) dos titulos do Senior ja ligados ao centro de custo de cada um. Alimenta a Previsao (titulos em aberto) e o
// "Ao vivo" (todos os titulos, pagos ou nao). A regra de a que CC pertence cada titulo esta em centrosDoTitulo.ts:
// rateio do Senior (E501RAT) > CC do proprio titulo > CC da OC vinculada (so' OC de um unico CC). Nada e' estimado.

import type { prisma as prismaReal } from "@/lib/prisma";
import { criarMotorVinculo, aplicarCorrecaoManual, type OcParaVinculo } from "@/lib/vinculoOcTitulo";
import { centrosDoTitulo, repartirValor } from "./centrosDoTitulo";
import { chaveDoTitulo } from "./rateioTitulos";
import { ocsAindaSemTitulo } from "./ocsDoCentro";
import type { TituloPrevisao } from "./previsao";

export type OrigemCcu = "rateio" | "titulo" | "oc" | "oc-rateada" | null;

export type TituloComCentro = Omit<TituloPrevisao, "vencimento" | "origemCcu"> & {
  id: string;
  codFil: string;
  codFor: string;
  pago: boolean;
  dataEmissao: string;
  dataLancamento: string | null;
  dataPagamento: string | null;
  vencimento: string | null;
  valorOriginal: number; // parte deste centro de custo
  ccu: string | null;
  ctaFin: string | null; // linha de custo (conta financeira) quando o Senior informa
  origemCcu: OrigemCcu;
  ocSituacao: string | null;
};

/** Compatibilidade: a Previsao usa so' os titulos em aberto, com valorAberto ja repartido por centro de custo. */
export type TituloAbertoComCcu = TituloComCentro;

const dia = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : null);

export type OcLeve = OcParaVinculo;

export async function lancamentosDeTitulos(db: typeof prismaReal, opcoes: { somenteAbertos: boolean }): Promise<{ itens: TituloComCentro[]; ocs: OcLeve[]; ocsVinculadas: Set<string> }> {
  const [titulos, ocs, manuais, rateios] = await Promise.all([
    db.tituloContasAPagar.findMany({
      where: opcoes.somenteAbertos ? { pago: false, valorAberto: { gt: 0 } } : {},
      select: { id: true, numTit: true, codFil: true, codFor: true, fornecedorNome: true, tipo: true, numOcp: true, filOcp: true, numNfc: true, pago: true, dataEmissao: true, dataLancamento: true, dataPagamento: true, vencimentoProgramado: true, vencimentoOriginal: true, valorOriginal: true, valorAberto: true, codccu: true, descricao: true, numOcpCorrigido: true },
    }),
    db.aprovacaoSenior.findMany({
      select: { numOcp: true, codFil: true, fornecedorCodigo: true, fornecedorNome: true, valor: true, dataEmissao: true, situacaoAtual: true, usuNumTit: true, usuNumNfc: true, codccu: true, contratoNome: true, temRateio: true, previsaoPagamento: true },
    }),
    db.tituloOcVinculo.findMany(),
    db.tituloRateioSenior.findMany({ select: { numTit: true, codFil: true, codTpt: true, codFor: true, codccu: true, ctaFin: true, valor: true } }),
  ]);
  const manualDe = new Map(manuais.map((v) => [`${v.numTit}|${v.codFil}|${v.codFor}`, v.numOcp]));
  const ocPorNumero = new Map(ocs.map((o) => [o.numOcp, o]));
  const motor = criarMotorVinculo(ocs);
  const rateioDe = new Map<string, { codccu: string; ctaFin: string; valor: number }[]>();
  for (const r of rateios) {
    const k = chaveDoTitulo(r);
    const l = rateioDe.get(k);
    if (l) l.push(r);
    else rateioDe.set(k, [r]);
  }

  const itens: TituloComCentro[] = [];
  const ocsVinculadas = new Set<string>();
  for (const t of titulos) {
    const vinculo = aplicarCorrecaoManual({ numOcpCorrigido: manualDe.get(`${t.numTit}|${t.codFil}|${t.codFor}`) ?? t.numOcpCorrigido }, (n) => ocPorNumero.get(n), motor.ocRelacionadaDe(t));
    const numOcpVinculada = vinculo.ocRelacionada?.numOcp ?? null;
    if (numOcpVinculada) ocsVinculadas.add(numOcpVinculada);
    const oc = numOcpVinculada ? ocPorNumero.get(numOcpVinculada) : undefined;

    const { linhas, semCentro } = centrosDoTitulo({
      codccuTitulo: t.codccu,
      rateio: rateioDe.get(chaveDoTitulo({ numTit: t.numTit, codFil: t.codFil, codTpt: t.tipo, codFor: t.codFor })) ?? [],
      oc: oc ? { codccu: oc.codccu, temRateio: oc.temRateio } : null,
    });
    const base = {
      id: t.id, numTit: t.numTit, codFil: t.codFil, codFor: t.codFor, tipo: t.tipo, fornecedorNome: t.fornecedorNome, descricao: t.descricao, numOcp: t.numOcp, numNfc: t.numNfc,
      pago: t.pago, dataEmissao: dia(t.dataEmissao) as string, dataLancamento: dia(t.dataLancamento), dataPagamento: dia(t.dataPagamento), vencimento: dia(t.vencimentoProgramado ?? t.vencimentoOriginal),
      numOcpVinculada, ocSituacao: oc?.situacaoAtual ?? null,
    };
    if (linhas.length === 0) {
      itens.push({ ...base, valorOriginal: t.valorOriginal, valorAberto: t.valorAberto, ccu: null, ctaFin: null, origemCcu: semCentro });
      continue;
    }
    const props = linhas.map((l) => l.proporcao);
    const abertos = repartirValor(t.valorAberto, props);
    const originais = repartirValor(t.valorOriginal, props);
    linhas.forEach((l, i) => itens.push({ ...base, valorOriginal: originais[i], valorAberto: abertos[i], ccu: l.ccu, ctaFin: l.ctaFin, origemCcu: l.origem }));
  }
  return { itens, ocs, ocsVinculadas };
}

/** Titulos em aberto, um por (titulo x centro de custo). Os que nao tem centro de custo vem com ccu = null. */
export async function titulosAbertosComCcu(db: typeof prismaReal): Promise<TituloAbertoComCcu[]> {
  return (await lancamentosDeTitulos(db, { somenteAbertos: true })).itens;
}

/**
 * Tudo que o Senior tem PREVISTO: titulos em aberto (recorrentes/PRV, parcelas, compras) + OCs em analise ou aprovadas que ainda nao viraram
 * titulo (programadas). Cada linha ja vem ligada ao centro de custo e a linha de custo.
 */
export async function itensDePrevisao(db: typeof prismaReal): Promise<TituloAbertoComCcu[]> {
  const { itens, ocsVinculadas } = await lancamentosDeTitulos(db, { somenteAbertos: true });
  const { itens: ocs } = await ocsAindaSemTitulo(db, ocsVinculadas, { soEmAndamento: true });
  for (const o of ocs) {
    itens.push({
      id: `oc-${o.numOcp}-${o.ccu}-${o.ctaFin ?? ""}`, numTit: `OC ${o.numOcp}`, codFil: "", codFor: "", tipo: "OC", fornecedorNome: o.fornecedor, descricao: o.descricao, numOcp: o.numOcp, numNfc: null,
      pago: false, dataEmissao: o.dataEmissao, dataLancamento: null, dataPagamento: null, vencimento: o.previsaoPagamento, valorOriginal: o.valor, valorAberto: o.valor,
      ccu: o.ccu, ctaFin: o.ctaFin, origemCcu: "oc", numOcpVinculada: o.numOcp, ocSituacao: o.situacaoAtual,
    });
  }
  return itens;
}
