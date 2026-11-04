// Leitura do banco para a planilha de despesas reembolsaveis (ver reembolsaveis.ts). SOMENTE LEITURA. A regra e' a da planilha da Cristina (conferida nota a nota
// com a de set/2026 da MRN 3687 LT): as NOTAS (titulos) cujo rateio de entrada no Senior cai numa conta reembolsavel e cujo VENCIMENTO esta no mes, pagas ou em aberto.
// O valor de cada linha e' o rateio da nota naquele centro de custo e conta (E501RAT, transacoes de entrada; previsao PRV nao entra).

import type { prisma as prismaReal } from "@/lib/prisma";
import { eReembolsavel, nomeConta } from "@/lib/custos/planoContas";
import { PLANO_SENIOR } from "@/lib/custos/planoContasSenior";
import { TRANSACOES_DE_ENTRADA } from "@/lib/custos/motorCustoContrato";
import { chaveDoTexto, lerTextosFaltantes, type ChaveTexto } from "@/lib/senior/textoDosTitulos";
import type { EntradaReembolso } from "./reembolsaveis";

export type DadosReembolsaveis = { entradas: EntradaReembolso[]; textosPendentes: number; atualizadoEm: { custo: string | null; titulos: string | null } };

const dia = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : null);
const CONTAS_REEMBOLSAVEIS: string[] = PLANO_SENIOR.map((c) => c[0]).filter((cod) => eReembolsavel(cod)).map(String);

function mesSeguinte(mes: string): string {
  const [a, m] = mes.split("-").map(Number);
  const d = new Date(Date.UTC(a, m, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-01`;
}

export async function carregarReembolsaveis(db: typeof prismaReal, mes: string): Promise<DadosReembolsaveis> {
  const de = new Date(`${mes}-01T00:00:00.000Z`);
  const ate = new Date(`${mesSeguinte(mes)}T00:00:00.000Z`);
  const [titulos, rateios, ultimoCusto, ultimoTitulo] = await Promise.all([
    // notas que vencem no mes (programado; sem programado, o original) e as emitidas no mes (as que so' vencem no mes seguinte formam o grupo a parte)
    db.tituloContasAPagar.findMany({
      where: {
        tipo: { not: "PRV" },
        OR: [
          { vencimentoProgramado: { gte: de, lt: ate } },
          { vencimentoProgramado: null, vencimentoOriginal: { gte: de, lt: ate } },
          { dataEmissao: { gte: de, lt: ate } },
        ],
      },
      select: { numTit: true, codFil: true, codFor: true, tipo: true, fornecedorNome: true, pago: true, dataEmissao: true, dataPagamento: true, vencimentoProgramado: true, vencimentoOriginal: true, documentoFavorecido: true, descricao: true },
    }),
    db.tituloRateioSenior.findMany({
      where: { ctaFin: { in: CONTAS_REEMBOLSAVEIS }, codTns: { in: Array.from(TRANSACOES_DE_ENTRADA) } },
      select: { numTit: true, codFil: true, codTpt: true, codFor: true, codccu: true, ctaFin: true, valor: true },
    }),
    db.atualizacaoCusto.findFirst({ where: { status: "OK" }, orderBy: { finalizadoEm: "desc" }, select: { finalizadoEm: true } }),
    db.tituloContasAPagar.aggregate({ _max: { atualizadoEm: true } }),
  ]);

  // rateio de entrada por nota x centro de custo x conta reembolsavel (a soma das linhas de rateio da mesma combinacao)
  const chaveNota = (n: string, f: string, t: string, forn: string) => `${n}|${f}|${t}|${forn}`;
  const rateioDaNota = new Map<string, Map<string, { ccu: string; ctaFin: string; valor: number }>>();
  for (const r of rateios) {
    const k = chaveNota(r.numTit, r.codFil, r.codTpt, r.codFor);
    const porCombinacao = rateioDaNota.get(k) ?? rateioDaNota.set(k, new Map()).get(k)!;
    const c = `${r.codccu}|${r.ctaFin}`;
    const atual = porCombinacao.get(c);
    if (atual) atual.valor += r.valor;
    else porCombinacao.set(c, { ccu: r.codccu, ctaFin: r.ctaFin, valor: r.valor });
  }

  const notas = titulos
    .map((t) => ({ t, rateio: rateioDaNota.get(chaveNota(t.numTit, t.codFil, t.tipo, t.codFor)), vencimento: dia(t.vencimentoProgramado ?? t.vencimentoOriginal) }))
    .filter((n): n is typeof n & { rateio: NonNullable<typeof n.rateio>; vencimento: string } => !!n.rateio && !!n.vencimento)
    .filter((n) => n.vencimento.slice(0, 7) === mes || (dia(n.t.dataEmissao)?.slice(0, 7) === mes && n.vencimento.slice(0, 7) === dia(ate)!.slice(0, 7))); // vence no mes, ou foi emitida nele e vence no mes seguinte

  // texto da nota no Senior (OBSTCP): o que o sistema ja tem do titulo, senao o que ja foi lido para esta planilha; o que falta e' lido do Senior em segundo plano
  const numeros = Array.from(new Set(notas.map((n) => n.t.numTit)));
  const fornecedores = Array.from(new Set(notas.map((n) => n.t.codFor)));
  const guardados = numeros.length ? await db.tituloTexto.findMany({ where: { numTit: { in: numeros }, codFor: { in: fornecedores } }, select: { numTit: true, codFor: true, tipo: true, texto: true } }) : [];
  const textoPor = new Map(guardados.map((g) => [chaveDoTexto(g), g.texto]));
  const faltam = new Map<string, ChaveTexto>();
  const entradas: EntradaReembolso[] = [];
  for (const { t, rateio, vencimento } of notas) {
    const chave = { numTit: t.numTit, codFor: t.codFor, tipo: t.tipo };
    const texto = t.descricao || textoPor.get(chaveDoTexto(chave)) || null;
    if (!t.descricao && !textoPor.has(chaveDoTexto(chave))) faltam.set(chaveDoTexto(chave), chave);
    for (const r of rateio.values()) {
      const cod = Number(r.ctaFin);
      entradas.push({
        ccu: r.ccu, conta: nomeConta(cod) ?? `Conta ${r.ctaFin}`, codConta: cod, numTit: t.numTit, tipoTitulo: t.tipo, codFor: t.codFor, fornecedor: t.fornecedorNome ?? `código ${t.codFor}`,
        documento: t.documentoFavorecido ?? null, valor: r.valor, dataPagamento: t.pago ? dia(t.dataPagamento) : null, vencimento, pago: t.pago, dataRealizacao: dia(t.dataEmissao), descricao: texto,
      });
    }
  }
  if (faltam.size > 0) void lerTextosFaltantes(db, Array.from(faltam.values()));
  return { entradas, textosPendentes: faltam.size, atualizadoEm: { custo: ultimoCusto?.finalizadoEm?.toISOString() ?? null, titulos: ultimoTitulo._max.atualizadoEm?.toISOString() ?? null } };
}
