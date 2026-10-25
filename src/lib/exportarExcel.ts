// Exportacao para Excel (.xlsx de verdade, nao CSV): varias abas, cabecalho, largura de coluna, numero/moeda/data/percentual com formato
// brasileiro e filtro automatico. Roda no navegador (baixarExcel) e no servidor/teste (montarWorkbook). Usa a biblioteca xlsx que o sistema
// ja tem. Nao muda nenhuma exportacao existente: os botoes antigos (CSV) continuam e este so' acrescenta.
import * as XLSX from "xlsx";

export type TipoColuna = "texto" | "numero" | "moeda" | "data" | "percentual" | "inteiro";
export type ColunaExcel = { titulo: string; largura?: number; tipo?: TipoColuna };
export type CelulaExcel = string | number | Date | null | undefined;
// rodape: linha de TOTAL, escrita depois de uma linha em branco e FORA do filtro automatico (para nao ser ordenada junto com os dados)
export type AbaExcel = { nome: string; colunas: ColunaExcel[]; linhas: CelulaExcel[][]; observacao?: string; rodape?: CelulaExcel[] };

const FORMATO: Record<TipoColuna, string | undefined> = {
  texto: undefined,
  numero: "#,##0.00",
  moeda: "#,##0.00",
  inteiro: "#,##0",
  data: "dd/mm/yyyy",
  percentual: "0.0%",
};

/** Nome de aba valido no Excel: ate 31 letras, sem \ / ? * [ ] : e sem repetir. */
export function nomeDeAba(bruto: string, usados: Set<string>): string {
  const base = (bruto.replace(/[\\/?*[\]:]/g, " ").replace(/\s+/g, " ").trim() || "Dados").slice(0, 31);
  let nome = base;
  for (let i = 2; usados.has(nome.toLowerCase()); i++) nome = `${base.slice(0, 31 - String(i).length - 1)} ${i}`;
  usados.add(nome.toLowerCase());
  return nome;
}

/** Texto -> Date (aceita dd/mm/aaaa e aaaa-mm-dd); qualquer outra coisa devolve null. */
export function lerData(v: unknown): Date | null {
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v;
  if (typeof v !== "string") return null;
  const br = /^(\d{2})\/(\d{2})\/(\d{4})/.exec(v);
  if (br) return new Date(Date.UTC(+br[3], +br[2] - 1, +br[1]));
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(v);
  return iso ? new Date(Date.UTC(+iso[1], +iso[2] - 1, +iso[3])) : null;
}

export function montarWorkbook(abas: AbaExcel[]): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();
  const usados = new Set<string>();
  for (const aba of abas) {
    const converter = (l: CelulaExcel[]) => l.map((c, i) => {
      const tipo = aba.colunas[i]?.tipo ?? "texto";
      if (c === null || c === undefined || c === "") return null;
      if (tipo === "data") return lerData(c) ?? c;
      if ((tipo === "numero" || tipo === "moeda" || tipo === "inteiro" || tipo === "percentual") && typeof c === "string") {
        const n = Number(c.replace(/\./g, "").replace(",", "."));
        return Number.isFinite(n) ? n : c;
      }
      return c;
    });
    const linhas = aba.linhas.map(converter);
    const topo = aba.observacao ? [[aba.observacao], []] : [];
    const ws = XLSX.utils.aoa_to_sheet([...topo, aba.colunas.map((c) => c.titulo), ...linhas, ...(aba.rodape ? [[], converter(aba.rodape)] : [])], { cellDates: true });
    const base = topo.length;
    const ultimaLinhaFormatada = base + aba.linhas.length + (aba.rodape ? 2 : 0);
    // formato das celulas por tipo de coluna
    aba.colunas.forEach((col, ci) => {
      const fmt = FORMATO[col.tipo ?? "texto"];
      if (!fmt) return;
      for (let r = base + 1; r <= ultimaLinhaFormatada; r++) {
        const cel = ws[XLSX.utils.encode_cell({ r, c: ci })];
        if (cel && (cel.t === "n" || cel.t === "d")) cel.z = fmt;
      }
    });
    ws["!cols"] = aba.colunas.map((c) => ({ wch: c.largura ?? Math.min(48, Math.max(10, c.titulo.length + 2)) }));
    if (aba.linhas.length > 0) ws["!autofilter"] = { ref: XLSX.utils.encode_range({ s: { r: base, c: 0 }, e: { r: base + aba.linhas.length, c: Math.max(0, aba.colunas.length - 1) } }) };
    XLSX.utils.book_append_sheet(wb, ws, nomeDeAba(aba.nome, usados));
  }
  return wb;
}

/** Nome de arquivo seguro, com a data de hoje. */
export function nomeDeArquivo(base: string): string {
  const limpo = base.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\w.-]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 80) || "exportacao";
  const hoje = new Date();
  const d = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}-${String(hoje.getDate()).padStart(2, "0")}`;
  return `${limpo}_${d}.xlsx`;
}

/** Gera e baixa o arquivo no navegador. */
export function baixarExcel(arquivo: string, abas: AbaExcel[]) {
  const wb = montarWorkbook(abas);
  XLSX.writeFile(wb, nomeDeArquivo(arquivo), { cellDates: true });
}

/**
 * Aba a partir de linhas ja prontas (a primeira e' o cabecalho), as mesmas que alimentam os botoes de CSV. O tipo de cada coluna e'
 * deduzido do conteudo: so' numeros viram numero (inteiro, com 2 casas ou percentual quando o titulo tem "%"), so' dd/mm/aaaa vira data; o resto fica texto, para nao
 * estragar codigo com zero a esquerda nem numero de documento.
 */
export function abaDeLinhas(nome: string, linhas: ReadonlyArray<ReadonlyArray<string | number | null | undefined>>, observacao?: string, ultimaLinhaETotal = false, tipos?: Record<string, TipoColuna>): AbaExcel {
  const [cab = [], ...todas] = linhas;
  const total = ultimaLinhaETotal && todas.length > 0 ? todas[todas.length - 1] : undefined;
  const corpo = total ? todas.slice(0, -1) : todas;
  const colunas: ColunaExcel[] = cab.map((titulo, i) => {
    const valores = corpo.map((l) => l[i]).filter((v) => v !== null && v !== undefined && v !== "");
    let tipo: TipoColuna = "texto";
    if (valores.length && valores.every((v) => typeof v === "number" && Number.isFinite(v))) {
      tipo = valores.every((v) => Number.isInteger(v)) ? "inteiro" : "numero";
      // coluna com "%" no titulo e fracoes entre 0 e 1 (ex.: 0,25) vira percentual (25,0%)
      if (/%/.test(String(titulo ?? "")) && valores.every((v) => (v as number) >= -1 && (v as number) <= 1.0001)) tipo = "percentual";
    }
    else if (valores.length && valores.every((v) => typeof v === "string" && /^\d{2}\/\d{2}\/\d{4}$/.test(v))) tipo = "data";
    const maior = valores.reduce<number>((m, v) => Math.max(m, String(v).length), String(titulo ?? "").length);
    return { titulo: String(titulo ?? ""), tipo: tipos?.[String(titulo ?? "")] ?? tipo, largura: Math.min(48, Math.max(10, maior + 2)) };
  });
  return { nome, colunas, linhas: corpo.map((l) => [...l]), observacao, rodape: total ? [...total] : undefined };
}
