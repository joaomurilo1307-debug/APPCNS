// Texto digitado nos titulos do Senior (E501TCP.OBSTCP), lido SOB DEMANDA para a planilha de despesas reembolsaveis. A sincronizacao de titulos so' traz a descricao
// de uma parte pequena dos titulos; aqui o sistema le do Senior o texto dos que a planilha precisa, uma vez, e guarda em TituloTexto. SOMENTE LEITURA do Senior,
// em segundo plano (nunca dentro do request), uma leitura por vez, pela fila unica do app. Falhou? nada e' gravado e tenta de novo na proxima abertura.

import type { prisma as prismaReal } from "@/lib/prisma";
import { consultarSenior, type LinhaSenior } from "./getDbInfo";

export type ChaveTexto = { numTit: string; codFor: string; tipo: string };
export type ConsultaSenior = (sql: string, opcoes?: { timeoutMs?: number }) => Promise<LinhaSenior[]>;

export const chaveDoTexto = (c: ChaveTexto) => `${c.numTit}|${c.codFor}|${c.tipo}`;
const aspas = (s: string) => `'${s.replace(/'/g, "''")}'`;
const LOTE = 40;

/** PURA: separa as chaves em lotes e monta a consulta de cada um (numero do titulo e codigo do fornecedor so' com digitos, como o resto do app). */
export function montarConsultasDeTexto(chaves: ChaveTexto[]): { sql: string; chaves: ChaveTexto[] }[] {
  const validas = chaves.filter((c) => c.numTit && /^\d+$/.test(c.codFor));
  const unicas = Array.from(new Map(validas.map((c) => [chaveDoTexto(c), c])).values());
  const lotes: { sql: string; chaves: ChaveTexto[] }[] = [];
  for (let i = 0; i < unicas.length; i += LOTE) {
    const lote = unicas.slice(i, i + LOTE);
    const numeros = Array.from(new Set(lote.map((c) => aspas(c.numTit)))).join(",");
    const fornecedores = Array.from(new Set(lote.map((c) => c.codFor))).join(",");
    lotes.push({ sql: `SELECT NUMTIT, CODFIL, CODTPT, CODFOR, OBSTCP FROM E501TCP WHERE CODEMP=1 AND NUMTIT IN (${numeros}) AND CODFOR IN (${fornecedores})`, chaves: lote });
  }
  return lotes;
}

/** PURA: o que gravar para um lote. Titulo que o Senior nao devolveu (ou sem texto) vai com texto vazio, para nao ser consultado de novo. */
export function textosDoLote(chaves: ChaveTexto[], linhas: LinhaSenior[]): { numTit: string; codFor: string; tipo: string; texto: string }[] {
  const lido = new Map<string, string>();
  for (const l of linhas) {
    const k = chaveDoTexto({ numTit: (l.NUMTIT ?? "").trim(), codFor: (l.CODFOR ?? "").trim(), tipo: (l.CODTPT ?? "").trim() });
    const texto = (l.OBSTCP ?? "").replace(/\s+/g, " ").trim();
    if (!lido.has(k) || (!lido.get(k) && texto)) lido.set(k, texto);
  }
  return chaves.map((c) => ({ numTit: c.numTit, codFor: c.codFor, tipo: c.tipo, texto: lido.get(chaveDoTexto(c)) ?? "" }));
}

let emCurso: Promise<number> | null = null;

/**
 * Le do Senior o texto dos titulos que faltam e guarda em TituloTexto. Devolve quantos titulos gravou. So' uma leitura por vez (quem chegar durante outra
 * recebe a mesma promessa). Nunca lanca: erro de rede/Senior volta 0 e a proxima abertura da aba tenta de novo.
 */
export function lerTextosFaltantes(db: typeof prismaReal, chaves: ChaveTexto[], consultar: ConsultaSenior = consultarSenior): Promise<number> {
  if (emCurso) return emCurso;
  emCurso = (async () => {
    let gravados = 0;
    try {
      for (const lote of montarConsultasDeTexto(chaves)) {
        const linhas = await consultar(lote.sql, { timeoutMs: 3 * 60_000 });
        for (const t of textosDoLote(lote.chaves, linhas)) {
          await db.tituloTexto.upsert({ where: { numTit_codFor_tipo: { numTit: t.numTit, codFor: t.codFor, tipo: t.tipo } }, update: { texto: t.texto, lidoEm: new Date() }, create: t });
          gravados++;
        }
      }
    } catch {
      /* Senior fora do ar ou lento: nada a fazer agora */
    }
    return gravados;
  })().finally(() => { emCurso = null; });
  return emCurso;
}
