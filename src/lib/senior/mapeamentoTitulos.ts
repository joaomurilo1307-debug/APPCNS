// Traduz uma linha de E501TCP (titulo a pagar) + E095FOR (fornecedor) do
// GetDBInfo para o payload de POST /api/senior/titulos-pagar/sync.
// Formatos do GetDBInfo: data "dd/mm/aaaa", decimal com virgula, campo
// numerico vazio vem "0" (nao NULL) -- ver GabrielOS/senior_conhecimento_tecnico.md.

import type { LinhaSenior } from "./getDbInfo";

export const CAMPOS_TITULO = [
  "CODEMP", "CODFIL", "NUMTIT", "CODTPT", "CODFOR", "SITTIT", "DATEMI", "VCTORI", "VCTPRO", "VLRORI", "VLRABE",
  "CODCCU", "NUMNFC", "OBSTCP", "USUGER", "DATGER", "CODBAN", "TIPTCC", "CODAGE", "CCBFOR", "CODBAR", "DOCIDEFAV",
  "TPCPIX", "CHVPIX",
] as const;

export type ItemSyncTitulo = {
  numTit: string;
  codFil: string;
  codFor: string;
  fornecedorNome: string | null;
  tipo: string;
  situacao: string;
  pago: boolean;
  dataEmissao: string;
  vencimentoOriginal: string | null;
  vencimentoProgramado: string | null;
  valorOriginal: number;
  valorAberto: number;
  dataPagamento: null;
  codccu: string | null;
  ccuNome: null;
  numOcp: null;
  numNfc: string | null;
  descricao: string | null;
  lancadoPorCod: string | null;
  dataLancamento: string | null;
  codigoBarrasBoleto?: string;
  bancoFavorecido: string | null;
  agenciaFavorecido: string | null;
  contaFavorecido: string | null;
  dacFavorecido: string | null;
  tipoContaFavorecido: string | null;
  chavePix: string | null;
  tipoChavePix: string | null;
  documentoFavorecido: string | null;
};

/** Campo "preenchido" no dialeto da Senior: nao vazio e nao "0". */
export function preenchido(valor: string | undefined): valor is string {
  return !!valor && valor.trim() !== "" && !/^0([.,]0+)?$/.test(valor.trim());
}

/** "18/09/2026" -> "2026-09-18"; vazio/invalido -> null. */
export function dataIso(valor: string | undefined): string | null {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec((valor ?? "").trim());
  if (!m) return null;
  return `${m[3]}-${m[2]}-${m[1]}`;
}

/** "213441,2" -> 213441.2 */
export function numeroSenior(valor: string | undefined): number {
  const n = Number((valor ?? "").trim().replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

export function soDigitos(valor: string | undefined): string {
  return (valor ?? "").replace(/\D/g, "");
}

/** "99999-9" -> { base: "99999", dv: "9" }; sem hifen -> dv vazio. Agencia e conta chegam assim. */
export function separarDv(valor: string | undefined): { base: string; dv: string } {
  const texto = (valor ?? "").trim();
  const i = texto.indexOf("-");
  if (i < 0) return { base: soDigitos(texto), dv: "" };
  return { base: soDigitos(texto.slice(0, i)), dv: texto.slice(i + 1).trim().toUpperCase() };
}

/** CPF (11) ou CNPJ (14) plausivel: exclui sequencia repetida tipo 11111111111 (placeholder do "fornecedor diverso"). */
export function documentoValido(valor: string | undefined): string | null {
  const d = soDigitos(valor);
  if (d.length !== 11 && d.length !== 14) return null;
  if (/^(\d)\1+$/.test(d)) return null;
  return d;
}

// Cadastro bancario padrao do fornecedor (E095HFO, por empresa/filial): usado
// quando o titulo em si nao traz conta -- que e' o caso de ~96% dos titulos.
export const CAMPOS_CADASTRO_BANCARIO = ["CODFOR", "CODEMP", "CODFIL", "CODBAN", "TIPTCC", "CODAGE", "CCBFOR", "DOCIDEFAV"] as const;

function temDadoBancario(l: LinhaSenior | undefined): boolean {
  return !!l && (preenchido(l.CCBFOR) || preenchido(l.CODAGE) || preenchido(l.CODBAN));
}

/** Entre as linhas de E095HFO de um fornecedor, prefere a da mesma empresa/filial do titulo; senao a primeira com dado bancario. */
export function escolherCadastroBancario(linhas: LinhaSenior[] | undefined, codEmp: string, codFil: string): LinhaSenior | undefined {
  const comDado = (linhas ?? []).filter(temDadoBancario);
  return comDado.find((l) => l.CODEMP === codEmp && l.CODFIL === codFil) ?? comDado[0];
}

export function mapearTitulo(
  t: LinhaSenior,
  fornecedor: LinhaSenior | undefined,
  cadastroBancario?: LinhaSenior
): ItemSyncTitulo | null {
  const dataEmissao = dataIso(t.DATEMI);
  if (!t.NUMTIT || !dataEmissao) return null;

  // Conta do proprio titulo tem prioridade; sem ela, a do cadastro do fornecedor.
  const fonte = temDadoBancario(t) ? t : temDadoBancario(cadastroBancario) ? cadastroBancario! : t;
  const agencia = separarDv(fonte.CODAGE);
  const conta = separarDv(fonte.CCBFOR);
  const temConta = temDadoBancario(fonte);
  const barras = soDigitos(t.CODBAR);

  const item: ItemSyncTitulo = {
    numTit: t.NUMTIT.trim(),
    codFil: t.CODFIL,
    codFor: t.CODFOR,
    fornecedorNome: fornecedor?.NOMFOR?.trim() || null,
    tipo: t.CODTPT,
    situacao: t.SITTIT,
    pago: numeroSenior(t.VLRABE) === 0,
    dataEmissao,
    vencimentoOriginal: dataIso(t.VCTORI),
    vencimentoProgramado: dataIso(t.VCTPRO),
    valorOriginal: numeroSenior(t.VLRORI),
    valorAberto: numeroSenior(t.VLRABE),
    dataPagamento: null,
    codccu: preenchido(t.CODCCU) ? t.CODCCU : null,
    ccuNome: null,
    numOcp: null,
    numNfc: preenchido(t.NUMNFC) ? t.NUMNFC : null,
    descricao: t.OBSTCP?.trim() || null,
    lancadoPorCod: preenchido(t.USUGER) ? t.USUGER : null,
    dataLancamento: dataIso(t.DATGER),
    bancoFavorecido: preenchido(fonte.CODBAN) ? soDigitos(fonte.CODBAN).padStart(3, "0") : null,
    agenciaFavorecido: temConta && agencia.base ? agencia.base : null,
    contaFavorecido: temConta && conta.base ? conta.base : null,
    dacFavorecido: temConta && conta.dv ? conta.dv : null,
    tipoContaFavorecido: preenchido(fonte.TIPTCC) ? fonte.TIPTCC : null,
    chavePix: preenchido(t.CHVPIX) ? t.CHVPIX.trim() : null,
    tipoChavePix: preenchido(t.TPCPIX) ? t.TPCPIX : null,
    documentoFavorecido:
      documentoValido(t.DOCIDEFAV) ?? documentoValido(cadastroBancario?.DOCIDEFAV) ?? documentoValido(fornecedor?.CGCCPF),
  };

  // Codigo de barras: so' vai quando o Senior tiver -- omitido (nao null) pra
  // nao apagar um codigo digitado manualmente no app (hoje o Senior nao
  // preenche esse campo em nenhum titulo em aberto).
  if (barras.length === 44 || barras.length === 47) item.codigoBarrasBoleto = barras;

  return item;
}
