// Leitura do banco para a planilha de despesas reembolsaveis (ver reembolsaveis.ts). SOMENTE LEITURA. Junta as BAIXAS do mes em contas reembolsaveis
// (CustoFinanceiroDetalhe: a mesma base e regra v2 do Custo por Contrato e do "Pagos / semana") com os dados do titulo (CPF/CNPJ do prestador, emissao, descricao).

import type { prisma as prismaReal } from "@/lib/prisma";
import { codigoPeloNome, eReembolsavel } from "@/lib/custos/planoContas";
import { chaveDoTexto, lerTextosFaltantes, type ChaveTexto } from "@/lib/senior/textoDosTitulos";
import type { EntradaReembolso } from "./reembolsaveis";

export type DadosReembolsaveis = { entradas: EntradaReembolso[]; textosPendentes: number; atualizadoEm: { custo: string | null; titulos: string | null } };

const dia = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : null);

function mesSeguinte(mes: string): string {
  const [a, m] = mes.split("-").map(Number);
  const d = new Date(Date.UTC(a, m, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-01`;
}

export async function carregarReembolsaveis(db: typeof prismaReal, mes: string): Promise<DadosReembolsaveis> {
  const de = new Date(`${mes}-01T00:00:00.000Z`);
  const ate = new Date(`${mesSeguinte(mes)}T00:00:00.000Z`);
  const [baixas, ultimoCusto, ultimoTitulo] = await Promise.all([
    db.custoFinanceiroDetalhe.findMany({
      where: { dataPagamento: { gte: de, lt: ate } },
      select: { codccu: true, contaFinanceira: true, numTit: true, codFor: true, codTpt: true, fornecedorNome: true, dataPagamento: true, valorRateado: true },
    }),
    db.atualizacaoCusto.findFirst({ where: { status: "OK" }, orderBy: { finalizadoEm: "desc" }, select: { finalizadoEm: true } }),
    db.tituloContasAPagar.aggregate({ _max: { atualizadoEm: true } }),
  ]);
  // so' contas reembolsaveis: a antiga (67/179) e as "R - ..." do plano novo
  const reemb = baixas.filter((b) => {
    const cod = codigoPeloNome(b.contaFinanceira);
    return cod !== null && eReembolsavel(cod);
  });
  const numeros = Array.from(new Set(reemb.map((b) => b.numTit)));
  const fornecedores = Array.from(new Set(reemb.map((b) => b.codFor)));
  const titulos = numeros.length
    ? await db.tituloContasAPagar.findMany({
        where: { numTit: { in: numeros }, codFor: { in: fornecedores } },
        select: { numTit: true, codFor: true, tipo: true, documentoFavorecido: true, descricao: true, dataEmissao: true },
      })
    : [];
  const tituloPor = new Map(titulos.map((t) => [`${t.numTit}|${t.codFor}|${t.tipo}`, t]));
  // texto do titulo no Senior (OBSTCP): o que o sistema ja tem do titulo, senao o que ja foi lido para esta planilha; o que falta e' lido do Senior em segundo plano
  const guardados = numeros.length ? await db.tituloTexto.findMany({ where: { numTit: { in: numeros }, codFor: { in: fornecedores } }, select: { numTit: true, codFor: true, tipo: true, texto: true } }) : [];
  const textoPor = new Map(guardados.map((g) => [chaveDoTexto(g), g.texto]));
  const faltam = new Map<string, ChaveTexto>();
  for (const b of reemb) {
    const chave = { numTit: b.numTit, codFor: b.codFor, tipo: b.codTpt ?? "" };
    if (!tituloPor.get(`${b.numTit}|${b.codFor}|${b.codTpt ?? ""}`)?.descricao && !textoPor.has(chaveDoTexto(chave))) faltam.set(chaveDoTexto(chave), chave);
  }
  if (faltam.size > 0) void lerTextosFaltantes(db, Array.from(faltam.values()));
  const entradas: EntradaReembolso[] = reemb.map((b) => {
    const t = tituloPor.get(`${b.numTit}|${b.codFor}|${b.codTpt ?? ""}`);
    return {
      ccu: b.codccu, conta: b.contaFinanceira, codConta: codigoPeloNome(b.contaFinanceira), numTit: b.numTit, tipoTitulo: b.codTpt, codFor: b.codFor, fornecedor: b.fornecedorNome ?? `código ${b.codFor}`,
      documento: t?.documentoFavorecido ?? null, valor: b.valorRateado, dataPagamento: dia(b.dataPagamento) as string, dataRealizacao: dia(t?.dataEmissao), descricao: t?.descricao || textoPor.get(chaveDoTexto({ numTit: b.numTit, codFor: b.codFor, tipo: b.codTpt ?? "" })) || null,
    };
  });
  return { entradas, textosPendentes: faltam.size, atualizadoEm: { custo: ultimoCusto?.finalizadoEm?.toISOString() ?? null, titulos: ultimoTitulo._max.atualizadoEm?.toISOString() ?? null } };
}
