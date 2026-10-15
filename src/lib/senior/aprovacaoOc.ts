// Aprovacao multinivel de UMA OC, lida ao vivo da Senior (GetDBInfo, so' leitura).
//
// Tabelas (validadas 28/09/2026, ver docs de E614USU):
//   E420OCP.NUMAPR  -> numero de aprovacao (NAO e' o NUMOCP); sempre com ROTNAP = 12 (Ordem de Compra)
//   E614APR         -> cabecalho da aprovacao: NIVEXI (expressao dos niveis exigidos, ex.: "1" ou
//                      "(1*1)*(2)") e SITAPR (APR = totalmente aprovada)
//   E614USU         -> um evento por aprovacao/reprovacao: NIVAPR, CCUAPR, USUAPR, SITAPR, DATAPR
//   E420RAT         -> rateio da OC (uma OC com varios centros de custo tem uma cadeia por CCU)
//   E068CNA         -> cadastro mestre: usuario x nivel x CCU (SITCNA = A ativo)
//   E099USU         -> nome/e-mail do usuario (a mesma CODUSU e' gente diferente por empresa: casar CODEMP)
//
// Regra de "completa": cabecalho E614APR.SITAPR = APR e nenhum nivel exigido sem aprovacao.
// A atribuicao exata de qual termo de NIVEXI vale pra qual CCU nao e' documentada; por isso a
// pendencia e' calculada por NIVEL (conservador: nivel exigido sem nenhum evento APR = pendente).

import { consultarSenior, type LinhaSenior } from "./getDbInfo";
import { COD_EMP, dataIso } from "./ocsConferencia";

export type Pessoa = { codUsu: string; nome: string; email: string | null };
export type EventoAprovacao = { nivel: number; codCcu: string; situacao: string; data: string | null; por: Pessoa };
export type CcuDaOc = {
  codCcu: string;
  descricao: string | null;
  percentual: number;
  valor: number;
  aprovadoresCadastrados: { nivel: number; pessoas: Pessoa[] }[];
};
export type AprovacaoOc = {
  numApr: string | null;
  sitOc: string; // E420OCP.SITAPR
  sitCabecalho: string | null; // E614APR.SITAPR
  nivelExigido: string | null; // NIVEXI cru
  niveisExigidos: number[];
  eventos: EventoAprovacao[];
  niveisAprovados: number[];
  niveisPendentes: number[];
  reprovada: boolean;
  ccus: CcuDaOc[];
  completa: boolean;
  motivoIncompleta: string | null;
};

const num = (v: string | undefined) => Number((v ?? "").trim().replace(/\./g, "").replace(",", "."));
const soInteiros = (valores: (string | undefined)[]) => [...new Set(valores.filter((v): v is string => !!v && /^\d+$/.test(v)))];

/**
 * Rateio por centro de custo. A Senior grava uma linha por ITEM da OC e PERRAT e' o percentual
 * dentro do item (100 em cada linha), entao somar PERRAT da "300%". A fatia real do CCU e' o
 * valor dele sobre o valor rateado total (confere com PERCTA da propria Senior).
 */
export function consolidarRateio(linhas: LinhaSenior[]): { codCcu: string; valor: number; percentual: number }[] {
  const porCcu = new Map<string, number>();
  for (const l of linhas) porCcu.set(l.CODCCU, (porCcu.get(l.CODCCU) ?? 0) + num(l.VLRRAT));
  const total = [...porCcu.values()].reduce((a, b) => a + b, 0);
  return [...porCcu].map(([codCcu, v]) => ({
    codCcu,
    valor: Math.round(v * 100) / 100,
    percentual: total > 0 ? Math.round((v / total) * 10000) / 100 : 0,
  }));
}

/** "(1*1)*(2)" -> [1, 2]; "1" -> [1]. So' digitos 1..9 contam como nivel. */
export function niveisDaExpressao(expr: string | null | undefined): number[] {
  return [...new Set([...(expr ?? "").matchAll(/\d/g)].map((m) => Number(m[0])).filter((n) => n >= 1))].sort();
}

/** Quantos termos (aprovacoes individuais) a expressao exige: "(1*1)*(2)" = 3. */
export function termosDaExpressao(expr: string | null | undefined): number {
  return [...(expr ?? "").matchAll(/\d/g)].length;
}

export function avaliarAprovacao(a: Pick<AprovacaoOc, "sitOc" | "sitCabecalho" | "niveisExigidos" | "eventos" | "reprovada">) {
  const niveisAprovados = [...new Set(a.eventos.filter((e) => e.situacao === "APR").map((e) => e.nivel))].sort();
  const niveisPendentes = a.niveisExigidos.filter((n) => !niveisAprovados.includes(n));
  let motivo: string | null = null;
  if (a.reprovada) motivo = "Há reprovação registrada nesta OC.";
  else if (a.sitOc !== "APR") motivo = `OC não está aprovada (situação ${a.sitOc || "?"}).`;
  else if (a.sitCabecalho !== "APR") motivo = `Cabeçalho de aprovação não consta como aprovado (${a.sitCabecalho ?? "ausente"}).`;
  else if (niveisPendentes.length) motivo = `Falta aprovação do nível ${niveisPendentes.join(", ")}.`;
  return { niveisAprovados, niveisPendentes, completa: motivo === null, motivoIncompleta: motivo };
}

async function pessoas(codigos: string[]): Promise<Map<string, Pessoa>> {
  const mapa = new Map<string, Pessoa>();
  const lista = soInteiros(codigos);
  if (!lista.length) return mapa;
  const linhas = await consultarSenior(`SELECT CODUSU, NOMUSU, INTNET FROM E099USU WHERE CODEMP IN (${COD_EMP}) AND CODUSU IN (${lista.join(",")})`);
  for (const l of linhas) mapa.set(l.CODUSU, { codUsu: l.CODUSU, nome: l.NOMUSU, email: l.INTNET?.trim() || null });
  return mapa;
}

export async function lerAprovacaoOc(numOcp: string, codFil: string): Promise<AprovacaoOc | null> {
  if (!/^\d+$/.test(numOcp) || !/^\d+$/.test(codFil)) throw new Error("OC/filial inválida.");
  const [oc] = await consultarSenior(`SELECT NUMAPR, SITAPR FROM E420OCP WHERE CODEMP = ${COD_EMP} AND CODFIL = ${codFil} AND NUMOCP = ${numOcp}`);
  if (!oc) return null;
  const numApr = /^\d+$/.test(oc.NUMAPR ?? "") && oc.NUMAPR !== "0" ? oc.NUMAPR : null;

  let cab: LinhaSenior | undefined;
  let usu: LinhaSenior[] = [];
  if (numApr) {
    [cab] = await consultarSenior(`SELECT NIVEXI, SITAPR FROM E614APR WHERE NUMAPR IN (${numApr}) AND ROTNAP IN (12)`);
    usu = await consultarSenior(`SELECT SEQAPR, USUAPR, CCUAPR, NIVAPR, SITAPR, DATAPR FROM E614USU WHERE NUMAPR IN (${numApr}) AND ROTNAP IN (12)`);
  }
  const rateio = await consultarSenior(`SELECT CODCCU, PERRAT, VLRRAT FROM E420RAT WHERE CODEMP = ${COD_EMP} AND CODFIL = ${codFil} AND NUMOCP = ${numOcp}`);
  const codCcus = [...new Set(rateio.map((r) => r.CODCCU).filter(Boolean))];
  const cadastro = codCcus.length
    ? (await consultarSenior(`SELECT CODUSU, CODNAP, CODCCU, SITCNA FROM E068CNA WHERE CODEMP IN (${COD_EMP}) AND ROTNAP IN (12) AND CODCCU IN (${codCcus.map((c) => `'${c.replace(/'/g, "")}'`).join(",")})`)).filter((l) => l.SITCNA === "A")
    : [];
  const descricoes = new Map<string, string>();
  if (codCcus.length) {
    for (const l of await consultarSenior(`SELECT CODCCU, DESCCU FROM E044CCU WHERE CODEMP IN (${COD_EMP}) AND CODCCU IN (${codCcus.map((c) => `'${c.replace(/'/g, "")}'`).join(",")})`).catch(() => [])) {
      descricoes.set(l.CODCCU, l.DESCCU);
    }
  }
  const nomes = await pessoas([...usu.map((u) => u.USUAPR), ...cadastro.map((c) => c.CODUSU)]);
  const quem = (cod: string): Pessoa => nomes.get(cod) ?? { codUsu: cod, nome: `usuário ${cod}`, email: null };

  const eventos: EventoAprovacao[] = usu.map((u) => ({
    nivel: Number(u.NIVAPR),
    codCcu: u.CCUAPR,
    situacao: u.SITAPR,
    data: dataIso(u.DATAPR),
    por: quem(u.USUAPR),
  }));
  const niveisExigidos = niveisDaExpressao(cab?.NIVEXI);
  const base = {
    sitOc: oc.SITAPR ?? "",
    sitCabecalho: cab?.SITAPR ?? null,
    niveisExigidos,
    eventos,
    reprovada: eventos.some((e) => e.situacao === "REP"),
  };
  const av = avaliarAprovacao(base);

  return {
    numApr,
    ...base,
    nivelExigido: cab?.NIVEXI ?? null,
    ...av,
    ccus: consolidarRateio(rateio).map((c) => ({
      codCcu: c.codCcu,
      descricao: descricoes.get(c.codCcu) ?? null,
      percentual: c.percentual,
      valor: c.valor,
      aprovadoresCadastrados: (niveisExigidos.length ? niveisExigidos : [1, 2, 3]).map((nivel) => ({
        nivel,
        pessoas: cadastro.filter((x) => x.CODCCU === c.codCcu && Number(x.CODNAP) === nivel).map((x) => quem(x.CODUSU)),
      })),
    })),
  };
}
