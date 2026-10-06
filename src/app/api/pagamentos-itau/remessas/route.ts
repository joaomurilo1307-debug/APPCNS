import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { gerarArquivoRemessa } from "@/lib/cnab240/itau/remessa";
import { seuNumeroSenior } from "@/lib/cnab240/itau/seuNumero";
import type { ContaDebito, ItemRemessa } from "@/lib/cnab240/itau/tipos";
import {
  agruparPorArquivo,
  conferirItensRemessa,
  ehPix,
  itemParaCnab,
  itemRemessaSchema,
  prepararItem,
} from "@/lib/pagamentos/conferenciaRemessa";

const ROLES_LEITURA = ["ADMIN", "DIRETOR", "GESTOR_PROJETO", "APROVADOR"];
const ROLES_ESCRITA = ["ADMIN", "DIRETOR"];

const bodySchema = z.object({
  contaBancariaId: z.string(),
  itens: z.array(itemRemessaSchema).min(1).max(500),
  // "Gerar so' com os itens sem erro": a conferencia continua a mesma, so'
  // deixa de fora (e lista) quem barrou em vez de recusar tudo.
  somenteValidos: z.boolean().optional(),
  // Simulacao: faz TUDO (conferencia, gravacao dos itens, montagem do arquivo)
  // dentro da transacao e desfaz no fim -- nada fica salvo. Serve pra provar
  // que a geracao completa funciona com estes dados sem criar remessa de verdade.
  simular: z.boolean().optional(),
});

class SimulacaoConcluida extends Error {
  constructor(public resumo: unknown) {
    super("simulacao concluida");
  }
}

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
  const contaDebito: ContaDebito = { cnpj: conta.cnpj, agencia: conta.agencia, conta: conta.conta, dac: conta.dac, nomeEmpresa: conta.apelido };

  // A conferencia inclui o ensaio do arquivo CNAB (sem gravar nada): se algo so'
  // quebraria na hora de montar o arquivo, ela ja aponta qual titulo.
  const conferencia = await conferirItensRemessa(parsed.data.itens, contaDebito);
  const linhasComErro = conferencia.linhas.filter((l) => l.situacao === "erro");

  if ((linhasComErro.length > 0 && !parsed.data.somenteValidos) || conferencia.erroGeral) {
    return NextResponse.json(
      {
        error: conferencia.erroGeral
          ? `${conferencia.erroGeral} -- nenhum arquivo foi gerado.`
          : `${linhasComErro.length} de ${conferencia.linhas.length} item(ns) com problema -- nenhum arquivo foi gerado. Corrija os dados indicados e gere de novo.`,
        conferencia,
      },
      { status: 422 }
    );
  }

  const indicesExcluidos = new Set(linhasComErro.map((l) => l.indice));
  const itensProntos = parsed.data.itens.filter((_, i) => !indicesExcluidos.has(i)).map((item) => prepararItem(item));
  if (itensProntos.length === 0) {
    return NextResponse.json({ error: "Nenhum item válido pra gerar a remessa.", conferencia }, { status: 422 });
  }

  // O Itau exige PIX em arquivo SEPARADO das demais formas (manual SISPAG,
  // "Instrucoes de Procedimentos"). Uma geracao so' -- que sai em 1 arquivo, ou
  // em 2 quando o carrinho mistura PIX com boleto/TED/credito.
  const grupos = agruparPorArquivo(itensProntos);
  const dataGeracao = new Date();

  // "Seu Numero" no formato da Senior (0 + CODFOR + NUMTIT + CODTPT): e' por ele que
  // a tela de retorno da Senior acha o titulo (ver lib/cnab240/itau/seuNumero.ts).
  const titulosDosItens = await prisma.tituloContasAPagar.findMany({
    where: { id: { in: itensProntos.map((i) => i.tituloId).filter((id): id is string => !!id) } },
    select: { id: true, numTit: true, codFor: true, tipo: true },
  });
  const tituloPorId = new Map(titulosDosItens.map((t) => [t.id, t]));

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
          linhasDoArquivo: number;
          seusNumeros: { numTit: string | null; seuNumero: string; formatoSenior: boolean }[];
        }[] = [];
        for (const grupo of grupos) {
          const remessa = await tx.remessaPagamento.create({
            data: { contaBancariaId: conta.id, criadoPorId: user.id, status: "RASCUNHO" },
          });

          const itensCnab: ItemRemessa[] = [];
          const seusNumeros: { numTit: string | null; seuNumero: string; formatoSenior: boolean }[] = [];
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
            // Titulo que cabe no formato da Senior leva esse "Seu Numero"; o que nao
            // cabe (numero com mais de 10 caracteres...) segue com a referencia interna.
            const titulo = item.tituloId ? tituloPorId.get(item.tituloId) : undefined;
            const seuNumero = titulo ? seuNumeroSenior(titulo) : null;
            seusNumeros.push({ numTit: titulo?.numTit ?? null, seuNumero: seuNumero ?? referenciaEmpresa, formatoSenior: !!seuNumero });

            await tx.remessaItemPagamento.create({
              data: {
                remessaId: remessa.id,
                tituloId: item.tituloId,
                numeroSequencial: seq,
                segmento: item.segmento,
                formaPagamento: item.formaPagamento,
                referenciaEmpresa,
                seuNumero,
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
            itensCnab.push(itemParaCnab(item, seuNumero ?? referenciaEmpresa, seq));
          }

          const gerado = gerarArquivoRemessa(contaDebito, itensCnab, dataGeracao);
          const arquivoPix = ehPix(grupo[0]);
          const nomeArquivo = `SISPAG_${dataGeracao.toISOString().slice(0, 10).replace(/-/g, "")}_${arquivoPix ? "PIX_" : ""}${remessa.id.slice(-6)}.rem`;

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
            tipo: arquivoPix ? ("PIX" as const) : ("BOLETO_TED_CREDITO" as const),
            qtdItens: grupo.length,
            totalValor: gerado.totalValor,
            lotes: gerado.lotes,
            linhasDoArquivo: gerado.conteudo.split("\r\n").filter((l) => l.length > 0).length,
            seusNumeros,
          });
        }
        if (parsed.data.simular) throw new SimulacaoConcluida(geradas);
        return geradas;
      },
      { timeout: 60_000, maxWait: 10_000 }
    );

    // Titulo que entrou numa remessa deixa de ser "lembrete de proxima
    // programacao" -- foi tratado. O registro continua no historico.
    const idsNaRemessa = itensProntos.map((i) => i.tituloId).filter((id): id is string => !!id);
    if (idsNaRemessa.length > 0) {
      await prisma.tituloAdiamento
        .updateMany({
          where: { tituloId: { in: idsNaRemessa }, resolvidoEm: null },
          data: { resolvidoEm: new Date(), resolvidoComo: "REMESSA" },
        })
        .catch(() => {});
    }

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
    if (e instanceof SimulacaoConcluida) {
      return NextResponse.json({ simulacao: true, desfeita: true, remessas: e.resumo, ignorados: linhasComErro });
    }
    return NextResponse.json(
      { error: `Falha ao gravar a remessa (nada foi salvo): ${String(e?.message ?? e).slice(0, 300)}`, conferencia },
      { status: 500 }
    );
  }
}
