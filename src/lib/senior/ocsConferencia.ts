// Lista de OCs da Conferencia de OC, direto da Senior (GetDBInfo, so' leitura).
// O filtro de data do GetDBInfo nao e' confiavel (compara DATE com STRING e
// falha), entao busca uma janela das OCs mais recentes por NUMOCP e filtra o
// vencimento (USU_DATVECT) aqui no codigo.

import { consultarSenior, type LinhaSenior } from "./getDbInfo";
import { valorTotalOc } from "./pendenciasOc";

export const COD_EMP = 1;
export const JANELA_PADRAO = 1500;

export type OcConferencia = {
  numOcp: string;
  codFil: string;
  codFor: string;
  fornecedorNome: string | null;
  emissao: string | null; // yyyy-mm-dd
  vencimento: string | null; // yyyy-mm-dd
  valor: number;
  sitApr: string; // APR = totalmente aprovada
  numTitSenior: string | null; // USU_NUMTIT digitado pelo comprador
  numNfc: string | null;
  codFpg: string | null;
  descricao: string | null;
  rateioTotal: number | null; // soma de E420RAT; null = nao conferido
};

/** "dd/mm/aaaa" da Senior -> "aaaa-mm-dd"; 31/12/1900 (vazio da Senior) -> null. */
export function dataIso(v: string | undefined): string | null {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})/.exec((v ?? "").trim());
  if (!m || m[3] <= "1900") return null;
  return `${m[3]}-${m[2]}-${m[1]}`;
}

/** "1.234,56" ou "1234,56" -> 1234.56 */
export function numeroSenior(v: string | undefined): number {
  const n = Number((v ?? "").trim().replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

const vazio = (v: string | undefined) => {
  const t = (v ?? "").trim();
  return t && !/^0+$/.test(t) ? t : null;
};

export function paraOc(l: LinhaSenior): OcConferencia {
  return {
    numOcp: l.NUMOCP,
    codFil: l.CODFIL,
    codFor: l.CODFOR,
    fornecedorNome: vazio(l.USU_NOMFOR),
    emissao: dataIso(l.DATEMI),
    vencimento: dataIso(l.USU_DATVECT),
    valor: numeroSenior(l.VLRLIQ),
    sitApr: l.SITAPR ?? "",
    numTitSenior: vazio(l.USU_NUMTIT),
    numNfc: vazio(l.USU_NUMNFC),
    codFpg: vazio(l.CODFPG),
    descricao: vazio(l.OBSOCP),
    rateioTotal: null,
  };
}

const COLUNAS = "NUMOCP, CODFIL, CODFOR, DATEMI, VLRLIQ, SITAPR, USU_DATVECT, USU_NOMFOR, USU_NUMTIT, USU_NUMNFC, CODFPG, OBSOCP";

export async function listarOcsPorVencimento(de: string, ate: string, janela = JANELA_PADRAO): Promise<OcConferencia[]> {
  const max = Number((await consultarSenior(`SELECT MAX(NUMOCP) AS MAXOC FROM E420OCP WHERE CODEMP = ${COD_EMP}`))[0]?.MAXOC);
  if (!Number.isInteger(max) || max <= 0) throw new Error("Senior não devolveu o número da última OC.");
  const linhas = await consultarSenior(
    `SELECT ${COLUNAS} FROM E420OCP WHERE CODEMP = ${COD_EMP} AND NUMOCP > ${Math.max(0, max - janela)}`
  );
  const doPeriodo = linhas.map(paraOc).filter((o) => o.vencimento && o.vencimento >= de && o.vencimento <= ate);
  const nomes = await nomesFornecedores([...new Set(doPeriodo.filter((o) => !o.fornecedorNome).map((o) => o.codFor))]);
  const { itens, rateios } = await totaisPorOc(Math.max(0, max - janela), doPeriodo.length > 0);
  return doPeriodo
    .map((o) => {
      const k = `${o.numOcp}|${o.codFil}`;
      const rateioTotal = rateios ? rateios.get(k) ?? 0 : null;
      return { ...o, fornecedorNome: o.fornecedorNome ?? nomes.get(o.codFor) ?? null, rateioTotal, valor: valorTotalOc(o.valor, itens?.get(k) ?? null, rateioTotal) };
    })
    .sort((a, b) => (a.vencimento! < b.vencimento! ? -1 : a.vencimento! > b.vencimento! ? 1 : Number(a.numOcp) - Number(b.numOcp)));
}

/**
 * Notas de entrada ja' lancadas na Senior por OC (numOcp|codFil -> numeros de NF): o vinculo fica nos
 * itens da nota (E440IPC produto, E440ISC servico; NUMOCP/FILOCP). Lotes de 20 na E440IPC (40 ja'
 * estourou o tempo) e 50 na E440ISC. Lote que falha = sem nota daquele lote (nao derruba a lista).
 */
export async function notasSeniorPorOc(numeros: string[]): Promise<Map<string, string[]>> {
  const validos = numeros.filter((n) => /^\d+$/.test(n));
  const achadas = new Map<string, Set<string>>();
  for (const [tabela, tamanho] of [["E440IPC", 20], ["E440ISC", 50]] as const) {
    for (let i = 0; i < validos.length; i += tamanho) {
      try {
        for (const l of await consultarSenior(`SELECT DISTINCT NUMNFC, NUMOCP, FILOCP FROM ${tabela} WHERE CODEMP = ${COD_EMP} AND NUMOCP IN (${validos.slice(i, i + tamanho).join(",")})`)) {
          const k = `${l.NUMOCP}|${l.FILOCP}`;
          achadas.set(k, (achadas.get(k) ?? new Set()).add(l.NUMNFC));
        }
      } catch {
        /* best-effort */
      }
    }
  }
  return new Map([...achadas].map(([k, v]) => [k, [...v]]));
}

/** Soma dos itens (VLRORI) e do rateio por OC, em 2 consultas agrupadas. Falha = null (nao acusa rateio zerado). */
async function totaisPorOc(apos: number, buscar: boolean) {
  const soma = async (sql: string) => {
    const m = new Map<string, number>();
    for (const l of await consultarSenior(sql)) m.set(`${l.NUMOCP}|${l.CODFIL}`, numeroSenior(l.TOT));
    return m;
  };
  if (!buscar) return { itens: null, rateios: null };
  const filtro = `WHERE CODEMP = ${COD_EMP} AND NUMOCP > ${apos}`;
  const [itens, rateios] = await Promise.all([
    soma(`SELECT NUMOCP, CODFIL, SUM(VLRORI) AS TOT FROM E420IPO ${filtro} GROUP BY NUMOCP, CODFIL`).catch(() => null),
    soma(`SELECT NUMOCP, CODFIL, SUM(VLRRAT) AS TOT FROM E420RAT ${filtro} GROUP BY NUMOCP, CODFIL`).catch(() => null),
  ]);
  return { itens, rateios };
}

/** Nome do fornecedor (E095FOR) quando a OC nao traz USU_NOMFOR. Em lotes pequenos (IN grande estoura o tempo na Senior); falha = sem nome, nao derruba a lista. */
async function nomesFornecedores(codigos: string[]): Promise<Map<string, string>> {
  const nomes = new Map<string, string>();
  const validos = codigos.filter((c) => /^\d+$/.test(c));
  for (let i = 0; i < validos.length; i += 40) {
    try {
      for (const l of await consultarSenior(`SELECT CODFOR, NOMFOR FROM E095FOR WHERE CODFOR IN (${validos.slice(i, i + 40).join(",")})`)) {
        if (l.NOMFOR) nomes.set(l.CODFOR, l.NOMFOR);
      }
    } catch {
      /* best-effort */
    }
  }
  return nomes;
}

/** Leitura ao vivo de UMA OC, com tudo que a geracao do titulo usa. */
export async function lerOcParaTitulo(numOcp: string, codFil: string) {
  if (!/^\d+$/.test(numOcp) || !/^\d+$/.test(codFil)) throw new Error("OC/filial inválida.");
  const [oc] = await consultarSenior(
    `SELECT ${COLUNAS}, CODPOR, CODCRT, CODMOE, USU_CHVPIX, USU_CODAGE, USU_NUMCCO, USU_DESCCO, USU_CGCCPF FROM E420OCP WHERE CODEMP = ${COD_EMP} AND CODFIL = ${codFil} AND NUMOCP = ${numOcp}`
  );
  if (!oc) return null;
  const rateio = await consultarSenior(
    `SELECT CODCCU, CTAFIN, NUMPRJ, CODFPJ, VLRRAT FROM E420RAT WHERE CODEMP = ${COD_EMP} AND CODFIL = ${codFil} AND NUMOCP = ${numOcp}`
  );
  return { oc, rateio };
}

/** Ja existe titulo desse fornecedor com esse numero/tipo na Senior? */
export async function tituloExiste(codFor: string, numTit: string, codTpt: string): Promise<boolean> {
  if (!/^\d+$/.test(codFor) || !/^[A-Za-z0-9]{1,15}$/.test(numTit) || !/^[A-Za-z0-9]{1,3}$/.test(codTpt)) {
    throw new Error("Chave de título inválida.");
  }
  const l = await consultarSenior(
    `SELECT NUMTIT FROM E501TCP WHERE CODEMP = ${COD_EMP} AND CODFOR = ${codFor} AND NUMTIT = '${numTit}' AND CODTPT = '${codTpt}'`
  );
  return l.length > 0;
}

/** Quais titulos (codFor|numTit|codTpt) existem na Senior -- UMA consulta pra varios (lotes de 40, IN grande estoura na Senior). */
export async function titulosQueExistem(chaves: { codFor: string; numTit: string; codTpt: string }[]): Promise<Set<string>> {
  const validas = chaves.filter((c) => /^\d+$/.test(c.codFor) && /^[A-Za-z0-9]{1,15}$/.test(c.numTit) && /^[A-Za-z0-9]{1,3}$/.test(c.codTpt));
  const achados = new Set<string>();
  for (let i = 0; i < validas.length; i += 40) {
    const lote = validas.slice(i, i + 40);
    const linhas = await consultarSenior(
      `SELECT CODFOR, NUMTIT, CODTPT FROM E501TCP WHERE CODEMP IN (${COD_EMP}) AND NUMTIT IN (${[...new Set(lote.map((c) => `'${c.numTit}'`))].join(",")})`
    );
    for (const l of linhas) achados.add(`${l.CODFOR}|${l.NUMTIT}|${l.CODTPT}`);
  }
  return achados;
}
