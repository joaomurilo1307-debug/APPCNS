// Relatorio de conferencia ANTES de gerar a remessa (06/10/2026, pedido do
// Joao): "antes de gerar a remessa, gerar um relatorio que vai balizar se ta
// tudo certo ou errado, o que falta de dados". Por item: o que falta/esta
// errado, com o nome do campo e como corrigir. O mesmo relatorio e' usado na
// tela (conferencia ao vivo do carrinho) e na geracao (que recusa se sobrar
// erro) -- por isso mora numa funcao so', sem duplicar regra.
//
// A parte de "dado do item" (CPF/CNPJ, conta, chave PIX, codigo de barras...)
// e' pura e fica em cnab240/itau/validacaoItem.ts; aqui entram so' as
// checagens que dependem do banco: titulo ainda aberto, repetido no carrinho
// ou ja enviado em outra remessa.

import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { gerarArquivoRemessa } from "@/lib/cnab240/itau/remessa";
import { linhaDigitavelParaCodigoBarras } from "@/lib/cnab240/itau/codigoBarras";
import { FORMA_PAGAMENTO, segmentoDaForma } from "@/lib/cnab240/itau/constantes";
import type { ContaDebito, ItemRemessa } from "@/lib/cnab240/itau/tipos";
import {
  ROTULO_CAMPO,
  temErroBloqueante,
  validarItemRemessa,
  type ItemParaValidar,
  type ProblemaItem,
} from "@/lib/cnab240/itau/validacaoItem";

// Permissivo de proposito: campo faltando NAO e' erro de formato, e' justamente
// o que o relatorio precisa apontar ("CPF/CNPJ nao informado"). Quem barra e'
// validarItemRemessa, que sabe dizer qual campo e por que.
const texto = z.preprocess((v) => (v === null ? undefined : v), z.string().optional());
const numero = z.preprocess((v) => (v === null ? undefined : v), z.number().optional());

export const itemRemessaSchema = z.object({
  tituloId: texto,
  segmento: texto,
  formaPagamento: texto,
  favorecidoNome: texto,
  favorecidoTipoDoc: texto,
  favorecidoDocumento: texto,
  bancoFavorecido: texto,
  agenciaFavorecido: texto,
  contaFavorecido: texto,
  dacFavorecido: texto,
  codigoBarras: texto,
  chavePixTipo: texto,
  chavePixValor: texto,
  valor: numero,
  dataPagamento: texto,
});

export type ItemConferencia = ItemParaValidar & { tituloId?: string | null };

export type LinhaConferencia = {
  indice: number;
  tituloId: string | null;
  numTit: string | null;
  fornecedor: string;
  valor: number | null;
  problemas: ProblemaItem[];
  situacao: "ok" | "aviso" | "erro";
};

export type ResumoConferencia = {
  total: number;
  ok: number;
  comAviso: number;
  comErro: number;
  valorTotal: number;
  valorPronto: number; // soma dos itens sem erro bloqueante
};

export type RelatorioConferencia = {
  linhas: LinhaConferencia[];
  resumo: ResumoConferencia;
  // Falha do arquivo como um todo (nao de um item especifico), vista no ensaio.
  erroGeral?: string;
};

// Item ja conferido (sem erro bloqueante): campos obrigatorios garantidos por
// validarItemRemessa, so' normaliza pro formato do CNAB. Tipo de documento e
// segmento saem do proprio dado (tamanho do CPF/CNPJ, forma de pagamento) --
// assim um "tipo" desencontrado na tela nunca derruba a geracao.
export type ItemPronto = {
  tituloId: string | null;
  segmento: "A" | "J";
  formaPagamento: string;
  favorecidoNome: string;
  favorecidoTipoDoc: "1" | "2";
  favorecidoDocumento: string;
  bancoFavorecido?: string;
  agenciaFavorecido?: string;
  contaFavorecido?: string;
  dacFavorecido?: string;
  codigoBarras?: string; // 44 digitos
  chavePixTipo?: string;
  chavePixValor?: string;
  valor: number;
  dataPagamento: string;
};

export function ehPix(item: { formaPagamento: string }) {
  return item.formaPagamento === FORMA_PAGAMENTO.PIX_TRANSFERENCIA;
}

export function prepararItem(item: ItemConferencia): ItemPronto {
  const forma = item.formaPagamento ?? "";
  const segmento = segmentoDaForma(forma);
  const documento = (item.favorecidoDocumento ?? "").replace(/\D/g, "");
  const pix = forma === FORMA_PAGAMENTO.PIX_TRANSFERENCIA;
  const vazioParaUndefined = (v: string | undefined) => (v && v.trim() ? v.trim() : undefined);
  const banco = vazioParaUndefined(item.bancoFavorecido);
  const agencia = vazioParaUndefined(item.agenciaFavorecido);
  const conta = vazioParaUndefined(item.contaFavorecido);
  const dac = vazioParaUndefined(item.dacFavorecido);
  // PIX por chave sem conta completa: nao existe banco/agencia/conta de verdade
  // a declarar (o gerador usa "000"/modelo Chave) -- nao deixa passar um banco
  // "341" residual do preenchimento padrao da tela.
  const usaConta = segmento === "A" && !(pix && !(banco && agencia && conta && dac));
  return {
    tituloId: item.tituloId ?? null,
    segmento,
    formaPagamento: forma,
    favorecidoNome: (item.favorecidoNome ?? "").trim(),
    favorecidoTipoDoc: documento.length === 11 ? "1" : "2",
    favorecidoDocumento: documento,
    bancoFavorecido: usaConta ? banco : undefined,
    agenciaFavorecido: usaConta ? agencia : undefined,
    contaFavorecido: usaConta ? conta : undefined,
    dacFavorecido: usaConta ? dac : undefined,
    codigoBarras: segmento === "J" ? linhaDigitavelParaCodigoBarras(item.codigoBarras ?? "") : undefined,
    chavePixTipo: pix ? vazioParaUndefined(item.chavePixTipo) : undefined,
    chavePixValor: pix ? vazioParaUndefined(item.chavePixValor) : undefined,
    valor: item.valor ?? 0,
    dataPagamento: item.dataPagamento ?? "",
  };
}

export function itemParaCnab(item: ItemPronto, referenciaEmpresa: string, numeroSequencial: number): ItemRemessa {
  return {
    referenciaEmpresa,
    numeroSequencial,
    formaPagamento: item.formaPagamento as ItemRemessa["formaPagamento"],
    favorecidoNome: item.favorecidoNome,
    favorecidoTipoDocumento: item.favorecidoTipoDoc,
    favorecidoDocumento: item.favorecidoDocumento,
    valor: item.valor,
    dataPagamento: new Date(`${item.dataPagamento}T00:00:00Z`),
    bancoFavorecido: item.bancoFavorecido,
    agenciaFavorecido: item.agenciaFavorecido,
    contaFavorecido: item.contaFavorecido,
    dacFavorecido: item.dacFavorecido,
    codigoBarras: item.codigoBarras,
    chavePixTipo: item.chavePixTipo as ItemRemessa["chavePixTipo"],
    chavePixValor: item.chavePixValor,
  };
}

/**
 * O Itau exige PIX em arquivo SEPARADO das demais formas (manual SISPAG,
 * "Instrucoes de Procedimentos"). Uma geracao so' -- que sai em 1 arquivo, ou
 * em 2 quando o carrinho mistura PIX com boleto/TED/credito.
 */
export function agruparPorArquivo<T extends { formaPagamento: string }>(itens: T[]): T[][] {
  return [itens.filter((i) => !ehPix(i)), itens.filter((i) => ehPix(i))].filter((g) => g.length > 0);
}

function mensagemDe(e: unknown) {
  return String((e as any)?.message ?? e);
}

function problema(campo: ProblemaItem["campo"], mensagem: string, gravidade: ProblemaItem["gravidade"]): ProblemaItem {
  return { campo, rotulo: ROTULO_CAMPO[campo], mensagem, gravidade };
}

export function resumirConferencia(linhas: LinhaConferencia[]): ResumoConferencia {
  let valorTotal = 0;
  let valorPronto = 0;
  for (const l of linhas) {
    valorTotal += l.valor ?? 0;
    if (l.situacao !== "erro") valorPronto += l.valor ?? 0;
  }
  return {
    total: linhas.length,
    ok: linhas.filter((l) => l.situacao === "ok").length,
    comAviso: linhas.filter((l) => l.situacao === "aviso").length,
    comErro: linhas.filter((l) => l.situacao === "erro").length,
    valorTotal,
    valorPronto,
  };
}

export async function conferirItensRemessa(itens: ItemConferencia[], contaDebito?: ContaDebito): Promise<RelatorioConferencia> {
  const ids = [...new Set(itens.map((i) => i.tituloId).filter((id): id is string => !!id))];

  const titulos = await prisma.tituloContasAPagar.findMany({
    where: { id: { in: ids } },
    select: { id: true, numTit: true, fornecedorNome: true, codFor: true, situacao: true, pago: true },
  });
  const porId = new Map(titulos.map((t) => [t.id, t]));

  // Itens desse titulo que ja estao numa remessa gerada e ainda valem
  // (pendente/agendado/pago): gerar outra vez pode pagar em dobro.
  const emRemessa = await prisma.remessaItemPagamento.findMany({
    where: { tituloId: { in: ids }, status: { in: ["PENDENTE", "AGENDADO", "PAGO"] } },
    select: { tituloId: true, status: true, remessa: { select: { nomeArquivo: true } } },
  });
  const remessasDoTitulo = new Map<string, { status: string; arquivo: string | null }[]>();
  for (const r of emRemessa) {
    if (!r.tituloId) continue;
    const lista = remessasDoTitulo.get(r.tituloId) ?? [];
    lista.push({ status: r.status, arquivo: r.remessa.nomeArquivo });
    remessasDoTitulo.set(r.tituloId, lista);
  }

  const repeticoes = new Map<string, number>();
  for (const i of itens) {
    if (i.tituloId) repeticoes.set(i.tituloId, (repeticoes.get(i.tituloId) ?? 0) + 1);
  }

  const STATUS_LEGIVEL: Record<string, string> = { PENDENTE: "aguardando o banco", AGENDADO: "agendado no banco", PAGO: "já pago, aguardando baixa" };

  const linhas: LinhaConferencia[] = itens.map((item, indice) => {
    const problemas = validarItemRemessa(item);
    const titulo = item.tituloId ? porId.get(item.tituloId) : undefined;

    if (item.tituloId && !titulo) {
      problemas.push(
        problema("titulo", "Título não encontrado na base (foi removido ou ainda não sincronizou) -- atualize a Programação de Pagamento e monte o carrinho de novo.", "erro")
      );
    }
    if (titulo) {
      if (titulo.pago) {
        problemas.push(problema("titulo", "Este título já está pago/baixado no Senior -- tire do carrinho.", "erro"));
      } else if (titulo.situacao !== "AB") {
        problemas.push(
          problema(
            "titulo",
            `Título em situação especial no Senior (${titulo.situacao}) -- pode já estar comprometido em outro pagamento. Não entra na remessa.`,
            "erro"
          )
        );
      }
      if ((repeticoes.get(titulo.id) ?? 0) > 1) {
        problemas.push(problema("titulo", "Este título aparece mais de uma vez no carrinho -- deixe só uma.", "erro"));
      }
      const jaEnviado = remessasDoTitulo.get(titulo.id) ?? [];
      if (jaEnviado.length > 0) {
        const primeiro = jaEnviado[0];
        problemas.push(
          problema(
            "titulo",
            `Já consta na remessa ${primeiro.arquivo ?? "(sem nome)"} (${STATUS_LEGIVEL[primeiro.status] ?? primeiro.status}) -- gerar de novo pode pagar em dobro.`,
            "aviso"
          )
        );
      }
    }

    const situacao: LinhaConferencia["situacao"] = temErroBloqueante(problemas) ? "erro" : problemas.length > 0 ? "aviso" : "ok";
    return {
      indice,
      tituloId: item.tituloId ?? null,
      numTit: titulo?.numTit ?? null,
      fornecedor: titulo?.fornecedorNome || (item.favorecidoNome ?? "").trim() || "—",
      valor: typeof item.valor === "number" && isFinite(item.valor) ? item.valor : null,
      problemas,
      situacao,
    };
  });

  // Ensaio do arquivo CNAB com quem passou na conferencia (nada e' gravado):
  // pega o que so' apareceria na hora de montar o arquivo e diz QUAL titulo
  // causou, em vez de uma excecao solta. So' roda com a conta de debito.
  let erroGeral: string | undefined;
  if (contaDebito) {
    const ensaio = new Date();
    const prontos = linhas.filter((l) => l.situacao !== "erro").map((l) => ({ indice: l.indice, item: prepararItem(itens[l.indice]) }));
    const cnab = (lista: { item: ItemPronto }[]) => lista.map((p, k) => itemParaCnab(p.item, `PREVIA-${String(k + 1).padStart(4, "0")}`, k + 1));
    for (const grupo of agruparPorArquivo(prontos.map((p) => ({ ...p, formaPagamento: p.item.formaPagamento })))) {
      try {
        gerarArquivoRemessa(contaDebito, cnab(grupo), ensaio);
      } catch (e) {
        let isolou = false;
        for (const p of grupo) {
          try {
            gerarArquivoRemessa(contaDebito, cnab([p]), ensaio);
          } catch (e2) {
            isolou = true;
            const linha = linhas[p.indice];
            linha.problemas.push(problema("arquivo", mensagemDe(e2), "erro"));
            linha.situacao = "erro";
          }
        }
        if (!isolou) erroGeral = `Falha ao montar o arquivo da remessa: ${mensagemDe(e)}`;
      }
    }
  }

  return { linhas, resumo: resumirConferencia(linhas), ...(erroGeral ? { erroGeral } : {}) };
}
