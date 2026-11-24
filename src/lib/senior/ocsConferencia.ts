// Lista de OCs da Conferencia de OC, direto da Senior (GetDBInfo, so' leitura).
// O filtro de data do GetDBInfo nao e' confiavel (compara DATE com STRING e
// falha), entao busca uma janela das OCs mais recentes por NUMOCP e filtra o
// vencimento (USU_DATVECT) aqui no codigo.

import { consultarSenior, type LinhaSenior } from "./getDbInfo";
import { valorDaOc, type ResumoRateio } from "./pendenciasOc";
import type { NfDaOc, TituloSenior } from "../conferenciaOc/titulosDaOc";

export const COD_EMP = 1;
export const JANELA_PADRAO = 1500;

export type OcConferencia = {
  numOcp: string;
  codFil: string;
  codFor: string;
  fornecedorNome: string | null;
  emissao: string | null; // yyyy-mm-dd
  vencimento: string | null; // yyyy-mm-dd
  valor: number; // valor da OC (valorDaOc)
  saldo: number; // VLRLIQ: o que ainda falta receber/faturar
  sitApr: string; // APR = totalmente aprovada
  sitOcp: string; // 1 aberta, 2 atendida em parte, 4 liquidada, 5 cancelada, 9 nao fechada
  numTitSenior: string | null; // USU_NUMTIT digitado pelo comprador
  numNfc: string | null;
  codFpg: string | null;
  descricao: string | null;
  rateio: ResumoRateio | null; // E420RAT resumido; null = nao conferido
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
  const vlrLiq = numeroSenior(l.VLRLIQ);
  return {
    numOcp: l.NUMOCP,
    codFil: l.CODFIL,
    codFor: l.CODFOR,
    fornecedorNome: vazio(l.USU_NOMFOR),
    emissao: dataIso(l.DATEMI),
    vencimento: dataIso(l.USU_DATVECT),
    valor: valorDaOc({ sitOcp: l.SITOCP ?? null, vlrLiq, vlrOri: numeroSenior(l.VLRORI) }, null, null),
    saldo: vlrLiq,
    // OC cancelada na Senior (SITOCP 5) mantem o SITAPR de antes (APR/ANA/REP): a tela mostrava "Aprovada" e "sem titulo" para
    // ela (OC 16728, 23/11/2026). Cancelada vira CAN: rotulo "Cancelada" e nenhuma pendencia.
    sitApr: (l.SITOCP ?? "").trim() === "5" ? "CAN" : l.SITAPR ?? "",
    sitOcp: (l.SITOCP ?? "").trim(),
    numTitSenior: vazio(l.USU_NUMTIT),
    numNfc: vazio(l.USU_NUMNFC),
    codFpg: vazio(l.CODFPG),
    descricao: vazio(l.OBSOCP),
    rateio: null,
  };
}

const COLUNAS = "NUMOCP, CODFIL, CODFOR, DATEMI, VLRLIQ, VLRORI, SITOCP, SITAPR, USU_DATVECT, USU_NOMFOR, USU_NUMTIT, USU_NUMNFC, CODFPG, OBSOCP";

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
      const rateio = rateios ? rateios.get(k) ?? { linhas: 0, valor: 0, percentual: 0 } : null;
      const valor = o.valor > 0 ? o.valor : valorDaOc({ sitOcp: o.sitOcp, vlrLiq: 0, vlrOri: 0 }, itens?.get(k) ?? null, rateio?.valor ?? null);
      return { ...o, fornecedorNome: o.fornecedorNome ?? nomes.get(o.codFor) ?? null, rateio, valor };
    })
    .sort((a, b) => (a.vencimento! < b.vencimento! ? -1 : a.vencimento! > b.vencimento! ? 1 : Number(a.numOcp) - Number(b.numOcp)));
}

/** Total dos itens de uma linha agrupada: saldo (VLRLIQ), senao original (VLRORI), senao bruto (VLRBRU) -- item liquidado zera o saldo. */
const totalDosItens = (l: LinhaSenior) => [l.LIQ, l.ORI, l.BRU].map(numeroSenior).find((v) => v > 0) ?? 0;

/**
 * Por OC, em 3 consultas agrupadas: total dos itens (produtos E420IPO + servicos E420ISO -- antes so' produtos, e OC so' de
 * servico liquidada aparecia com R$ 0,00) e o resumo do rateio (linhas, VLRRAT e PERRAT). Falha = null (nao acusa rateio).
 */
async function totaisPorOc(apos: number, buscar: boolean) {
  if (!buscar) return { itens: null, rateios: null };
  const filtro = `WHERE CODEMP = ${COD_EMP} AND NUMOCP > ${apos}`;
  const somaItens = async () => {
    const m = new Map<string, number>();
    for (const tabela of ["E420IPO", "E420ISO"]) {
      for (const l of await consultarSenior(`SELECT NUMOCP, CODFIL, SUM(VLRLIQ) AS LIQ, SUM(VLRORI) AS ORI, SUM(VLRBRU) AS BRU FROM ${tabela} ${filtro} GROUP BY NUMOCP, CODFIL`)) {
        const k = `${l.NUMOCP}|${l.CODFIL}`;
        m.set(k, (m.get(k) ?? 0) + totalDosItens(l));
      }
    }
    return m;
  };
  const resumoRateio = async () => {
    const m = new Map<string, ResumoRateio>();
    for (const l of await consultarSenior(`SELECT NUMOCP, CODFIL, COUNT(*) AS QTD, SUM(VLRRAT) AS VLR, SUM(PERRAT) AS PER FROM E420RAT ${filtro} GROUP BY NUMOCP, CODFIL`)) {
      m.set(`${l.NUMOCP}|${l.CODFIL}`, { linhas: numeroSenior(l.QTD), valor: numeroSenior(l.VLR), percentual: numeroSenior(l.PER) });
    }
    return m;
  };
  const [itens, rateios] = await Promise.all([somaItens().catch(() => null), resumoRateio().catch(() => null)]);
  return { itens, rateios };
}

const TIPO_OK = /^[A-Za-z0-9]{1,3}$/;
const inteiro = (v: string | undefined) => /^\d+$/.test((v ?? "").trim());

/**
 * Tudo o que a Senior registra para decidir se a OC ja' virou titulo (ver src/lib/conferenciaOc/titulosDaOc.ts), so' leitura:
 *  - NF de compra com a OC nos itens (E440IPC/E440ISC.NUMOCP);
 *  - titulos (E501TCP) dos fornecedores das OCs, dos outros fornecedores do mesmo grupo e dos fornecedores dessas NFs.
 * Titulos em lotes de 40 fornecedores (IN grande estoura o tempo na Senior). Erro = excecao (quem chama decide o que fazer).
 */
export async function lerTitulosDasOcs(
  ocs: Pick<OcConferencia, "numOcp" | "codFor">[],
  grupos: Map<string, string> = new Map()
): Promise<{ titulos: TituloSenior[]; nfs: NfDaOc[] }> {
  const numeros = ocs.map((o) => Number(o.numOcp)).filter((n) => Number.isInteger(n) && n > 0);
  if (!numeros.length) return { titulos: [], nfs: [] };
  const sem0 = (c: string) => String(Number(c));
  const daLista = new Set(numeros.map(String));

  const apos = Math.min(...numeros) - 1;
  const nfs: NfDaOc[] = [];
  for (const tabela of ["E440IPC", "E440ISC"]) {
    for (const l of await consultarSenior(`SELECT CODFIL, CODFOR, NUMNFC, NUMOCP FROM ${tabela} WHERE CODEMP = ${COD_EMP} AND NUMOCP > ${apos}`)) {
      if (inteiro(l.NUMOCP) && daLista.has(sem0(l.NUMOCP)) && inteiro(l.CODFOR) && (l.NUMNFC ?? "").trim()) {
        nfs.push({ codFil: l.CODFIL, codFor: l.CODFOR, numNfc: l.NUMNFC.trim(), numOcp: sem0(l.NUMOCP) });
      }
    }
  }

  const membros = new Map<string, string[]>();
  for (const [cod, g] of grupos) membros.set(g, [...(membros.get(g) ?? []), cod]);
  const fornecedores = new Set<string>();
  for (const cod of [...ocs.map((o) => o.codFor), ...nfs.map((n) => n.codFor)]) {
    if (!inteiro(cod)) continue;
    fornecedores.add(sem0(cod));
    for (const m of membros.get(grupos.get(sem0(cod)) ?? "") ?? []) if (inteiro(m)) fornecedores.add(sem0(m));
  }
  const lista = [...fornecedores];
  const titulos: TituloSenior[] = [];
  for (let i = 0; i < lista.length; i += 40) {
    const linhas = await consultarSenior(
      `SELECT CODFIL, CODFOR, NUMTIT, CODTPT, SITTIT, VLRORI, VLRABE, VCTPRO, NUMNFC, USU_NUMOCP FROM E501TCP WHERE CODEMP = ${COD_EMP} AND CODFOR IN (${lista.slice(i, i + 40).join(",")})`
    );
    for (const l of linhas) {
      const numTit = (l.NUMTIT ?? "").trim();
      if (!numTit || !TIPO_OK.test((l.CODTPT ?? "").trim())) continue;
      titulos.push({
        codFil: (l.CODFIL ?? "").trim(),
        codFor: (l.CODFOR ?? "").trim(),
        numTit,
        codTpt: (l.CODTPT ?? "").trim(),
        situacao: (l.SITTIT ?? "").trim(),
        valor: numeroSenior(l.VLRORI),
        aberto: numeroSenior(l.VLRABE),
        vencimento: dataIso(l.VCTPRO),
        numNfc: vazio(l.NUMNFC),
        numOcp: vazio(l.USU_NUMOCP),
      });
    }
  }
  return { titulos, nfs };
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
