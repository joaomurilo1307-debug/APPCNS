// Dados de pagamento que vao DENTRO do titulo (pra remessa CNAB depois). Mesma ordem
// de confianca da remessa (dadosPagamentoTitulos.ts): cadastro bancario do
// fornecedor (E095HFO) > o que o comprador digitou na OC (conta e PIX, marcado
// fonte="oc"). Cadastro com cara de placeholder (banco 111, tudo repetido) e' ignorado.
// Nada e' inventado: o que nao for inequivoco fica fora do titulo e vira aviso.

import { consultarSenior, type LinhaSenior } from "./getDbInfo";
import { COD_EMP } from "./ocsConferencia";
import { carregarCatalogoFormasPagamento } from "./formasPagamento";
import { CAMPOS_CADASTRO_BANCARIO, documentoFavorecido, documentoValido, escolherCadastroBancario, preenchido, separarDv, soDigitos } from "./mapeamentoTitulos";
import { interpretarChavePix, interpretarContaDaOc } from "./dadosPagamentoTitulos";
import type { TituloNovo } from "./gravarTitulo";

export type PagamentoDoTitulo = {
  formaPagamento: string | null;
  codFpg: string | null;
  conta: { banco: string; agencia: string; conta: string; fonte: "cadastro" | "oc" } | null;
  pix: { tipo: number; valor: string } | null;
  documentoFavorecido: string | null;
  avisos: string[];
  /** Campos prontos pra entrar no GravarTitulosCP. */
  campos: Pick<TituloNovo, "codFpg" | "codBan" | "codAge" | "ccbFor" | "tipTcc" | "tpcPix" | "chvPix">;
};

const repetido = (v: string) => v.length > 0 && /^(.)\1*$/.test(v);

/** Cadastro bancario da Senior que nao e' placeholder (ex.: banco 111 / agencia 11111 / conta 111111). */
export function cadastroBancarioReal(l: LinhaSenior | undefined): boolean {
  if (!l) return false;
  const banco = soDigitos(l.CODBAN);
  const ag = soDigitos(l.CODAGE);
  const cc = soDigitos(l.CCBFOR);
  if (!banco || !ag || !cc) return false;
  return !(repetido(banco) || repetido(ag) || repetido(cc));
}

export async function montarPagamentoDoTitulo(oc: LinhaSenior, codFor: string, codFil: string): Promise<PagamentoDoTitulo> {
  const avisos: string[] = [];
  const [forn] = await consultarSenior(`SELECT CODFOR, CGCCPF, TIPFOR FROM E095FOR WHERE CODFOR IN (${Number(codFor)})`);
  const hfo = await consultarSenior(
    `SELECT ${CAMPOS_CADASTRO_BANCARIO.join(", ")} FROM E095HFO WHERE CODEMP IN (${COD_EMP}) AND CODFIL IN (${Number(codFil)}) AND CODFOR IN (${Number(codFor)})`
  );
  const cad = escolherCadastroBancario(hfo, String(COD_EMP), codFil);
  const catalogo = await carregarCatalogoFormasPagamento().catch(() => new Map<string, string>());

  const codFpg = preenchido(oc.CODFPG) ? oc.CODFPG.trim() : null;
  const formaPagamento = codFpg ? catalogo.get(codFpg) ?? null : null;

  let conta: PagamentoDoTitulo["conta"] = null;
  let codAge: string | undefined;
  let ccbFor: string | undefined;
  let codBan: string | undefined;
  let tipTcc: number | undefined;
  if (cadastroBancarioReal(cad)) {
    codBan = soDigitos(cad!.CODBAN).padStart(3, "0");
    codAge = cad!.CODAGE.trim();
    ccbFor = cad!.CCBFOR.trim();
    if (/^\d+$/.test(cad!.TIPTCC ?? "") && Number(cad!.TIPTCC) >= 1 && Number(cad!.TIPTCC) <= 10) tipTcc = Number(cad!.TIPTCC);
    conta = { banco: codBan, agencia: codAge, conta: ccbFor, fonte: "cadastro" };
  } else {
    const daOc = interpretarContaDaOc(oc);
    if (daOc) {
      codBan = daOc.banco;
      // Mantem o digito como veio na OC ("1104-5"), no mesmo formato dos titulos reais da Senior.
      codAge = (oc.USU_CODAGE ?? "").trim();
      ccbFor = (oc.USU_NUMCCO ?? "").trim();
      conta = { banco: daOc.banco, agencia: codAge, conta: ccbFor, fonte: "oc" };
    } else if (preenchido(oc.USU_CODAGE) || preenchido(oc.USU_NUMCCO)) {
      avisos.push("A OC traz agência/conta, mas não deu pra interpretar com segurança (banco ou dígito ausente): conta não enviada no título.");
    }
  }

  const pixLido = interpretarChavePix(oc.USU_CHVPIX);
  if (preenchido(oc.USU_CHVPIX) && !pixLido) avisos.push(`Chave PIX da OC ("${oc.USU_CHVPIX.trim()}") ambígua: não enviada no título.`);
  const pix = pixLido ? { tipo: Number(pixLido.tipo), valor: pixLido.valor } : null;

  // Favorecido (docIdeFav/codFav) NAO vai no titulo: a Senior recusa quando o favorecido nao esta
  // cadastrado (erro real 15/10/2026). A remessa usa o CPF/CNPJ do cadastro do fornecedor.
  const docOc = soDigitos(oc.USU_CGCCPF);
  const documento =
    documentoFavorecido(cad?.DOCIDEFAV) ?? documentoFavorecido(cad?.CODFAV) ?? (docOc ? documentoFavorecido(docOc) : null) ?? documentoValido(forn?.CGCCPF, forn?.TIPFOR);

  if (!conta && !pix) avisos.push("Sem conta bancária nem PIX: o financeiro precisa completar os dados de pagamento do título na Senior antes da remessa.");
  if (/BOLETO|BLOQUETO/i.test(formaPagamento ?? "")) avisos.push("Forma de pagamento é boleto: o código de barras não vem da OC e precisa ser informado no título na Senior.");

  return {
    formaPagamento,
    codFpg,
    conta,
    pix,
    documentoFavorecido: documento,
    avisos,
    campos: {
      codFpg: codFpg ?? undefined,
      codBan,
      codAge,
      ccbFor,
      tipTcc,
      tpcPix: pix?.tipo,
      chvPix: pix?.valor,
    },
  };
}
