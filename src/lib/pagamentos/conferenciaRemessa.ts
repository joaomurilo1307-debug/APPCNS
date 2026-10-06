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
};

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

export async function conferirItensRemessa(itens: ItemConferencia[]): Promise<RelatorioConferencia> {
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

  return { linhas, resumo: resumirConferencia(linhas) };
}
