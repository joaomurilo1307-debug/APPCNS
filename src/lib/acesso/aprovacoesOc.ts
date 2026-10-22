// Aprovacoes de OC NO SERVIDOR: quanto da lista a pessoa enxerga e se ela pode abrir os dados de pagamento. A regra de "envolvido" esta em
// envolvimentoOc.ts (pura); o acesso aos modulos, em servidor.ts.

import { prisma } from "@/lib/prisma";
import { escopoDeCustos, podeVerCcu } from "@/lib/custos/acesso";
import { envolvidoNaOC, filtroGrosseiroDeEnvolvimento } from "./envolvimentoOc";
import { podeAcessarModulo, type UsuarioDaSessao } from "./servidor";

export type EscopoOC = {
  /** a pessoa tem o modulo Aprovacoes de OC (ver todas ou as dela) */
  modulo: boolean;
  /** ve TODAS as OCs (modulo "Aprovacoes de OC: ver todas") */
  todas: boolean;
  /** pode abrir dados de pagamento (titulos, forma de pagamento, boleto/PIX): so' o time financeiro */
  pagamentos: boolean;
  /** CODUSU do Senior que o admin vinculou a esta pessoa (tela Usuarios > Acesso). So' o vinculo manual conta: o de-para automatico
   *  pode estar errado (ex.: quem usa o login de outra pessoa) e um mesmo codigo pode valer para mais de uma pessoa. */
  codigos: string[];
};

const VALIDADE_MS = 60_000;
const guardado = new Map<string, { ate: number; ids: Set<string> }>();

export function limparCacheDeOcs(userId?: string) {
  if (userId) guardado.delete(userId);
  else guardado.clear();
}

export async function codigosSeniorDe(userId: string): Promise<string[]> {
  return (await prisma.vinculoSenior.findMany({ where: { userId }, select: { codigo: true } })).map((v) => v.codigo);
}

export async function escopoAprovacoesOC(usuario: UsuarioDaSessao): Promise<EscopoOC> {
  const [todas, minhas, programacao, itau, conferencia] = await Promise.all([
    podeAcessarModulo(usuario, "aprovacoes_oc_todas"),
    podeAcessarModulo(usuario, "aprovacoes_oc"),
    podeAcessarModulo(usuario, "programacao_pagamento"),
    podeAcessarModulo(usuario, "pagamentos_itau"),
    podeAcessarModulo(usuario, "conferencia_oc"),
  ]);
  const codigos = todas || minhas ? await codigosSeniorDe(usuario.id) : [];
  return { modulo: todas || minhas, todas, pagamentos: programacao || itau || conferencia, codigos };
}

/** Ids das OCs em que a pessoa esta envolvida (consulta grosseira no banco + conferencia exata aqui). Guardado por 60 s. */
export async function idsDeOcsEnvolvidas(userId: string, codigos: string[]): Promise<Set<string>> {
  const agora = Date.now();
  const g = guardado.get(userId);
  if (g && g.ate > agora) return g.ids;
  const filtro = filtroGrosseiroDeEnvolvimento(codigos);
  const ids = new Set<string>();
  if (filtro) {
    const meus = new Set(codigos);
    const candidatas = await prisma.aprovacaoSenior.findMany({
      where: filtro,
      select: { id: true, criadorCod: true, aprovadoresPendentesCod: true, historicoNiveis: true, rateioDetalhe: true },
    });
    for (const o of candidatas) if (envolvidoNaOC(o, meus)) ids.add(o.id);
  }
  guardado.set(userId, { ate: agora + VALIDADE_MS, ids });
  return ids;
}

/**
 * Pode abrir esta OC? Sim se ve todas, se tem o modulo e esta envolvido, ou se a OC e' de um contrato (centro de custo) que a pessoa ja enxerga em
 * Contratos/Custos -- o detalhe da OC abre a partir do custo do contrato.
 */
export async function podeAbrirOC(usuario: UsuarioDaSessao, escopo: EscopoOC, oc: { id: string; codccu: string | null; rateioDetalhe: string | null }): Promise<boolean> {
  if (escopo.todas) return true;
  if (escopo.modulo && (await idsDeOcsEnvolvidas(usuario.id, escopo.codigos)).has(oc.id)) return true;
  if (!(await podeAcessarModulo(usuario, "contratos")) && !(await podeAcessarModulo(usuario, "custos"))) return false;
  const custos = await escopoDeCustos(prisma, usuario);
  const ccus = new Set<string>();
  if (oc.codccu) ccus.add(oc.codccu);
  try {
    const rateio = oc.rateioDetalhe ? JSON.parse(oc.rateioDetalhe) : [];
    if (Array.isArray(rateio)) for (const l of rateio) if (l?.codccu) ccus.add(String(l.codccu));
  } catch {
    // rateio ilegivel: vale so' o centro de custo principal
  }
  return ccus.size > 0 && Array.from(ccus).every((c) => podeVerCcu(custos, c));
}
