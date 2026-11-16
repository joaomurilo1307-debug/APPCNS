// Titulos a pagar da Senior (E501TCP) -> TituloContasAPagar (12/11/2026).
//
// Ate aqui quem buscava os titulos era um script Python num servidor externo (VPS), disparado pelo n8n: ele lia a Senior e
// mandava o retrato completo para POST /api/senior/titulos-pagar/sync. O botao "Atualizar agora" so' avisava o n8n e esperava
// um tempo fixo, sem saber se algo tinha chegado (dominio trocado, credencial vencida ou script parado = dado velho em silencio).
// Agora o proprio sistema le a Senior (lerTitulosDaSenior, porte fiel do sincronizar_titulos_pagar.py) e grava com o mesmo
// codigo que a rota de entrada usa (processarTitulos). A rota continua aceitando o envio externo enquanto o n8n nao for desligado.
//
// Diferencas de proposito em relacao ao script:
//  - qualquer consulta que falhe (depois de novas tentativas) interrompe a busca inteira: retrato parcial nunca e' gravado,
//    porque a gravacao apaga o que nao veio (o script antigo pulava o tipo que falhava e apagava os titulos dele);
//  - tipo de titulo pago que nao esta na lista conhecida entra por uma consulta "todos os outros tipos";
//  - a limpeza do que sumiu roda DEPOIS dos upserts (falha no meio nao apaga nada) e para se for apagar demais de uma vez.

import { z } from "zod";
import { prisma } from "@/lib/prisma";
import type { LinhaSenior } from "../getDbInfo";
import { preenchido, separarDv, soDigitos } from "../mapeamentoTitulos";

export type Consultar = (sql: string, opcoes?: { timeoutMs?: number }) => Promise<LinhaSenior[]>;
export type AoProgredir = (etapa: string) => void;

// ---------------------------------------------------------------- gravacao (antes dentro da rota de entrada)

export const itemTituloSchema = z.object({
  numTit: z.string(),
  codFil: z.string(),
  codFor: z.string(),
  fornecedorNome: z.string().nullable(),
  tipo: z.string(),
  situacao: z.string(),
  pago: z.boolean(),
  dataEmissao: z.string(), // sempre presente na base real
  vencimentoOriginal: z.string().nullable(),
  vencimentoProgramado: z.string().nullable(),
  valorOriginal: z.number(),
  valorAberto: z.number(),
  dataPagamento: z.string().nullable(),
  codccu: z.string().nullable(),
  ccuNome: z.string().nullable(),
  numOcp: z.string().nullable(),
  filOcp: z.string().nullable().optional(),
  numNfc: z.string().nullable().optional(),
  descricao: z.string().nullable().optional(),
  lancadoPorCod: z.string().nullable().optional(),
  dataLancamento: z.string().nullable().optional(),
  // Codigo de barras do boleto (44 digitos), quando o titulo tiver um boleto de cobranca associado -- alimenta a geracao de
  // remessa SISPAG (Pagamentos Itau). Ver docs/integracao-itau.md.
  codigoBarrasBoleto: z.string().nullable().optional(),
  // Dados de pagamento do favorecido, do proprio titulo no Senior (E501TCP: CODBAN/CODAGE/CCBFOR/TIPTCC/CHVPIX/TPCPIX) +
  // CPF/CNPJ do fornecedor.
  bancoFavorecido: z.string().nullable().optional(),
  agenciaFavorecido: z.string().nullable().optional(),
  contaFavorecido: z.string().nullable().optional(),
  dacFavorecido: z.string().nullable().optional(),
  tipoContaFavorecido: z.string().nullable().optional(),
  chavePix: z.string().nullable().optional(),
  tipoChavePix: z.string().nullable().optional(),
  documentoFavorecido: z.string().nullable().optional(),
  // Forma de pagamento (E501TCP.CODFPG). Ausente = nao mexe (o app tambem a busca sozinho na Senior).
  codFpg: z.string().nullable().optional(),
});

export type ItemTitulo = z.infer<typeof itemTituloSchema>;

// Campos de pagamento que so' atualizam quando vieram no payload (undefined = "nao mexe").
function camposDePagamento(item: ItemTitulo) {
  return {
    ...(item.codigoBarrasBoleto !== undefined ? { codigoBarrasBoleto: item.codigoBarrasBoleto } : {}),
    ...(item.bancoFavorecido !== undefined ? { bancoFavorecido: item.bancoFavorecido } : {}),
    ...(item.agenciaFavorecido !== undefined ? { agenciaFavorecido: item.agenciaFavorecido } : {}),
    ...(item.contaFavorecido !== undefined ? { contaFavorecido: item.contaFavorecido } : {}),
    ...(item.dacFavorecido !== undefined ? { dacFavorecido: item.dacFavorecido } : {}),
    ...(item.tipoContaFavorecido !== undefined ? { tipoContaFavorecido: item.tipoContaFavorecido } : {}),
    ...(item.chavePix !== undefined ? { chavePix: item.chavePix } : {}),
    ...(item.tipoChavePix !== undefined ? { tipoChavePix: item.tipoChavePix } : {}),
    ...(item.documentoFavorecido !== undefined ? { documentoFavorecido: item.documentoFavorecido } : {}),
    ...(item.codFpg !== undefined ? { codFpg: item.codFpg } : {}),
  };
}

const chaveDe = (i: { numTit: string; codFil: string; codFor: string; tipo: string; dataEmissao: string }) =>
  `${i.numTit}|${i.codFil}|${i.codFor}|${i.tipo}|${i.dataEmissao}`;

async function emLotes<T>(itens: T[], tamanho: number, fn: (item: T) => Promise<unknown>) {
  for (let i = 0; i < itens.length; i += tamanho) await Promise.all(itens.slice(i, i + tamanho).map(fn));
}

export type ResultadoTitulos = { processados: number; totalRecebido: number; removidos: number; remocaoSuspensa: number };

/**
 * Grava o retrato de titulos. Chave real: (numTit, codFil, codFor, tipo, dataEmissao) -- numTit sozinho NAO identifica um
 * titulo (13/09/2026: 101 pares repetidos). Retrato completo (padrao): o que nao veio de novo sumiu da Senior e sai, depois
 * dos upserts. `incremental`: so' cria/atualiza, sem apagar, e titulo existente recebe so' situacao/vencimento/valor/pagamento.
 * `limiteRemocao`: maximo de titulos apagados de uma vez; acima disso a limpeza nao roda e o total vai em `remocaoSuspensa`.
 */
export async function processarTitulos(
  itens: ItemTitulo[],
  opcoes: { incremental?: boolean; limiteRemocao?: number; limpar?: boolean } = {}
): Promise<ResultadoTitulos> {
  if (itens.length === 0) return { processados: 0, totalRecebido: 0, removidos: 0, remocaoSuspensa: 0 };
  const incremental = !!opcoes.incremental;
  const limpar = opcoes.limpar ?? !incremental;

  let processados = 0;
  await emLotes(itens, 50, async (item) => {
    const dataEmissao = new Date(item.dataEmissao);
    await prisma.tituloContasAPagar.upsert({
      where: {
        numTit_codFil_codFor_tipo_dataEmissao: { numTit: item.numTit, codFil: item.codFil, codFor: item.codFor, tipo: item.tipo, dataEmissao },
      },
      // Incremental: alem dos dados de pagamento, atualiza so' o que vem direto do E501TCP e que o Rito tambem grava igual
      // (situacao, vencimentos, valores). Nao mexe em CC/OC/nome do CC, que o Rito resolve por outras fontes.
      update: incremental
        ? {
            situacao: item.situacao,
            pago: item.pago,
            vencimentoOriginal: item.vencimentoOriginal ? new Date(item.vencimentoOriginal) : null,
            vencimentoProgramado: item.vencimentoProgramado ? new Date(item.vencimentoProgramado) : null,
            valorOriginal: item.valorOriginal,
            valorAberto: item.valorAberto,
            dataPagamento: item.dataPagamento ? new Date(item.dataPagamento) : null,
            ...(item.fornecedorNome ? { fornecedorNome: item.fornecedorNome } : {}),
            ...camposDePagamento(item),
          }
        : {
            fornecedorNome: item.fornecedorNome,
            situacao: item.situacao,
            pago: item.pago,
            vencimentoOriginal: item.vencimentoOriginal ? new Date(item.vencimentoOriginal) : null,
            vencimentoProgramado: item.vencimentoProgramado ? new Date(item.vencimentoProgramado) : null,
            valorOriginal: item.valorOriginal,
            valorAberto: item.valorAberto,
            dataPagamento: item.dataPagamento ? new Date(item.dataPagamento) : null,
            codccu: item.codccu,
            ccuNome: item.ccuNome,
            numOcp: item.numOcp,
            ...(item.filOcp !== undefined ? { filOcp: item.filOcp } : {}),
            ...(item.numNfc !== undefined ? { numNfc: item.numNfc } : {}),
            ...(item.descricao !== undefined ? { descricao: item.descricao } : {}),
            ...(item.lancadoPorCod !== undefined ? { lancadoPorCod: item.lancadoPorCod } : {}),
            ...(item.dataLancamento !== undefined ? { dataLancamento: item.dataLancamento ? new Date(item.dataLancamento) : null } : {}),
            ...camposDePagamento(item),
          },
      create: {
        numTit: item.numTit,
        codFil: item.codFil,
        codFor: item.codFor,
        tipo: item.tipo,
        dataEmissao,
        fornecedorNome: item.fornecedorNome,
        situacao: item.situacao,
        pago: item.pago,
        vencimentoOriginal: item.vencimentoOriginal ? new Date(item.vencimentoOriginal) : null,
        vencimentoProgramado: item.vencimentoProgramado ? new Date(item.vencimentoProgramado) : null,
        valorOriginal: item.valorOriginal,
        valorAberto: item.valorAberto,
        dataPagamento: item.dataPagamento ? new Date(item.dataPagamento) : null,
        codccu: item.codccu,
        ccuNome: item.ccuNome,
        numOcp: item.numOcp,
        filOcp: item.filOcp ?? null,
        numNfc: item.numNfc ?? null,
        descricao: item.descricao ?? null,
        lancadoPorCod: item.lancadoPorCod ?? null,
        dataLancamento: item.dataLancamento ? new Date(item.dataLancamento) : null,
        ...camposDePagamento(item),
      },
    });
    processados++;
  });

  // Limpeza: o retrato e' o universo COMPLETO (aberto + pago, todo ano); o que existe aqui e nao veio de novo foi removido ou
  // cancelado na Senior. Roda depois dos upserts: se algum falhar acima, nada e' apagado.
  let removidos = 0;
  let remocaoSuspensa = 0;
  if (limpar) {
    const recebidas = new Set(itens.map(chaveDe));
    const existentes = await prisma.tituloContasAPagar.findMany({
      select: { id: true, numTit: true, codFil: true, codFor: true, tipo: true, dataEmissao: true },
    });
    const ids = existentes
      .filter((e) => !recebidas.has(`${e.numTit}|${e.codFil}|${e.codFor}|${e.tipo}|${e.dataEmissao.toISOString().slice(0, 10)}`))
      .map((e) => e.id);
    if (opcoes.limiteRemocao !== undefined && ids.length > opcoes.limiteRemocao) {
      remocaoSuspensa = ids.length;
    } else if (ids.length > 0) {
      await prisma.tituloContasAPagar.deleteMany({ where: { id: { in: ids } } });
      removidos = ids.length;
    }
  }
  return { processados, totalRecebido: itens.length, removidos, remocaoSuspensa };
}

/** Apaga titulos pela chave real (busca rapida: os que sumiram da Senior). */
export async function removerTitulos(chaves: { numTit: string; codFil: string; codFor: string; tipo: string; dataEmissao: Date }[]): Promise<number> {
  let removidos = 0;
  for (let i = 0; i < chaves.length; i += 100) {
    const lote = chaves.slice(i, i + 100);
    const r = await prisma.tituloContasAPagar.deleteMany({
      where: { OR: lote.map((t) => ({ numTit: t.numTit, codFil: t.codFil, codFor: t.codFor, tipo: t.tipo, dataEmissao: t.dataEmissao })) },
    });
    removidos += r.count;
  }
  return removidos;
}

// ---------------------------------------------------------------- leitura na Senior (porte do sincronizar_titulos_pagar.py)

const CAMPOS =
  "NUMTIT, CODEMP, CODFIL, CODFOR, CODTPT, SITTIT, DATEMI, VCTORI, VCTPRO, VLRORI, VLRABE, CODCCU, ULTPGT, NUMOCP, " +
  "CODBAN, TIPTCC, CODAGE, CCBFOR, CODBAR, DOCIDEFAV, TPCPIX, CHVPIX, CODFPG, USU_NUMOCP, NUMNFC, OBSTCP, USUGER, DATGER";
const CAMPOS_CADASTRO_BANCARIO = "CODFOR, CODEMP, CODFIL, CODBAN, TIPTCC, CODAGE, CCBFOR, DOCIDEFAV";

// Pagos (SITTIT='LQ') de uma vez estouram o tempo da Senior (13/09/2026): vao em pedacos por tipo. Os tipos conhecidos vem da
// base (GROUP BY CODTPT, 13/09/2026); um tipo novo entra pela consulta "todos os outros".
export const TIPOS_PAGOS = ["OUT", "NFS", "NFC", "FAT", "CTE", "TAI", "ADT", "FER", "RES", "GFD", "SFP",
  "FIN", "DIS", "ISS", "IRF", "COF", "PIS", "SDT", "IMP", "INS", "SUB", "CSL"];

/** Numero da Senior como o script lia: "1.234,56" -> 1234.56; invalido -> 0. */
export function numero(v: string | undefined): number {
  const n = Number(String(v ?? "").trim().replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

/** "dd/mm/aaaa" -> "aaaa-mm-dd"; ano 1900 (data vazia na Senior) ou invalido -> null. */
export function dataIso(v: string | undefined): string | null {
  const partes = String(v ?? "").split("/");
  if (partes.length !== 3 || !partes.every((p) => /^\d+$/.test(p.trim()))) return null;
  const [dd, mm, aaaa] = partes.map((p) => p.trim());
  if (aaaa === "1900") return null;
  return `${aaaa}-${mm}-${dd}`;
}

/**
 * CPF (11) ou CNPJ (14) plausivel. CGCCPF e' NUMBER na Senior e perde o zero a esquerda (30/09/2026): so' completa o zero
 * quando TIPFOR confirma o tipo (F = CPF, J = CNPJ). Mesmo criterio do script (sem conferir digito verificador).
 */
export function documentoPlausivel(v: string | undefined, tipoPessoa?: string): string | null {
  let d = soDigitos(v);
  if (tipoPessoa === "F" && d.length === 10) d = "0" + d;
  if (tipoPessoa === "J" && d.length === 13) d = "0" + d;
  if (d.length !== 11 && d.length !== 14) return null;
  if (/^(\d)\1+$/.test(d)) return null;
  return d;
}

const temDadoBancario = (l: LinhaSenior | undefined) => !!l && (preenchido(l.CCBFOR) || preenchido(l.CODAGE) || preenchido(l.CODBAN));

/** Entre as linhas de E095HFO do fornecedor: a da mesma empresa/filial do titulo; senao a primeira com dado bancario. */
export function escolherCadastro(linhas: LinhaSenior[] | undefined, codEmp: string | undefined, codFil: string | undefined) {
  const comDado = (linhas ?? []).filter(temDadoBancario);
  return comDado.find((l) => l.CODEMP === codEmp && l.CODFIL === codFil) ?? comDado[0];
}

const MAX_IN = 400;
const lotes = <T>(itens: T[], tamanho: number) => Array.from({ length: Math.ceil(itens.length / tamanho) }, (_, i) => itens.slice(i * tamanho, (i + 1) * tamanho));

/** Monta o item do titulo como o script montava (mesmos campos, mesmas regras). null = titulo sem data de emissao valida. */
export function montarItemTitulo(
  r: LinhaSenior,
  fornecedor: { nome?: string; tipo?: string; cgccpf?: string } | undefined,
  cadastros: LinhaSenior[] | undefined,
  nomesCcu: Map<string, string>
): ItemTitulo | null {
  const dataEmissao = dataIso(r.DATEMI);
  if (!dataEmissao) return null;
  const codFor = String(r.CODFOR ?? "").trim();
  const codccu = (r.CODCCU ?? "").trim();
  const valorAberto = numero(r.VLRABE);
  const pago = valorAberto <= 0;
  let numOcp = String(r.NUMOCP ?? "0").trim();
  // 22/10/2026: sem NUMOCP nativo, usa o campo USU_NUMOCP digitado no titulo.
  if (numOcp === "" || numOcp === "0") numOcp = String(r.USU_NUMOCP ?? "").trim();

  // Conta do proprio titulo tem prioridade; sem ela, a do cadastro do fornecedor (E095HFO).
  const tipoPessoa = fornecedor?.tipo;
  const cadastro = escolherCadastro(cadastros, r.CODEMP, r.CODFIL);
  const fonte = temDadoBancario(r) ? r : temDadoBancario(cadastro) ? cadastro! : r;
  const agencia = separarDv(fonte.CODAGE).base;
  const conta = separarDv(fonte.CCBFOR);
  const temConta = temDadoBancario(fonte);
  const barras = soDigitos(r.CODBAR);

  const item: ItemTitulo = {
    numTit: r.NUMTIT,
    codFil: r.CODFIL,
    codFor,
    fornecedorNome: fornecedor?.nome || null,
    tipo: r.CODTPT,
    situacao: r.SITTIT,
    pago,
    dataEmissao,
    vencimentoOriginal: dataIso(r.VCTORI),
    vencimentoProgramado: dataIso(r.VCTPRO),
    valorOriginal: Math.round(numero(r.VLRORI) * 100) / 100,
    valorAberto: Math.round(valorAberto * 100) / 100,
    dataPagamento: pago ? dataIso(r.ULTPGT) : null,
    codccu: codccu || null,
    ccuNome: nomesCcu.get(codccu) || null,
    numOcp: numOcp && numOcp !== "0" ? numOcp : null,
    bancoFavorecido: preenchido(fonte.CODBAN) ? soDigitos(fonte.CODBAN).padStart(3, "0") : null,
    agenciaFavorecido: temConta && agencia ? agencia : null,
    contaFavorecido: temConta && conta.base ? conta.base : null,
    dacFavorecido: temConta && conta.dv ? conta.dv : null,
    tipoContaFavorecido: preenchido(fonte.TIPTCC) ? fonte.TIPTCC : null,
    chavePix: preenchido(r.CHVPIX) ? r.CHVPIX.trim() : null,
    tipoChavePix: preenchido(r.TPCPIX) ? r.TPCPIX : null,
    documentoFavorecido:
      documentoPlausivel(r.DOCIDEFAV, tipoPessoa) ?? documentoPlausivel(cadastro?.DOCIDEFAV, tipoPessoa) ?? documentoPlausivel(fornecedor?.cgccpf, tipoPessoa),
    codFpg: preenchido(r.CODFPG) ? String(r.CODFPG).trim() : null,
  };
  // 48 digitos comecando com 8 = conta de consumo/tributo (Segmento O). Sem codigo valido o campo nao vai (nao apaga o digitado).
  if (barras.length === 44 || barras.length === 47 || (barras.length === 48 && barras.startsWith("8"))) item.codigoBarrasBoleto = barras;
  // 12/11/2026 (alem do script): nota fiscal de compra que gerou o titulo -- o vinculo OC x titulo (regra de 30/10) liga pela NF,
  // e sem ela quase nenhum titulo achava a OC --, historico, quem lancou e quando. So' vao quando a Senior tem o dado
  // (ausente = nao mexe no que ja existe).
  if (preenchido(r.NUMNFC)) item.numNfc = r.NUMNFC.trim();
  if ((r.OBSTCP ?? "").trim()) item.descricao = r.OBSTCP.trim();
  if (preenchido(r.USUGER)) item.lancadoPorCod = r.USUGER.trim();
  const lancadoEm = dataIso(r.DATGER);
  if (lancadoEm) item.dataLancamento = lancadoEm;
  return item;
}

/** Fornecedores (E095FOR), cadastro bancario (E095HFO) e centros de custo (E044CCU) das linhas lidas; monta os itens. */
async function montarItens(consultar: Consultar, linhas: LinhaSenior[], aoProgredir: AoProgredir) {
  const codigos = [...new Set(linhas.map((r) => String(r.CODFOR ?? "").trim()).filter((c) => c && c !== "0" && /^\d+$/.test(c)))].sort((a, b) => Number(a) - Number(b));
  const fornecedores = new Map<string, { nome: string; tipo: string; cgccpf: string }>();
  const cadastros = new Map<string, LinhaSenior[]>();
  const grupos = lotes(codigos, MAX_IN);
  for (const [i, lote] of grupos.entries()) {
    aoProgredir(`lendo fornecedores (${i + 1}/${grupos.length})`);
    const lista = lote.join(",");
    for (const f of await consultar(`SELECT CODFOR, NOMFOR, APEFOR, CGCCPF, TIPFOR FROM E095FOR WHERE CODFOR IN (${lista})`, { timeoutMs: 120_000 })) {
      fornecedores.set(String(f.CODFOR).trim(), { nome: (f.NOMFOR ?? "").trim() || (f.APEFOR ?? "").trim(), tipo: (f.TIPFOR ?? "").trim(), cgccpf: f.CGCCPF });
    }
    // Cadastro bancario sem travar em CODEMP=1: fornecedor pode ter conta so' noutra empresa do grupo (30/09/2026).
    for (const c of await consultar(`SELECT ${CAMPOS_CADASTRO_BANCARIO} FROM E095HFO WHERE CODFOR IN (${lista})`, { timeoutMs: 120_000 })) {
      const cod = String(c.CODFOR).trim();
      cadastros.set(cod, [...(cadastros.get(cod) ?? []), c]);
    }
  }
  aoProgredir("lendo centros de custo");
  const nomesCcu = new Map(
    (await consultar("SELECT CODCCU, DESCCU FROM E044CCU WHERE CODEMP=1", { timeoutMs: 60_000 })).map((c) => [(c.CODCCU ?? "").trim(), (c.DESCCU ?? "").trim()] as const)
  );

  const itens: ItemTitulo[] = [];
  let semDataEmissao = 0;
  for (const r of linhas) {
    const codFor = String(r.CODFOR ?? "").trim();
    const item = montarItemTitulo(r, fornecedores.get(codFor), cadastros.get(codFor), nomesCcu);
    if (item) itens.push(item);
    else semDataEmissao++;
  }
  return { itens, semDataEmissao };
}

export type TituloConhecido = { numTit: string; codFil: string; codFor: string; tipo: string; dataEmissao: Date };
const chaveConhecido = (t: TituloConhecido) => `${t.numTit}|${t.codFil}|${t.codFor}|${t.tipo}|${t.dataEmissao.toISOString().slice(0, 10)}`;

/**
 * Busca RAPIDA (botao e rodadas de 10 min, 12/11/2026): o historico inteiro de pagos leva ~15 min na Senior, e quase nada
 * dele muda. Le os abertos e as demais situacoes (tudo que pode mudar) e, pelo numero, os titulos que o sistema tinha fora de
 * "pago" e que sairam dessas listas (foram pagos, ou excluidos na Senior). `naoPagosNoSistema`: titulos gravados aqui com
 * situacao diferente de LQ. Devolve os itens para gravar (modo completo, sem limpeza geral) e as chaves que sumiram da Senior.
 * O que nasce ja pago na Senior so' entra na busca completa (de tempos em tempos).
 */
export async function lerTitulosRecentesDaSenior(
  consultar: Consultar,
  naoPagosNoSistema: TituloConhecido[],
  aoProgredir: AoProgredir = () => {}
): Promise<{ itens: ItemTitulo[]; semDataEmissao: number; sumiram: TituloConhecido[] }> {
  aoProgredir("lendo títulos em aberto");
  const abertos = await consultar(`SELECT ${CAMPOS} FROM E501TCP WHERE SITTIT='AB'`, { timeoutMs: 200_000 });
  aoProgredir("lendo títulos em outras situações");
  const outros = await consultar(`SELECT ${CAMPOS} FROM E501TCP WHERE SITTIT NOT IN ('AB','LQ')`, { timeoutMs: 200_000 });
  const linhas = [...abertos, ...outros];

  const chaveLinha = (r: LinhaSenior) => `${r.NUMTIT}|${r.CODFIL}|${String(r.CODFOR ?? "").trim()}|${r.CODTPT}|${dataIso(r.DATEMI)}`;
  const vistas = new Set(linhas.map(chaveLinha));
  const sairam = naoPagosNoSistema.filter((t) => !vistas.has(chaveConhecido(t)));
  const numeros = [...new Set(sairam.map((t) => t.numTit))];
  const grupos = lotes(numeros, MAX_IN);
  for (const [i, lote] of grupos.entries()) {
    aoProgredir(`lendo títulos que saíram de aberto (${i + 1}/${grupos.length})`);
    const lista = lote.map((n) => `'${n.replace(/'/g, "")}'`).join(",");
    for (const r of await consultar(`SELECT ${CAMPOS} FROM E501TCP WHERE NUMTIT IN (${lista})`, { timeoutMs: 120_000 })) {
      const k = chaveLinha(r);
      if (!vistas.has(k)) {
        vistas.add(k);
        linhas.push(r);
      }
    }
  }
  const sumiram = sairam.filter((t) => !vistas.has(chaveConhecido(t)));
  const { itens, semDataEmissao } = await montarItens(consultar, linhas, aoProgredir);
  return { itens, semDataEmissao, sumiram };
}

/**
 * Busca COMPLETA: le todos os titulos da Senior (abertos, pagos e demais situacoes) e devolve o retrato inteiro, pronto para
 * gravar com limpeza. Leva ~15 min (12/11/2026: so' os pagos NFS, ~120-200 s por tentativa) -- roda de madrugada.
 */
export async function lerTitulosDaSenior(consultar: Consultar, aoProgredir: AoProgredir = () => {}): Promise<{ itens: ItemTitulo[]; semDataEmissao: number }> {
  aoProgredir("lendo títulos em aberto");
  const abertos = await consultar(`SELECT ${CAMPOS} FROM E501TCP WHERE SITTIT='AB'`, { timeoutMs: 200_000 });

  const pagos: LinhaSenior[] = [];
  const tiposPagos = [...TIPOS_PAGOS, null]; // null = todos os outros tipos
  for (const [i, tipo] of tiposPagos.entries()) {
    aoProgredir(`lendo títulos pagos (${i + 1}/${tiposPagos.length})`);
    const filtro = tipo ? `CODTPT='${tipo}'` : `CODTPT NOT IN (${TIPOS_PAGOS.map((t) => `'${t}'`).join(",")})`;
    pagos.push(...(await consultar(`SELECT ${CAMPOS} FROM E501TCP WHERE SITTIT='LQ' AND ${filtro}`, { timeoutMs: 400_000 })));
  }

  aoProgredir("lendo títulos em outras situações");
  // 30/09/2026: titulo movido para CA/PE/AV/LS/LV nao vinha em nenhum conjunto e era apagado do sistema.
  const outros = await consultar(`SELECT ${CAMPOS} FROM E501TCP WHERE SITTIT NOT IN ('AB','LQ')`, { timeoutMs: 200_000 });
  return montarItens(consultar, [...abertos, ...pagos, ...outros], aoProgredir);
}
