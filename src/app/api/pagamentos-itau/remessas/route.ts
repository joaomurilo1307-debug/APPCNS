import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { gerarArquivoRemessa } from "@/lib/cnab240/itau/remessa";
import { linhaDigitavelParaCodigoBarras } from "@/lib/cnab240/itau/codigoBarras";
import { FORMA_PAGAMENTO, segmentoDaForma } from "@/lib/cnab240/itau/constantes";
import { ROTULO_CAMPO } from "@/lib/cnab240/itau/validacaoItem";
import type { ContaDebito, ItemRemessa } from "@/lib/cnab240/itau/tipos";
import {
  conferirItensRemessa,
  itemRemessaSchema,
  resumirConferencia,
  type LinhaConferencia,
} from "@/lib/pagamentos/conferenciaRemessa";

const ROLES_LEITURA = ["ADMIN", "DIRETOR", "GESTOR_PROJETO", "APROVADOR"];
const ROLES_ESCRITA = ["ADMIN", "DIRETOR"];

const bodySchema = z.object({
  contaBancariaId: z.string(),
  itens: z.array(itemRemessaSchema).min(1).max(500),
  // "Gerar so' com os itens sem erro": a conferencia continua a mesma, so'
  // deixa de fora (e lista) quem barrou em vez de recusar tudo.
  somenteValidos: z.boolean().optional(),
});

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const role = (session.user as any).role;
  if (!ROLES_LEITURA.includes(role)) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

  const remessas = await prisma.remessaPagamento.findMany({
    include: {
      contaBancaria: { select: { apelido: true, numCcoSenior: true } },
      criadoPor: { select: { name: true } },
      itens: { select: { id: true, status: true, valor: true, tituloId: true, baixaSeniorStatus: true } },
      retornos: { select: { id: true, nomeArquivo: true, processadoEm: true, totalReconhecidos: true, conteudoArquivo: true } },
    },
    orderBy: { criadoEm: "desc" },
  });

  return NextResponse.json({
    remessas: remessas.map((r) => ({
      id: r.id,
      status: r.status,
      nomeArquivo: r.nomeArquivo,
      contaApelido: r.contaBancaria.apelido,
      contaNumCcoSenior: r.contaBancaria.numCcoSenior,
      criadoPorNome: r.criadoPor?.name ?? null,
      criadoEm: r.criadoEm,
      geradoEm: r.geradoEm,
      totalRegistros: r.totalRegistros,
      totalValor: r.totalValor,
      qtdItens: r.itens.length,
      qtdPendentes: r.itens.filter((i) => i.status === "PENDENTE").length,
      qtdPagos: r.itens.filter((i) => i.status === "PAGO").length,
      qtdRejeitados: r.itens.filter((i) => i.status === "REJEITADO").length,
      qtdBaixados: r.itens.filter((i) => i.baixaSeniorStatus === "ENVIADA" || i.baixaSeniorStatus === "JA_BAIXADO").length,
      qtdErroBaixa: r.itens.filter((i) => i.baixaSeniorStatus === "ERRO").length,
      qtdPagosSemBaixa: r.itens.filter(
        (i) => i.status === "PAGO" && !!i.tituloId && i.baixaSeniorStatus !== "ENVIADA" && i.baixaSeniorStatus !== "JA_BAIXADO"
      ).length,
      retornos: r.retornos.map((ret) => ({
        id: ret.id,
        nomeArquivo: ret.nomeArquivo,
        processadoEm: ret.processadoEm,
        totalReconhecidos: ret.totalReconhecidos,
        temArquivo: !!ret.conteudoArquivo,
      })),
    })),
  });
}

// Item ja conferido (sem erro bloqueante): campos obrigatorios garantidos por
// validarItemRemessa, so' normaliza pro formato do CNAB. Tipo de documento e
// segmento saem do proprio dado (tamanho do CPF/CNPJ, forma de pagamento) --
// assim um "tipo" desencontrado na tela nunca derruba a geracao.
type ItemPronto = {
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

function prepararItem(item: z.infer<typeof itemRemessaSchema>): ItemPronto {
  const forma = item.formaPagamento ?? "";
  const segmento = segmentoDaForma(forma);
  const documento = (item.favorecidoDocumento ?? "").replace(/\D/g, "");
  const ehPix = forma === FORMA_PAGAMENTO.PIX_TRANSFERENCIA;
  const vazioParaUndefined = (v: string | undefined) => (v && v.trim() ? v.trim() : undefined);
  const banco = vazioParaUndefined(item.bancoFavorecido);
  const agencia = vazioParaUndefined(item.agenciaFavorecido);
  const conta = vazioParaUndefined(item.contaFavorecido);
  const dac = vazioParaUndefined(item.dacFavorecido);
  // PIX por chave sem conta completa: nao existe banco/agencia/conta de verdade
  // a declarar (o gerador usa "000"/modelo Chave) -- nao deixa passar um banco
  // "341" residual do preenchimento padrao da tela.
  const usaConta = segmento === "A" && !(ehPix && !(banco && agencia && conta && dac));
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
    chavePixTipo: ehPix ? vazioParaUndefined(item.chavePixTipo) : undefined,
    chavePixValor: ehPix ? vazioParaUndefined(item.chavePixValor) : undefined,
    valor: item.valor ?? 0,
    dataPagamento: item.dataPagamento ?? "",
  };
}

function itemParaCnab(item: ItemPronto, referenciaEmpresa: string, numeroSequencial: number): ItemRemessa {
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

// Rede de seguranca: a conferencia ja cobre os campos, mas se o gerador do
// CNAB ainda recusar algo que ela nao previu, isola QUAL item e' o culpado
// (gera um a um) em vez de devolver uma excecao solta sem dizer o titulo.
function isolarItensQueQuebramOCnab(conta: ContaDebito, itens: ItemPronto[], dataGeracao: Date) {
  const culpados: { indice: number; mensagem: string }[] = [];
  itens.forEach((item, indice) => {
    try {
      gerarArquivoRemessa(conta, [itemParaCnab(item, `PREVIA-${String(indice + 1).padStart(4, "0")}`, 1)], dataGeracao);
    } catch (e: any) {
      culpados.push({ indice, mensagem: String(e?.message ?? e) });
    }
  });
  return culpados;
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const user = session.user as any;
  if (!ROLES_ESCRITA.includes(user.role)) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

  const body = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Pedido inválido: faltou a conta bancária ou a lista de itens." }, { status: 422 });

  const conta = await prisma.contaBancaria.findUnique({ where: { id: parsed.data.contaBancariaId } });
  if (!conta || !conta.ativo) return NextResponse.json({ error: "Conta bancária inválida ou inativa" }, { status: 422 });

  // Pedido do Gabriel (30/09/2026): removido o portão que exigia OC
  // confirmada pra entrar na remessa -- só o vínculo automático travava
  // demais. Mantido: título fora de Aberto (pago ou em situação especial como
  // "PE") não entra, porque pode já estar comprometido em outro fluxo do
  // Senior e pagaria em dobro -- agora esse bloqueio faz parte da conferência.
  const conferencia = await conferirItensRemessa(parsed.data.itens);
  const linhasComErro = conferencia.linhas.filter((l) => l.situacao === "erro");

  if (linhasComErro.length > 0 && !parsed.data.somenteValidos) {
    return NextResponse.json(
      {
        error: `${linhasComErro.length} de ${conferencia.linhas.length} item(ns) com problema -- nenhum arquivo foi gerado. Corrija os dados indicados e gere de novo.`,
        conferencia,
      },
      { status: 422 }
    );
  }

  const indicesExcluidos = new Set(linhasComErro.map((l) => l.indice));
  const itensProntos = parsed.data.itens.filter((_, i) => !indicesExcluidos.has(i)).map(prepararItem);
  if (itensProntos.length === 0) {
    return NextResponse.json({ error: "Nenhum item válido pra gerar a remessa.", conferencia }, { status: 422 });
  }

  const contaDebito: ContaDebito = { cnpj: conta.cnpj, agencia: conta.agencia, conta: conta.conta, dac: conta.dac, nomeEmpresa: conta.apelido };

  // O Itau exige PIX em arquivo SEPARADO das demais formas (manual SISPAG,
  // "Instrucoes de Procedimentos"). Uma geracao so' -- que sai em 1 arquivo, ou
  // em 2 quando o carrinho mistura PIX com boleto/TED/credito.
  const grupos = [
    itensProntos.filter((i) => i.formaPagamento !== FORMA_PAGAMENTO.PIX_TRANSFERENCIA),
    itensProntos.filter((i) => i.formaPagamento === FORMA_PAGAMENTO.PIX_TRANSFERENCIA),
  ].filter((g) => g.length > 0);

  const dataGeracao = new Date();

  // Ensaio antes de gravar qualquer coisa: se o gerador recusar, nada foi salvo
  // e o relatorio diz qual item quebrou.
  const problemasDeArquivo: LinhaConferencia[] = [];
  for (const grupo of grupos) {
    try {
      gerarArquivoRemessa(contaDebito, grupo.map((item, i) => itemParaCnab(item, `PREVIA-${String(i + 1).padStart(4, "0")}`, i + 1)), dataGeracao);
    } catch (e: any) {
      const culpados = isolarItensQueQuebramOCnab(contaDebito, grupo, dataGeracao);
      const mensagens = culpados.length > 0 ? culpados : [{ indice: -1, mensagem: String(e?.message ?? e) }];
      for (const c of mensagens) {
        const item = c.indice >= 0 ? grupo[c.indice] : undefined;
        problemasDeArquivo.push({
          indice: -1,
          tituloId: item?.tituloId ?? null,
          numTit: null,
          fornecedor: item?.favorecidoNome ?? "—",
          valor: item?.valor ?? null,
          problemas: [{ campo: "arquivo", rotulo: ROTULO_CAMPO.arquivo, mensagem: c.mensagem, gravidade: "erro" }],
          situacao: "erro",
        });
      }
    }
  }
  if (problemasDeArquivo.length > 0) {
    const linhas = [...conferencia.linhas, ...problemasDeArquivo];
    return NextResponse.json(
      {
        error: `O arquivo da remessa não pôde ser montado (${problemasDeArquivo.length} problema(s)) -- nenhum arquivo foi gerado.`,
        conferencia: { linhas, resumo: resumirConferencia(linhas) },
      },
      { status: 422 }
    );
  }

  try {
    const resultado = await prisma.$transaction(
      async (tx) => {
        const geradas: {
          id: string;
          nomeArquivo: string | null;
          tipo: "PIX" | "BOLETO_TED_CREDITO";
          qtdItens: number;
          totalValor: number;
          lotes: ReturnType<typeof gerarArquivoRemessa>["lotes"];
        }[] = [];
        for (const grupo of grupos) {
          const remessa = await tx.remessaPagamento.create({
            data: { contaBancariaId: conta.id, criadoPorId: user.id, status: "RASCUNHO" },
          });

          const itensCnab: ItemRemessa[] = [];
          let seq = 0;
          for (const item of grupo) {
            seq += 1;
            // Maiusculo desde a criacao: o campo "Seu Numero" do CNAB (X(20)) e'
            // sempre gravado em maiusculo (ver alfa() em campos.ts) e volta
            // assim no arquivo de retorno -- se a referencia ficasse minuscula
            // aqui, nenhum retorno bateria com o item pelo "findUnique" (bug
            // encontrado testando o fluxo ponta a ponta: cuid() gera ids em
            // minusculo).
            const referenciaEmpresa = `${remessa.id.slice(-8)}-${String(seq).padStart(4, "0")}`.toUpperCase();

            await tx.remessaItemPagamento.create({
              data: {
                remessaId: remessa.id,
                tituloId: item.tituloId,
                numeroSequencial: seq,
                segmento: item.segmento,
                formaPagamento: item.formaPagamento,
                referenciaEmpresa,
                favorecidoNome: item.favorecidoNome,
                favorecidoTipoDoc: item.favorecidoTipoDoc,
                favorecidoDocumento: item.favorecidoDocumento,
                bancoFavorecido: item.bancoFavorecido ?? null,
                agenciaFavorecido: item.agenciaFavorecido ?? null,
                contaFavorecido: item.contaFavorecido ?? null,
                dacFavorecido: item.dacFavorecido ?? null,
                codigoBarras: item.codigoBarras ?? null,
                chavePixTipo: item.chavePixTipo ?? null,
                chavePixValor: item.chavePixValor ?? null,
                valor: item.valor,
                dataPagamento: new Date(`${item.dataPagamento}T00:00:00Z`),
              },
            });
            itensCnab.push(itemParaCnab(item, referenciaEmpresa, seq));
          }

          const gerado = gerarArquivoRemessa(contaDebito, itensCnab, dataGeracao);
          const ehPix = grupo[0].formaPagamento === FORMA_PAGAMENTO.PIX_TRANSFERENCIA;
          const nomeArquivo = `SISPAG_${dataGeracao.toISOString().slice(0, 10).replace(/-/g, "")}_${ehPix ? "PIX_" : ""}${remessa.id.slice(-6)}.rem`;

          const atualizada = await tx.remessaPagamento.update({
            where: { id: remessa.id },
            data: {
              status: "GERADO",
              nomeArquivo,
              conteudoArquivo: gerado.conteudo,
              totalRegistros: gerado.totalRegistros,
              totalValor: gerado.totalValor,
              geradoEm: dataGeracao,
            },
          });

          geradas.push({
            id: atualizada.id,
            nomeArquivo: atualizada.nomeArquivo,
            tipo: ehPix ? ("PIX" as const) : ("BOLETO_TED_CREDITO" as const),
            qtdItens: grupo.length,
            totalValor: gerado.totalValor,
            lotes: gerado.lotes,
          });
        }
        return geradas;
      },
      { timeout: 60_000, maxWait: 10_000 }
    );

    return NextResponse.json(
      {
        remessas: resultado,
        // Itens que ficaram de fora (so' quando pediu "somenteValidos") -- pra
        // pessoa saber exatamente o que ainda falta corrigir e gerar depois.
        ignorados: linhasComErro,
      },
      { status: 201 }
    );
  } catch (e: any) {
    return NextResponse.json(
      { error: `Falha ao gravar a remessa (nada foi salvo): ${String(e?.message ?? e).slice(0, 300)}`, conferencia },
      { status: 500 }
    );
  }
}
