// Leitura AO VIVO dos dados de pagamento dos titulos na Senior (somente leitura),
// pra o carrinho de remessa nao depender do sincronismo agendado. Pedido do
// Joao (06/10/2026), depois de gerar a programacao dos dias 7 e 8: 15 dos 25
// titulos vinham "sem dados" mesmo havendo dado no Senior que o sistema nao
// puxava (CPF/CNPJ da Lex perdendo zeros, conta digitada so' na OC...). Aqui
// consulta direto: o proprio titulo, o cadastro bancario do fornecedor
// (E095HFO), o cadastro do fornecedor (E095FOR) e, como COMPLEMENTO sinalizado
// ("da OC"), o que o comprador digitou na OC -- chave PIX e conta.
//
// Ordem de confianca (primeiro que tiver ganha): titulo > cadastro do fornecedor
// > OC. Dado vindo da OC e' texto livre digitado a mao, entao so' e' usado quando
// a leitura e' inequivoca e sempre volta marcado fonte="oc" pra a tela pedir
// conferencia.

import { consultarSenior, type LinhaSenior } from "./getDbInfo";
import { carregarCatalogoFormasPagamento } from "./formasPagamento";
import {
  CAMPOS_CADASTRO_BANCARIO,
  CAMPOS_TITULO,
  documentoValido,
  documentoFavorecido,
  escolherCadastroBancario,
  mapearTitulo,
  preenchido,
  separarDv,
  soDigitos,
  dataIso,
} from "./mapeamentoTitulos";
import { cnpjValido, cpfValido } from "../cnab240/itau/validacaoItem";
import { linhaDigitavelParaCodigoBarras } from "../cnab240/itau/codigoBarras";

export type FonteDado = "titulo" | "cadastro" | "oc";
export type TipoChavePix = "01" | "02" | "03" | "04";

export type DadosSeniorDoTitulo = {
  tituloId: string;
  documento: string | null;
  origemDocumento?: "titulo" | "cadastro" | "fornecedor" | "oc" | null;
  problemas?: string[];
  conta: { banco: string; agencia: string; conta: string; dac: string; fonte: FonteDado; nota?: string } | null;
  chavePix: { tipo: TipoChavePix; valor: string; fonte: FonteDado } | null;
  codigoBarras: string | null;
  codFpg: string | null;
  formaPagamento: string | null; // descricao por extenso (catalogo F066FPG)
  codFpgTitulo?: string | null; // Apenas E501TCP; nao usa fallback da OC na conferencia.
  formaPagamentoTitulo?: string | null;
  achouNoSenior: boolean; // o titulo ainda esta aberto na Senior
};

export type PedidoTitulo = { tituloId: string; numTit: string; codFil: string; codFor: string; numOcp: string | null; codFilOc?: string | null; tipo?: string; dataEmissao?: string };

// ---------- interpretadores do texto digitado na OC ----------

const BANCOS: [RegExp, string][] = [
  [/BANCO DO BRASIL|\bBB\b/, "001"],
  [/BRADESCO/, "237"],
  [/ITAU/, "341"],
  [/CAIXA|\bCEF\b/, "104"],
  [/SANTANDER/, "033"],
  [/SICOOB/, "756"],
  [/SICREDI/, "748"],
  [/NUBANK|NU PAGAMENTOS/, "260"],
  [/BANCO INTER|\bINTER\b/, "077"],
  [/\bC6\b/, "336"],
  [/BANRISUL/, "041"],
  [/\bBTG\b/, "208"],
  [/SAFRA/, "422"],
  [/BANCO ORIGINAL|\bORIGINAL\b/, "212"],
  [/NORDESTE|\bBNB\b/, "004"],
  [/AMAZONIA|\bBASA\b/, "003"],
  [/MERCADO PAGO/, "323"],
  [/PAGBANK|PAGSEGURO/, "290"],
];

function semAcento(texto: string) {
  return texto.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase();
}

export function codigoDoBanco(nome: string): string | null {
  const n = semAcento(nome);
  for (const [padrao, codigo] of BANCOS) if (padrao.test(n)) return codigo;
  return null;
}

/** "Banco do Brasil" + agência "1104-5" + conta "13406-6" -> {001, 1104, 13406, 6}; null se não for inequívoco. */
export function interpretarContaDaOc(l: LinhaSenior | undefined): { banco: string; agencia: string; conta: string; dac: string } | null {
  if (!l) return null;
  const banco = codigoDoBanco(l.USU_DESCCO ?? "");
  const agencia = separarDv(l.USU_CODAGE);
  const conta = separarDv(l.USU_NUMCCO);
  if (!banco || !agencia.base || !conta.base || !conta.dv) return null;
  // Digitação óbvia errada (ex.: OC 15620 trouxe "1104-5" nos dois campos): agência
  // e conta iguais -- não chuta, deixa pra conferir.
  if ((l.USU_CODAGE ?? "").replace(/\s/g, "") === (l.USU_NUMCCO ?? "").replace(/\s/g, "")) return null;
  return { banco, agencia: agencia.base, conta: conta.base, dac: conta.dv };
}

/** Chave PIX digitada em texto livre ("(31) 99977-9720", "49.692.145/0001-90", "x@y.com", "32301818000130 (CNPJ)") -> tipo + valor limpo; null se ambígua. */
export function interpretarChavePix(textoBruto: string | undefined): { tipo: TipoChavePix; valor: string } | null {
  if (!textoBruto) return null;
  const texto = textoBruto
    .replace(/[^\x20-\x7E]/g, " ") // lixo de codificação (ex.: "�")
    .replace(/\((cnpj|cpf|e-?mail|telefone|celular|aleat[oó]ria|pix)\)/gi, " ")
    .trim();
  if (!texto) return null;

  const email = texto.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/);
  if (email) return { tipo: "02", valor: email[0] };

  const aleatoria = texto.match(/[0-9a-fA-F]{8}-?[0-9a-fA-F]{4}-?[0-9a-fA-F]{4}-?[0-9a-fA-F]{4}-?[0-9a-fA-F]{12}/);
  if (aleatoria) return { tipo: "04", valor: aleatoria[0].toLowerCase() };

  const digitos = soDigitos(texto);
  const formatadoComoTelefone = /[()+]/.test(texto);
  if (digitos.length === 14 && cnpjValido(digitos)) return { tipo: "03", valor: digitos };
  if (digitos.length === 11 && !formatadoComoTelefone && cpfValido(digitos)) return { tipo: "03", valor: digitos };
  if ((digitos.length === 10 || digitos.length === 11) && formatadoComoTelefone) return { tipo: "01", valor: `+55${digitos}` };
  if ((digitos.length === 12 || digitos.length === 13) && digitos.startsWith("55") && formatadoComoTelefone) return { tipo: "01", valor: `+${digitos}` };
  return null; // 11 dígitos soltos que não fecham CPF etc.: não chuta
}

/** CPF/CNPJ vindo de campo numérico (perde zeros à esquerda): recupera só se o dígito verificador fecha. */
function documentoPorDigitos(valor: string | undefined): string | null {
  const d = soDigitos(valor);
  if (d.length >= 12 && d.length <= 14 && cnpjValido(d.padStart(14, "0"))) return d.padStart(14, "0");
  if (d.length >= 9 && d.length <= 11 && cpfValido(d.padStart(11, "0"))) return d.padStart(11, "0");
  return null;
}

// ---------- consulta ----------

const lista = (valores: string[]) => valores.join(",");

export async function buscarDadosPagamento(pedidos: PedidoTitulo[], conferencia = false): Promise<{ dados: DadosSeniorDoTitulo[]; avisos: string[] }> {
  const avisos: string[] = [];
  const fornecedores = [...new Set(pedidos.map((p) => p.codFor).filter((c) => /^\d+$/.test(c)))];
  if (fornecedores.length === 0) return { dados: [], avisos: ["Nenhum fornecedor válido pra consultar."] };

  // Uma consulta por vez: a Senior atende mal várias ao mesmo tempo (medido em
  // 06/10/2026: 4 simultâneas -> 3 estouraram 60s; uma por vez leva ~1,5s cada).
  const tentar = async <T,>(fonte: string, consulta: () => Promise<T>, vazio: T): Promise<T> => {
    try {
      return await consulta();
    } catch (e: any) {
      avisos.push(`${fonte}: ${String(e?.message ?? e).replace(/<[^>]+>/g, " ").slice(0, 160)}`);
      return vazio;
    }
  };

  const titulosSenior = await tentar(
    "títulos",
    () => consultarSenior(`SELECT ${CAMPOS_TITULO.join(", ")} FROM E501TCP WHERE CODEMP = 1 AND NUMTIT IN (${[...new Set(pedidos.map(p => "'" + p.numTit.replace(/'/g, "''") + "'"))].join(",")}) AND CODFOR IN (${lista(fornecedores)})`),
    [] as LinhaSenior[]
  );
  // Se a identidade principal nao pode ser lida, nao prolonga a falha com
  // outras consultas nem tenta construir um destino so pelo fornecedor.
  if (!titulosSenior.length) return {
    avisos,
    dados: pedidos.map(p=>({tituloId:p.tituloId,documento:null,origemDocumento:null,conta:null,chavePix:null,codigoBarras:null,codFpg:null,formaPagamento:null,codFpgTitulo:null,formaPagamentoTitulo:null,achouNoSenior:false,problemas:[avisos.length ? "Consulta dos titulos indisponivel. Dados nao confirmados." : "Titulo nao localizado com identificacao completa na Senior."]})),
  };
  const fornecedoresSenior = await tentar(
    "cadastro do fornecedor",
    () => consultarSenior(`SELECT CODFOR, NOMFOR, CGCCPF, TIPFOR FROM E095FOR WHERE CODFOR IN (${lista(fornecedores)})`),
    [] as LinhaSenior[]
  );
  const cadastros = await tentar(
    "cadastro bancário do fornecedor",
    () =>
      consultarSenior(
        `SELECT ${CAMPOS_CADASTRO_BANCARIO.join(", ")} FROM E095HFO WHERE CODEMP = 1 AND CODFIL IN (${[...new Set(pedidos.map(p=>p.codFil).filter(c=>/^\d+$/.test(c)))].join(',')}) AND CODFOR IN (${lista(fornecedores)})`
      ),
    [] as LinhaSenior[]
  );
  const precisaComplementoOc = (t: LinhaSenior | undefined) => !!t && t.CODFPG !== "18" && !preenchido(t.CODBAR) && !preenchido(t.CHVPIX) && !(preenchido(t.CODBAN) && preenchido(t.CODAGE) && preenchido(t.CCBFOR));
  const ocs = [...new Set([...pedidos.filter(p=>precisaComplementoOc(titulosSenior.find(t=>t.NUMTIT === p.numTit && t.CODTPT === p.tipo && t.CODFOR === p.codFor && t.CODFIL === p.codFil && dataIso(t.DATEMI) === p.dataEmissao))).map(p=>p.numOcp),...titulosSenior.filter(precisaComplementoOc).map(t=>t.NUMOCP)].filter((n):n is string=>!!n&&/^\d+$/.test(n)&&Number(n)>0))];
  const ocsSenior =
    ocs.length > 0
      ? await tentar(
          "OC",
          () =>
            consultarSenior(
              `SELECT CODEMP, CODFIL, CODFOR, NUMOCP, CODFPG, USU_CHVPIX, USU_CODAGE, USU_NUMCCO, USU_DESCCO, USU_CGCCPF FROM E420OCP WHERE CODEMP = 1 AND NUMOCP IN (${lista(ocs)}) AND CODFOR IN (${lista(fornecedores)})`
            ),
          [] as LinhaSenior[]
        )
      : ([] as LinhaSenior[]);
  const catalogo = await carregarCatalogoFormasPagamento().catch(() => new Map<string, string>());
  const fornecedorPorCodigo = new Map(fornecedoresSenior.map((f) => [f.CODFOR.trim(), f]));
  const cadastrosPorFornecedor = new Map<string, LinhaSenior[]>();
  for (const c of cadastros) cadastrosPorFornecedor.set(c.CODFOR.trim(), [...(cadastrosPorFornecedor.get(c.CODFOR.trim()) ?? []), c]);

  const dados = pedidos.map((p): DadosSeniorDoTitulo => {
    const problemas: string[] = [];
    const linhasDoTitulo = titulosSenior.filter((t) => Number(t.CODFOR) === Number(p.codFor) && t.NUMTIT.trim() === p.numTit.trim() && Number(t.CODFIL) === Number(p.codFil) &&
      (t.CODEMP === "1" && t.CODTPT.trim() === p.tipo && dataIso(t.DATEMI) === p.dataEmissao));
    const encontrada = linhasDoTitulo.length === 1 ? linhasDoTitulo[0] : undefined;
    const linha = encontrada && Number(encontrada.VLRABE.replace(',', '.')) > 0 && encontrada.SITTIT !== "CA" && !encontrada.SITTIT.startsWith("L") ? encontrada : undefined;
    if (!linha) problemas.push(linhasDoTitulo.length > 1 ? "Identificacao ambigua: mais de um titulo corresponde ao pedido." : encontrada ? "Titulo pago ou cancelado na Senior." : "Titulo nao localizado pela empresa, filial, fornecedor, numero, tipo e emissao.");
    const forn = fornecedorPorCodigo.get(p.codFor);
    const cadastro = escolherCadastroBancario(cadastrosPorFornecedor.get(p.codFor), linha?.CODEMP ?? "1", p.codFil);
    const numeroOc = linha && preenchido(linha.NUMOCP) ? linha.NUMOCP : p.numOcp;
    const filialOc = linha && preenchido(linha.FILOCP) ? linha.FILOCP : p.codFilOc ?? p.codFil;
    const candidatasOc = ocsSenior.filter(o=>o.CODEMP === "1" && Number(o.CODFIL) === Number(filialOc) && Number(o.CODFOR) === Number(p.codFor) && o.NUMOCP === numeroOc);
    const oc = candidatasOc.length === 1 ? candidatasOc[0] : undefined;
    const base = linha ? mapearTitulo(linha, forn, cadastro) : null;

    const contaBase =
      base && (base.bancoFavorecido || base.agenciaFavorecido || base.contaFavorecido)
        ? {
            banco: base.bancoFavorecido ?? "",
            agencia: base.agenciaFavorecido ?? "",
            conta: base.contaFavorecido ?? "",
            dac: base.dacFavorecido ?? "",
            fonte: (linha && (preenchido(linha.CCBFOR) || preenchido(linha.CODAGE) || preenchido(linha.CODBAN)) ? "titulo" : "cadastro") as FonteDado,
          }
        : null;
    const contaOc = !contaBase ? interpretarContaDaOc(oc) : null;
    if (contaBase && !contaBase.dac) problemas.push("Conta bancaria preenchida na Senior sem digito verificador separado por hifen. Banco, agencia e conta foram extraidos; informe/confirme o digito, sem retirar automaticamente o ultimo algarismo da conta.");

    const tipoPix = base?.tipoChavePix ? String(Number(base.tipoChavePix)) : "";
    const pixBase = base?.chavePix && /^[1-4]$/.test(tipoPix) ? { tipo: `0${tipoPix}` as TipoChavePix, valor: base.chavePix } : null;
    const pixOc = !pixBase ? interpretarChavePix(oc?.USU_CHVPIX) : null;

    const codFpg = base?.codFpg ?? null;
    let codigoBarras: string | null = null;
    if (linha && preenchido(linha.CODBAR)) {
      try { codigoBarras = linhaDigitavelParaCodigoBarras(linha.CODBAR); }
      catch { problemas.push("Codigo de barras/linha digitavel do titulo na Senior invalido: confira tamanho e digitos verificadores."); }
    }
    const docTitulo = documentoFavorecido(linha?.DOCIDEFAV) ?? documentoFavorecido(linha?.CODFAV);
    const favorecidoInformado = preenchido(linha?.DOCIDEFAV) || preenchido(linha?.CODFAV);
    if (favorecidoInformado && !docTitulo) problemas.push("Documento do favorecido no titulo invalido ou ambiguo; nao foi substituido pelo documento do fornecedor.");
    const docCadastro = documentoFavorecido(cadastro?.DOCIDEFAV) ?? documentoFavorecido(cadastro?.CODFAV);
    const docFornecedor = documentoValido(forn?.CGCCPF, forn?.TIPFOR);
    const docOc = documentoPorDigitos(oc?.USU_CGCCPF);

    return {
      tituloId: p.tituloId,
      documento: linha ? favorecidoInformado ? docTitulo : docCadastro ?? docFornecedor ?? docOc : null,
      origemDocumento: !linha ? null : favorecidoInformado ? "titulo" : docCadastro ? "cadastro" : docFornecedor ? "fornecedor" : docOc ? "oc" : null,
      problemas,
      conta: linha ? contaBase ?? (contaOc ? { ...contaOc, fonte: "oc", nota: oc?.USU_DESCCO?.trim() } : null) : null,
      chavePix: linha ? pixBase ? { ...pixBase, fonte: "titulo" } : pixOc ? { ...pixOc, fonte: "oc" } : null : null,
      codigoBarras,
      codFpg,
      formaPagamento: codFpg ? catalogo.get(codFpg) ?? null : null,
      codFpgTitulo: base?.codFpg ?? null,
      formaPagamentoTitulo: base?.codFpg ? catalogo.get(base.codFpg) ?? null : null,
      achouNoSenior: !!linha,
    };
  });

  return { dados, avisos };
}
