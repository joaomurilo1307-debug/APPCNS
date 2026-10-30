// Cache em memoria das OCs do Senior e do motor de vinculo Titulo<->OC. Antes, cada abertura da Programacao de Pagamento (e agora da Previsao e do
// Ao vivo) lia as ~12 mil OCs e remontava os indices do motor -- trabalho de CPU repetido a cada requisicao, num servidor de 1 CPU.
// As OCs so' mudam quando o sincronismo atualiza (ultimaSincEm e' @updatedAt), entao a "versao" abaixo (ultima atualizacao + quantidade) basta
// para saber se o cache ainda vale. Uma consulta de agregado barata substitui a leitura inteira. Se a versao mudar, recarrega.

import type { prisma as prismaReal } from "@/lib/prisma";
import { criarMotorVinculo, type OcParaVinculo } from "@/lib/vinculoOcTitulo";
import { carregarVinculosOc } from "@/lib/senior/vinculosOc";

export type MotorDeOcs = {
  versao: string;
  ocs: OcParaVinculo[];
  ocPorNumero: Map<string, OcParaVinculo>;
  motor: ReturnType<typeof criarMotorVinculo>;
};

let guardado: MotorDeOcs | null = null;
let carregando: Promise<MotorDeOcs> | null = null; // varias requisicoes juntas esperam a mesma leitura

export async function motorDeOcs(db: typeof prismaReal): Promise<MotorDeOcs> {
  const agg = await db.aprovacaoSenior.aggregate({ _max: { ultimaSincEm: true }, _count: { _all: true } });
  const vinc = await db.vinculoOcSenior.aggregate({ _max: { atualizadoEm: true }, _count: { _all: true } });
  const versao = `${agg._max.ultimaSincEm?.getTime() ?? 0}|${agg._count._all}|v${vinc._max.atualizadoEm?.getTime() ?? 0}|${vinc._count._all}`;
  if (guardado && guardado.versao === versao) return guardado;
  if (carregando) return carregando;
  carregando = (async () => {
    const ocs = await db.aprovacaoSenior.findMany({
      select: { numOcp: true, codFil: true, fornecedorCodigo: true, fornecedorNome: true, valor: true, dataEmissao: true, situacaoAtual: true, usuNumTit: true, usuNumNfc: true, codccu: true, contratoNome: true, temRateio: true, previsaoPagamento: true },
    });
    const vinculos = await carregarVinculosOc(db);
    const novo: MotorDeOcs = { versao, ocs, ocPorNumero: new Map(ocs.map((o) => [o.numOcp, o])), motor: criarMotorVinculo(ocs, vinculos) };
    guardado = novo;
    return novo;
  })().finally(() => {
    carregando = null;
  });
  return carregando;
}
