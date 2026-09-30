import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

// Programação de Contas a Pagar por título (E501TCP, Senior). Traz abertos
// (SITTIT='AB') e pagos (SITTIT='LQ') -- pedido do João 13/09/2026: ver o
// histórico de pagos e a programação da semana, não só o que está aberto.
//
// Escopo: histórico COMPLETO (todo ano), sem corte de data -- pedido do
// João 14/09/2026 à noite ("aumente o histórico, buscar todas igual no
// Senior"), revertendo um corte pra só-2026 pedido mais cedo no MESMO dia.
// O payload representa o universo COMPLETO a cada sync, então a limpeza de
// "sumiu da fonte" roda sobre TUDO (aberto e pago) -- qualquer coisa que não
// veio de novo (removida/cancelada no Senior) é órfã e sai.
//
// Chave: numTit sozinho NÃO identifica um título (nem +codFil, nem +codFor
// -- achado 13/09/2026, 101 pares repetidos, 161 títulos se perderiam).
// (numTit,codFil,codFor,tipo,dataEmissao) é a chave real, 100% única.
//
// Quando um título MUDA de aberto pra pago no Senior, a chave continua a
// MESMA -- o upsert atualiza a linha existente (pago:true, dataPagamento
// preenchida) em vez de duplicar.
//
// Envio em lote único (não em páginas) -- a limpeza de janela só funciona
// certa com o conjunto completo numa chamada só. Upserts em paralelo
// limitado (50 por vez), bem mais rápido que um a um.

const itemSchema = z.object({
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
  // Codigo de barras do boleto (44 digitos), quando o titulo tiver um
  // boleto de cobranca associado -- alimenta a geracao de remessa SISPAG
  // (Pagamentos Itaú). Ver docs/integracao-itau.md.
  codigoBarrasBoleto: z.string().nullable().optional(),
  // Dados de pagamento do favorecido, do proprio titulo no Senior (E501TCP:
  // CODBAN/CODAGE/CCBFOR/TIPTCC/CHVPIX/TPCPIX) + CPF/CNPJ do fornecedor.
  bancoFavorecido: z.string().nullable().optional(),
  agenciaFavorecido: z.string().nullable().optional(),
  contaFavorecido: z.string().nullable().optional(),
  dacFavorecido: z.string().nullable().optional(),
  tipoContaFavorecido: z.string().nullable().optional(),
  chavePix: z.string().nullable().optional(),
  tipoChavePix: z.string().nullable().optional(),
  documentoFavorecido: z.string().nullable().optional(),
});

const bodySchema = z.object({ itens: z.array(itemSchema) });

type ItemSync = z.infer<typeof itemSchema>;

// Campos de pagamento que so' atualizam quando vieram no payload (undefined =
// "nao mexe"), mesmo padrao dos outros campos opcionais deste sync.
function camposDePagamento(item: ItemSync) {
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
  };
}

function chaveDe(i: { numTit: string; codFil: string; codFor: string; tipo: string; dataEmissao: string }) {
  return `${i.numTit}|${i.codFil}|${i.codFor}|${i.tipo}|${i.dataEmissao}`;
}

async function emLotes<T>(items: T[], tamanho: number, fn: (item: T) => Promise<unknown>) {
  for (let i = 0; i < items.length; i += tamanho) {
    await Promise.all(items.slice(i, i + tamanho).map(fn));
  }
}

export async function POST(req: Request) {
  const chave = req.headers.get("x-sync-key");
  if (!chave || chave !== process.env.SENIOR_SYNC_KEY) {
    return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Payload invalido", detalhes: parsed.error.flatten() }, { status: 422 });
  }

  const itens = parsed.data.itens;
  if (itens.length === 0) {
    return NextResponse.json({ ok: true, processados: 0, totalRecebido: 0, removidos: 0 });
  }

  // ?modo=incremental: o payload NAO e' o universo completo (ex.: so' os
  // titulos em aberto, mandados em lotes por scripts/senior-sync-pagamentos.ts).
  // Nesse modo nada e' removido, e titulo que ja existe so' recebe os campos
  // de pagamento e de situacao/vencimento/valor -- nao sobrescreve o que o
  // Rito resolve por outras fontes (nome do CC, OC, etc.).
  // Titulo que ainda nao existe e' criado com todos os campos enviados.
  const incremental = new URL(req.url).searchParams.get("modo") === "incremental";

  // limpeza: o payload representa o universo COMPLETO de 2026 (aberto +
  // pago) a cada sync -- qualquer linha existente que nao veio de novo
  // (de fora de 2026, ou removida/cancelada no Senior) e' orfa e sai.
  let idsParaRemover: string[] = [];
  if (!incremental) {
    const chavesRecebidas = new Set(itens.map(chaveDe));
    const existentes = await prisma.tituloContasAPagar.findMany({
      select: { id: true, numTit: true, codFil: true, codFor: true, tipo: true, dataEmissao: true },
    });
    idsParaRemover = existentes
      .filter((e) => !chavesRecebidas.has(`${e.numTit}|${e.codFil}|${e.codFor}|${e.tipo}|${e.dataEmissao.toISOString().slice(0, 10)}`))
      .map((e) => e.id);
    if (idsParaRemover.length > 0) {
      await prisma.tituloContasAPagar.deleteMany({ where: { id: { in: idsParaRemover } } });
    }
  }

  let processados = 0;
  await emLotes(itens, 50, async (item) => {
    const dataEmissao = new Date(item.dataEmissao);
    await prisma.tituloContasAPagar.upsert({
      where: {
        numTit_codFil_codFor_tipo_dataEmissao: {
          numTit: item.numTit,
          codFil: item.codFil,
          codFor: item.codFor,
          tipo: item.tipo,
          dataEmissao,
        },
      },
      // Incremental: alem dos dados de pagamento, atualiza so' o que vem direto
      // do E501TCP e que o Rito tambem grava igual (situacao, vencimentos,
      // valores) -- e' o que muda quando alguem reprograma/corrige o titulo no
      // Senior. Nao mexe em CC/OC/nome do CC, que o Rito resolve por outras fontes.
      update: incremental ? {
        situacao: item.situacao,
        pago: item.pago,
        vencimentoOriginal: item.vencimentoOriginal ? new Date(item.vencimentoOriginal) : null,
        vencimentoProgramado: item.vencimentoProgramado ? new Date(item.vencimentoProgramado) : null,
        valorOriginal: item.valorOriginal,
        valorAberto: item.valorAberto,
        ...(item.fornecedorNome ? { fornecedorNome: item.fornecedorNome } : {}),
        ...camposDePagamento(item),
      } : {
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
        ...(item.dataLancamento !== undefined
          ? { dataLancamento: item.dataLancamento ? new Date(item.dataLancamento) : null }
          : {}),
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

  return NextResponse.json({ ok: true, processados, totalRecebido: itens.length, removidos: idsParaRemover.length });
}

export async function GET(req: Request) {
  const chave = req.headers.get("x-sync-key");
  if (!chave || chave !== process.env.SENIOR_SYNC_KEY) {
    return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });
  }
  const total = await prisma.tituloContasAPagar.count();
  return NextResponse.json({ total });
}
