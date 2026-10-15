// Lista de OCs da Conferencia de OC, direto da Senior (GetDBInfo, so' leitura).
// O filtro de data do GetDBInfo nao e' confiavel (compara DATE com STRING e
// falha), entao busca uma janela das OCs mais recentes por NUMOCP e filtra o
// vencimento (USU_DATVECT) aqui no codigo.

import { consultarSenior, type LinhaSenior } from "./getDbInfo";

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
  return doPeriodo
    .map((o) => ({ ...o, fornecedorNome: o.fornecedorNome ?? nomes.get(o.codFor) ?? null }))
    .sort((a, b) => (a.vencimento! < b.vencimento! ? -1 : a.vencimento! > b.vencimento! ? 1 : Number(a.numOcp) - Number(b.numOcp)));
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
    `SELECT ${COLUNAS}, CODPOR, CODCRT, USU_CHVPIX, USU_CODAGE, USU_NUMCCO FROM E420OCP WHERE CODEMP = ${COD_EMP} AND CODFIL = ${codFil} AND NUMOCP = ${numOcp}`
  );
  if (!oc) return null;
  const rateio = await consultarSenior(
    `SELECT CODCCU, CTAFIN, NUMPRJ, CODFPJ FROM E420RAT WHERE CODEMP = ${COD_EMP} AND CODFIL = ${codFil} AND NUMOCP = ${numOcp}`
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
