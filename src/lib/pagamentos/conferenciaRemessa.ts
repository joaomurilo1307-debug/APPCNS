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
import { carregarCatalogoFormasPagamento } from "@/lib/senior/formasPagamento";
import { ehCartaoCredito } from "./cartaoCredito";
import { buscarDadosPagamento, type DadosSeniorDoTitulo } from "../senior/dadosPagamentoTitulos";
import { corrigirChavePix } from "@/lib/cnab240/itau/chavePix";
import { gerarArquivoRemessa } from "@/lib/cnab240/itau/remessa";
import { linhaDigitavelParaCodigoBarras, parseCodigoBarras, valorDoCodigoBarras } from "@/lib/cnab240/itau/codigoBarras";
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
  beneficiarioBoletoConferido: texto,
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

const BANCOS_ITAU = ["341", "409"]; // mesmo conjunto da Nota 11 do manual (Itau / Unibanco)

/**
 * A forma de pagamento precisa ser COERENTE com o banco, senao o Itau rejeita o registro
 * (07/10/2026: 4 remessas rejeitadas -- "forma incompativel com a titularidade", "no do banco
 * para transferencia invalido (237)", "dados boletos divergentes CIP"). Definicoes do manual (Nota 5):
 *  - 30 = titulo em cobranca NO ITAU (codigo de barras do banco 341); 31 = titulo em cobranca em OUTROS bancos.
 *  - 01 = credito em conta corrente NO ITAU -- so vale pra conta Itau/Unibanco.
 * Quando a incoerencia e' inequivoca, corrige sozinho (e quem chama avisa); o resto vira erro na conferencia.
 */
export function formaCoerente(item: { formaPagamento?: string; codigoBarras?: string; bancoFavorecido?: string }): { forma: string; motivo: string | null } {
  const forma = item.formaPagamento ?? "";
  const segmento = segmentoDaForma(forma);
  if (segmento === "J") {
    let banco: string | null = null;
    try {
      banco = linhaDigitavelParaCodigoBarras(item.codigoBarras ?? "").slice(0, 3);
    } catch {
      banco = null; // codigo invalido: quem barra e' validarItemRemessa
    }
    if (banco) {
      const esperada = banco === "341" ? FORMA_PAGAMENTO.BOLETO_ITAU : FORMA_PAGAMENTO.BOLETO_OUTROS_BANCOS;
      if (forma !== esperada) {
        return {
          forma: esperada,
          motivo: `Boleto do banco ${banco}: a forma certa é ${esperada} (${esperada === FORMA_PAGAMENTO.BOLETO_ITAU ? "cobrança no Itaú" : "cobrança em outros bancos"}), e não ${forma}. O arquivo usou ${esperada}.`,
        };
      }
    }
  } else if (forma === FORMA_PAGAMENTO.CREDITO_CONTA_ITAU) {
    const banco = (item.bancoFavorecido ?? "").replace(/\D/g, "").padStart(3, "0");
    if (banco !== "000" && !BANCOS_ITAU.includes(banco)) {
      return {
        forma: FORMA_PAGAMENTO.TED_OUTRO_TITULAR,
        motivo: `Crédito em conta corrente (01) só vale para conta Itaú; o banco do favorecido é ${banco}. O arquivo usou TED outro titular (41).`,
      };
    }
  }
  return { forma, motivo: null };
}

export function ehPix(item: { formaPagamento: string }) {
  return item.formaPagamento === FORMA_PAGAMENTO.PIX_TRANSFERENCIA;
}

export function prepararItem(item: ItemConferencia): ItemPronto {
  const forma = formaCoerente(item).forma;
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
  // Mesma correcao da conferencia: chave que e' o CPF/CNPJ digitado como telefone vai como CPF/CNPJ.
  const chave = pix ? corrigirChavePix(item.chavePixTipo, item.chavePixValor, item.favorecidoDocumento) : null;
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
    chavePixTipo: chave ? vazioParaUndefined(chave.tipo) : undefined,
    chavePixValor: chave ? vazioParaUndefined(chave.valor) : undefined,
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

export async function conferirItensRemessa(itensOriginais: ItemConferencia[], contaDebito?: ContaDebito, verificarSenior = false): Promise<RelatorioConferencia> {
  // Chave PIX que e' o CPF/CNPJ do favorecido digitado como telefone e' corrigida sozinha (tipo 03) e
  // vira aviso -- o mesmo ajuste que prepararItem faz na hora de montar o arquivo.
  const correcoesChave = itensOriginais.map((i) =>
    i.formaPagamento === FORMA_PAGAMENTO.PIX_TRANSFERENCIA ? corrigirChavePix(i.chavePixTipo, i.chavePixValor, i.favorecidoDocumento) : null
  );
  // Forma de pagamento incoerente com o banco (boleto 30/31 x banco do codigo de barras; 01 x banco nao-Itau):
  // corrigida sozinha e avisada -- e' o que o Itau rejeitaria (ver formaCoerente).
  const correcoesForma = itensOriginais.map((i) => formaCoerente(i));
  const itens = itensOriginais.map((i, k) => {
    let novo: ItemConferencia = i;
    if (correcoesChave[k]?.correcao) novo = { ...novo, chavePixTipo: correcoesChave[k]!.tipo, chavePixValor: correcoesChave[k]!.valor };
    if (correcoesForma[k].motivo) novo = { ...novo, formaPagamento: correcoesForma[k].forma };
    return novo;
  });
  const ids =[...new Set(itens.map((i) => i.tituloId).filter((id): id is string => !!id))];

  const titulos = await prisma.tituloContasAPagar.findMany({
    where: { id: { in: ids } },
    select: {
      id: true,
      numTit: true,
      fornecedorNome: true,
      codFor: true,
      codFil: true,
      dataEmissao: true,
      tipo: true,
      codFpg: true,
      situacao: true,
      pago: true,
      numNfc: true,
      vencimentoProgramado: true,
    },
  });
  const porId = new Map(titulos.map((t) => [t.id, t]));
  const catalogoForma = await carregarCatalogoFormasPagamento().catch(() => new Map<string, string>());
  const dadosAtuais = new Map<string, DadosSeniorDoTitulo>();
  const falhasLeitura = new Map<string, string>();
  if (verificarSenior) {
    const pedidos = titulos.filter(t=>t.tipo !== "PRV").map(t=>({tituloId:t.id,numTit:t.numTit,codFil:t.codFil,codFor:t.codFor,tipo:t.tipo,dataEmissao:t.dataEmissao.toISOString().slice(0,10),numOcp:null}));
    for (let k=0;k<pedidos.length;k+=100) {
      const lote=pedidos.slice(k,k+100);
      const leitura=await buscarDadosPagamento(lote);
      for (const d of leitura.dados) dadosAtuais.set(d.tituloId,d);
      if (leitura.avisos.length) for (const p of lote) falhasLeitura.set(p.tituloId,"Consulta atual da Senior incompleta. Atualize os dados e tente novamente; nenhum dado incompleto pode confirmar a geracao.");
    }
  }

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
    const tituloCartao = titulos.find(t => t.id === item.tituloId);
    if (tituloCartao && ehCartaoCredito(tituloCartao.codFpg, tituloCartao.codFpg ? catalogoForma.get(tituloCartao.codFpg) : null)) {
      problemas.push(problema("formaPagamento", "Cartão de Crédito: título apenas para conferência, não pode gerar remessa.", "erro"));
    }
    const correcaoDaChave = correcoesChave[indice]?.correcao;
    if (correcaoDaChave) problemas.push(problema("chavePix", correcaoDaChave, "aviso"));
    const motivoDaForma = correcoesForma[indice].motivo;
    if (motivoDaForma) problemas.push(problema("formaPagamento", motivoDaForma, "aviso"));
    // "Titularidade": TED mesmo titular (43) so' vale pra CPF/CNPJ da PROPRIA empresa debitada; TED outro
    // titular (41) com o CPF/CNPJ da propria empresa deve ser 43. (Itau: "forma incompativel com a titularidade".)
    if (contaDebito) {
      const docItem = (item.favorecidoDocumento ?? "").replace(/\D/g, "");
      const docEmpresa = (contaDebito.cnpj ?? "").replace(/\D/g, "");
      if (docItem && docEmpresa) {
        if (item.formaPagamento === FORMA_PAGAMENTO.TED_MESMO_TITULAR && docItem !== docEmpresa) {
          problemas.push(
            problema(
              "formaPagamento",
              `TED mesmo titular (43) só vale quando o CPF/CNPJ do favorecido é o da própria empresa debitada (${docEmpresa}); este é ${docItem}. Use TED outro titular (41).`,
              "erro"
            )
          );
        } else if (item.formaPagamento === FORMA_PAGAMENTO.TED_OUTRO_TITULAR && docItem === docEmpresa) {
          problemas.push(
            problema("formaPagamento", "O favorecido tem o CPF/CNPJ da própria empresa debitada: use TED mesmo titular (43), não 41.", "erro")
          );
        }
      }
    }
    const titulo = item.tituloId ? porId.get(item.tituloId) : undefined;
    if (verificarSenior && titulo && titulo.tipo !== "PRV") {
      const d = dadosAtuais.get(titulo.id);
      if (falhasLeitura.has(titulo.id)) problemas.push(problema("titulo", falhasLeitura.get(titulo.id)!, "erro"));
      else if (!d?.achouNoSenior) problemas.push(problema("titulo", d?.problemas?.join(" ") || "Titulo nao localizado com identificacao completa na Senior. Atualize a programacao.", "erro"));
      else {
        if (ehCartaoCredito(d.codFpgTitulo, d.formaPagamentoTitulo)) problemas.push(problema("formaPagamento","Cartao de Credito confirmado no titulo atual da Senior: nao pode gerar remessa.","erro"));
        const descricaoForma = (d.formaPagamentoTitulo ?? "").toLowerCase();
        const tituloBoleto = d.codFpgTitulo === "18" || descricaoForma.includes("boleto");
        const tituloPix = d.codFpgTitulo === "19" || descricaoForma.includes("pix");
        if ((tituloBoleto && segmentoDaForma(item.formaPagamento ?? "") !== "J") || (tituloPix && !ehPix({ formaPagamento: item.formaPagamento ?? "" }))) {
          problemas.push(problema("formaPagamento", "Forma de pagamento do carrinho difere da forma atual do titulo na Senior. Atualize os dados antes de gerar.", "erro"));
        }
        if (segmentoDaForma(item.formaPagamento ?? "") === "J" && d.codigoBarras) {
          let barras: string | null = null;
          try { barras=linhaDigitavelParaCodigoBarras(item.codigoBarras ?? ""); } catch { /* erro ja indicado */ }
          if (barras && barras !== d.codigoBarras) problemas.push(problema("codigoBarras","O boleto do carrinho difere do codigo atual deste titulo na Senior. Atualize os dados; nao e permitido cruzar boletos entre titulos.","erro"));
        }
        const documento=(item.favorecidoDocumento ?? "").replace(/\D/g, "");
        if (d.origemDocumento === "titulo" && !d.documento) problemas.push(problema("favorecidoDocumento","Documento do favorecido informado no titulo atual da Senior e invalido ou ambiguo. Corrija o titulo antes de gerar.","erro"));
        if (d.origemDocumento === "titulo" && d.documento && documento !== d.documento) problemas.push(problema("favorecidoDocumento","CPF/CNPJ do carrinho difere do favorecido informado no titulo atual da Senior. Atualize os dados ou corrija o cadastro do titulo.","erro"));
        if (d.conta?.fonte === "titulo" && d.conta.dac && segmentoDaForma(item.formaPagamento ?? "") === "A" && item.formaPagamento !== "45") {
          const valores=[item.bancoFavorecido,item.agenciaFavorecido,item.contaFavorecido,item.dacFavorecido].map(v=>(v??"").replace(/^0+/,""));
          const atuais=[d.conta.banco,d.conta.agencia,d.conta.conta,d.conta.dac].map(v=>v.replace(/^0+/,""));
          if (JSON.stringify(valores)!==JSON.stringify(atuais)) problemas.push(problema("contaFavorecido","Conta do carrinho difere da conta preenchida no titulo atual da Senior. Atualize os dados antes de gerar.","erro"));
        }
      }
    }

    if (item.tituloId && !titulo) {
      problemas.push(
        problema("titulo", "Título não encontrado na base (foi removido ou ainda não sincronizou) -- atualize a Programação de Pagamento e monte o carrinho de novo.", "erro")
      );
    }
    if (titulo) {
      // 06/10/2026 (programacao dos dias 7 e 8: 7 dos 25 eram PRV): provisao e'
      // lancamento contabil de despesa futura (folha, ISS, retirada...), nao uma
      // divida com fornecedor -- nao tem conta, boleto nem CPF/CNPJ e nunca vai
      // pra remessa.
      if (titulo.tipo === "PRV") {
        problemas.splice(0); // o resto (CPF/CNPJ, conta...) nao se aplica a provisao -- so' esta explicacao
        problemas.push(
          problema(
            "titulo",
            "Este título é uma PROVISÃO contábil (tipo PRV) — lançamento de despesa futura, não um pagamento a fornecedor. Não entra em remessa: tire do carrinho.",
            "erro"
          )
        );
      }
      const descricaoForma = titulo.codFpg ? catalogoForma.get(titulo.codFpg) ?? null : null;
      if (descricaoForma && /cart[aã]o/i.test(descricaoForma)) {
        problemas.push(
          problema(
            "formaPagamento",
            `Na Senior este título está como "${descricaoForma}" (forma ${titulo.codFpg}) — é pago na fatura do cartão, não por remessa. Se mandar pela remessa, paga duas vezes. Confirme se a forma está certa na Senior.`,
            "aviso"
          )
        );
      }
      if (descricaoForma && /boleto/i.test(descricaoForma)) {
        for (const p of problemas) {
          if (p.campo === "codigoBarras" && p.gravidade === "erro" && p.mensagem.startsWith("Boleto sem código de barras")) {
            p.mensagem += ` Na Senior este título está como "${descricaoForma}". Atualize os dados do titulo; se a consulta confirmar que o codigo nao esta cadastrado, copie do boleto/PDF do fornecedor.`;
          }
        }
      }
      if (titulo.pago) {
        problemas.push(problema("titulo", "Este título já está pago/baixado no Senior -- tire do carrinho.", "erro"));
      } else if (titulo.situacao !== "AB") {
        // 07/10/2026 (pedido do João): era erro bloqueante. Remessa feita pela
        // Senior e rejeitada pelo Itaú deixa o título preso em PE, e ele precisa
        // pagar por aqui -- então vira aviso forte; quem decide é o usuário.
        const mensagem =
          titulo.situacao === "CA"
            ? "Título CANCELADO no Senior (CA) — corrija a situação na Senior antes de gerar pagamento."
            : `Título em situação especial no Senior (${titulo.situacao}) -- normalmente é porque entrou numa remessa da própria Senior. ` +
              `Se essa remessa foi rejeitada/cancelada e o pagamento sai por aqui, tudo certo; se ela ainda puder ser paga, será pagamento em dobro. ` +
              `Depois de pago, a baixa na Senior fica manual (o botão "Baixar na Sênior" não mexe em título fora de Aberto).`;
        problemas.push(problema("titulo", mensagem, titulo.situacao === "CA" ? "erro" : "aviso"));
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
            "erro"
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

  // ---- Checagens entre titulos/boletos (06/10/2026, pedido do Joao) ----
  // "1 boleto para 2 titulos" (NF de servico + NF de produto no mesmo boleto):
  // se os dois entram na remessa cada um com o seu valor, o boleto e' pago duas
  // vezes ou o banco recusa por valor menor que o do boleto. Aqui avisa quais
  // sao, com a prova (o valor do boleto = soma dos dois) quando ha codigo de barras.
  const codFors = [...new Set(titulos.map((t) => t.codFor))];
  const abertosDoFornecedor = await prisma.tituloContasAPagar.findMany({
    where: { codFor: { in: codFors }, pago: false, situacao: "AB" },
    select: { id: true, numTit: true, codFor: true, numNfc: true, valorAberto: true, vencimentoProgramado: true },
  });

  // Valor nominal do boleto (embutido no proprio codigo de barras), por item.
  const boletoDoItem = itens.map((item) => {
    if (segmentoDaForma(item.formaPagamento ?? "") !== "J") return null;
    try {
      const cb = linhaDigitavelParaCodigoBarras(item.codigoBarras ?? "");
      return { cb, nominal: valorDoCodigoBarras(parseCodigoBarras(cb).valor) };
    } catch {
      return null; // codigo invalido ja foi apontado por validarItemRemessa
    }
  });

  const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const rotuloLinha = (i: number) => linhas[i].numTit || (itens[i].favorecidoNome ?? "").trim() || `item ${i + 1}`;

  const mesmoDia = (a: Date | null, b: Date | null) => !!a && !!b && a.toISOString().slice(0, 10) === b.toISOString().slice(0, 10);

  // (a) o MESMO boleto em mais de um item -- so' pode ser pago uma vez. Se os
  // valores dos itens somam o valor do boleto, e' o caso "1 boleto para N titulos".
  const itensPorBoleto = new Map<string, number[]>();
  boletoDoItem.forEach((b, i) => {
    if (b) itensPorBoleto.set(b.cb, [...(itensPorBoleto.get(b.cb) ?? []), i]);
  });
  const emBoletoRepetido = new Set<number>(); // esses itens ja' tem a explicacao completa abaixo
  for (const indices of itensPorBoleto.values()) {
    if (indices.length < 2) continue;
    const nominal = boletoDoItem[indices[0]]!.nominal;
    const soma = indices.reduce((s, i) => s + (itens[i].valor ?? 0), 0);
    const quais = indices.map(rotuloLinha).join(", ");
    const texto =
      nominal > 0 && Math.abs(soma - nominal) <= 0.01
        ? `BOLETO ÚNICO PARA ${indices.length} TÍTULOS: este mesmo boleto (${brl(nominal)}) está em ${indices.length} itens (${quais}) e os valores deles somam o valor do boleto. Ele só pode ser pago uma vez: deixe UM item com o valor do boleto (${brl(nominal)}) e tire os outros — a baixa dos demais títulos na Senior fica manual.`
        : `Este mesmo boleto aparece em ${indices.length} itens (${quais}). Um boleto só pode ser pago uma vez — se ele cobre mais de um título (ex.: NF de serviço + NF de produto), deixe só UM item com o valor total do boleto e tire os outros.`;
    for (const i of indices) {
      emBoletoRepetido.add(i);
      linhas[i].problemas.push(problema("codigoBarras", texto, "erro"));
    }
  }

  // (b) valor do item diferente do valor do boleto. Se outro titulo aberto do
  // mesmo fornecedor completa a soma, e' "1 boleto para 2 titulos"; entre
  // candidatos de mesmo valor (parcelas de meses diferentes) vale o mais provavel:
  // mesma NF e mesmo vencimento primeiro.
  itens.forEach((item, i) => {
    const b = boletoDoItem[i];
    if (emBoletoRepetido.has(i) || !b || !(b.nominal > 0) || typeof item.valor !== "number") return;
    const valor = item.valor;
    if (Math.abs(b.nominal - valor) <= 0.01) return;
    const meuId = linhas[i].tituloId;
    const meu = meuId ? porId.get(meuId) : undefined;
    const pontos = (s: (typeof abertosDoFornecedor)[number]) =>
      (meu && s.numNfc && s.numNfc !== "0" && s.numNfc === meu.numNfc ? 2 : 0) + (meu && mesmoDia(s.vencimentoProgramado, meu.vencimentoProgramado) ? 1 : 0);
    const candidatos = abertosDoFornecedor
      .filter((s) => s.id !== meuId && Math.abs(valor + s.valorAberto - b.nominal) <= 0.01)
      .sort((x, y) => pontos(y) - pontos(x));
    const parceiro = candidatos[0];
    if (parceiro) {
      linhas[i].problemas.push(
        problema(
          "codigoBarras",
          `BOLETO ÚNICO PARA 2 TÍTULOS: este boleto é de ${brl(b.nominal)} = este título (${brl(valor)}) + o título ${parceiro.numTit} (${brl(parceiro.valorAberto)}) do mesmo fornecedor${candidatos.length > 1 ? ` (há outros títulos de ${brl(parceiro.valorAberto)} — conferir qual é)` : ""}. Pague os dois num item só, com o valor do boleto (${brl(b.nominal)}) — a baixa automática na Senior não fecha os dois títulos nesse caso, a do outro fica manual.`,
          "erro"
        )
      );
    } else {
      linhas[i].problemas.push(
        problema(
          "valor",
          `O valor do item (${brl(valor)}) é diferente do valor do boleto (${brl(b.nominal)}). Se for juros, multa ou desconto, tudo bem; se o boleto cobre mais de um título, ajuste o valor.`,
          "aviso"
        )
      );
    }
  });

  // (c) possivel titulo duplicado e (d) mesma NF + mesmo vencimento (possivel boleto unico),
  // so' quando nao ha prova de que o boleto e' so' deste titulo.
  const chaveTitulo = (numTit: string) => {
    const t = numTit.toUpperCase().replace(/\s+/g, "");
    const m = t.match(/^(.+?)[$=_]0*(\d+)$/);
    return m ? `${m[1]}#${Number(m[2])}` : `${t}#1`; // "485", "485=1" e "485$01" sao a mesma parcela 1
  };

  linhas.forEach((l, i) => {
    const t = l.tituloId ? porId.get(l.tituloId) : undefined;
    const valor = itens[i].valor;
    if (!t || typeof valor !== "number") return;
    const outros = abertosDoFornecedor.filter((s) => s.id !== t.id);

    const duplicado = outros.find((s) => chaveTitulo(s.numTit) === chaveTitulo(t.numTit) && Math.abs(s.valorAberto - valor) <= 0.01);
    if (duplicado) {
      l.problemas.push(
        problema(
          "titulo",
          `Possível título duplicado: o título ${duplicado.numTit} tem o mesmo número, a mesma parcela e o mesmo valor (${brl(valor)}) — confira antes de pagar pra não pagar duas vezes.`,
          "aviso"
        )
      );
    }

    // So' sugere "pode ser 1 boleto para 2 titulos" quando NAO ha como saber pelo
    // boleto: se o valor do boleto ja' e' conhecido, ou e' o proprio titulo (valor
    // igual) ou a regra (b)/(a) acima ja' explicou a diferenca.
    const b = boletoDoItem[i];
    const valorDoBoletoConhecido = !!b && b.nominal > 0;
    if (!valorDoBoletoConhecido && t.numNfc && t.numNfc !== "0") {
      const mesmaNf = outros.find(
        (s) =>
          s.id !== duplicado?.id &&
          s.numNfc === t.numNfc &&
          mesmoDia(s.vencimentoProgramado, t.vencimentoProgramado) &&
          Math.abs(s.valorAberto - valor) > 0.01
      );
      if (mesmaNf) {
        l.problemas.push(
          problema(
            "titulo",
            `Pode ser 1 boleto para 2 títulos: o título ${mesmaNf.numTit} (${brl(mesmaNf.valorAberto)}) é da mesma NF e vence no mesmo dia. Confira se o boleto cobre os dois — se sim, o valor dele é a soma (${brl(valor + mesmaNf.valorAberto)}) e deve ir num item só.`,
            "aviso"
          )
        );
      }
    }
  });

  for (const l of linhas) {
    l.situacao = temErroBloqueante(l.problemas) ? "erro" : l.problemas.length > 0 ? "aviso" : "ok";
  }

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
