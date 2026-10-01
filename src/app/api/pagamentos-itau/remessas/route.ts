import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { gerarArquivoRemessa } from "@/lib/cnab240/itau/remessa";
import { linhaDigitavelParaCodigoBarras } from "@/lib/cnab240/itau/codigoBarras";
import type { ItemRemessa } from "@/lib/cnab240/itau/tipos";

const ROLES_LEITURA = ["ADMIN", "DIRETOR", "GESTOR_PROJETO", "APROVADOR"];
const ROLES_ESCRITA = ["ADMIN", "DIRETOR"];

const itemSchema = z
  .object({
    tituloId: z.string().nullable().optional(),
    segmento: z.enum(["A", "J"]),
    formaPagamento: z.string().min(2).max(2),
    favorecidoNome: z.string().min(1),
    favorecidoTipoDoc: z.enum(["1", "2"]),
    // Credito/TED: exigencia do BACEN (Nota 15 do manual). Boleto: e' o
    // CPF/CNPJ do beneficiario, obrigatorio no Segmento J-52 (sem ele o banco
    // rejeita o pagamento com a ocorrencia "BI").
    favorecidoDocumento: z.string().regex(/^\d{11}$|^\d{14}$/, "CPF (11) ou CNPJ (14) dígitos"),
    bancoFavorecido: z.string().optional(),
    agenciaFavorecido: z.string().optional(),
    contaFavorecido: z.string().optional(),
    dacFavorecido: z.string().optional(),
    codigoBarras: z.string().optional(),
    // Segmento B obrigatorio pra PIX no modelo "Chave" (Nota 37 do manual) --
    // so' preenchido quando formaPagamento = "45" (PIX Transferencia) e o
    // favorecido nao tem conta bancaria completa.
    chavePixTipo: z.enum(["01", "02", "03", "04"]).optional(),
    chavePixValor: z.string().optional(),
    valor: z.number().positive(),
    dataPagamento: z.string(), // yyyy-mm-dd
  })
  .refine((i) => i.segmento === "A" || !!i.codigoBarras, {
    message: "Boleto (Segmento J) exige código de barras",
    path: ["codigoBarras"],
  })
  .refine(
    (i) =>
      i.segmento === "J" ||
      (!!i.bancoFavorecido && !!i.agenciaFavorecido && !!i.contaFavorecido && !!i.dacFavorecido) ||
      // PIX no modelo Chave dispensa conta bancaria real -- a chave resolve o destino (manual pag. 22).
      (i.formaPagamento === "45" && !!i.chavePixTipo && !!i.chavePixValor),
    {
      message: "Crédito/TED (Segmento A) exige banco/agência/conta/DAC do favorecido, ou (PIX) tipo e valor da chave",
      path: ["bancoFavorecido"],
    }
  );

const bodySchema = z.object({
  contaBancariaId: z.string(),
  itens: z.array(itemSchema).min(1),
});

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const role = (session.user as any).role;
  if (!ROLES_LEITURA.includes(role)) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

  const remessas = await prisma.remessaPagamento.findMany({
    include: {
      contaBancaria: { select: { apelido: true } },
      criadoPor: { select: { name: true } },
      itens: { select: { id: true, status: true, valor: true } },
      retornos: { select: { id: true, nomeArquivo: true, processadoEm: true, totalReconhecidos: true } },
    },
    orderBy: { criadoEm: "desc" },
  });

  return NextResponse.json({
    remessas: remessas.map((r) => ({
      id: r.id,
      status: r.status,
      nomeArquivo: r.nomeArquivo,
      contaApelido: r.contaBancaria.apelido,
      criadoPorNome: r.criadoPor?.name ?? null,
      criadoEm: r.criadoEm,
      geradoEm: r.geradoEm,
      totalRegistros: r.totalRegistros,
      totalValor: r.totalValor,
      qtdItens: r.itens.length,
      qtdPendentes: r.itens.filter((i) => i.status === "PENDENTE").length,
      qtdPagos: r.itens.filter((i) => i.status === "PAGO").length,
      qtdRejeitados: r.itens.filter((i) => i.status === "REJEITADO").length,
      retornos: r.retornos,
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
  if (!parsed.success) return NextResponse.json({ error: "Dados inválidos", detalhes: parsed.error.flatten() }, { status: 422 });

  const conta = await prisma.contaBancaria.findUnique({ where: { id: parsed.data.contaBancariaId } });
  if (!conta || !conta.ativo) return NextResponse.json({ error: "Conta bancária inválida" }, { status: 422 });

  // Pedido do Gabriel (30/09/2026): removido o portão que exigia OC
  // confirmada pra entrar na remessa -- só o vínculo automático travava
  // demais enquanto o sync de OC/título ainda não pegou tudo. O vínculo
  // continua calculado e visível na Programação de Pagamento e na
  // Conferência de OC; só não bloqueia mais a geração do arquivo aqui.
  //
  // Mantido: título com SITTIT fora de AB/LQ (ex: "PE" -- achado ao vivo,
  // Fort Minas 1765$01/2071$01/2072$01/2072$02) pode já estar comprometido
  // em outro fluxo de pagamento do próprio Senior -- incluir de novo numa
  // remessa nossa arriscaria pagar em dobro. A tela já trava a seleção,
  // isso aqui é o mesmo motor de decisão do lado do servidor, pra quem
  // tentar contornar a tela.
  const idsComTitulo = parsed.data.itens.map((i) => i.tituloId).filter((id): id is string => !!id);
  if (idsComTitulo.length > 0) {
    const titulosDaRemessa = await prisma.tituloContasAPagar.findMany({ where: { id: { in: idsComTitulo } } });
    const bloqueados = titulosDaRemessa.filter((t) => !t.pago && t.situacao !== "AB");
    if (bloqueados.length > 0) {
      return NextResponse.json(
        {
          error: `${bloqueados.length} título(s) em situação especial no Senior (fora de Aberto/Pago) não podem entrar na remessa`,
          titulosBloqueados: bloqueados.map((t) => ({
            numTit: t.numTit,
            fornecedor: t.fornecedorNome ?? `código ${t.codFor}`,
            valor: t.valorAberto,
            situacao: t.situacao,
          })),
        },
        { status: 422 }
      );
    }
  }

  try {
    const resultado = await prisma.$transaction(async (tx) => {
      const remessa = await tx.remessaPagamento.create({
        data: { contaBancariaId: conta.id, criadoPorId: user.id, status: "RASCUNHO" },
      });

      const itensParaGerar: ItemRemessa[] = [];
      let seq = 0;
      for (const item of parsed.data.itens) {
        seq += 1;
        // Maiusculo desde a criacao: o campo "Seu Numero" do CNAB (X(20)) e'
        // sempre gravado em maiusculo (ver alfa() em campos.ts, regra do
        // manual "preferencialmente todos os caracteres maiusculos") e volta
        // assim no arquivo de retorno -- se a referencia ficasse minuscula
        // aqui, nenhum retorno bateria com o item pelo "findUnique" (bug
        // encontrado testando o fluxo ponta a ponta: cuid() gera ids em
        // minusculo).
        const referenciaEmpresa = `${remessa.id.slice(-8)}-${String(seq).padStart(4, "0")}`.toUpperCase();
        const codigoBarras = item.codigoBarras ? linhaDigitavelParaCodigoBarras(item.codigoBarras) : undefined;

        await tx.remessaItemPagamento.create({
          data: {
            remessaId: remessa.id,
            tituloId: item.tituloId ?? null,
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
            codigoBarras: codigoBarras ?? null,
            chavePixTipo: item.chavePixTipo ?? null,
            chavePixValor: item.chavePixValor ?? null,
            valor: item.valor,
            dataPagamento: new Date(`${item.dataPagamento}T00:00:00Z`),
          },
        });

        itensParaGerar.push({
          referenciaEmpresa,
          numeroSequencial: seq,
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
          codigoBarras,
          chavePixTipo: item.chavePixTipo,
          chavePixValor: item.chavePixValor,
        });
      }

      const dataGeracao = new Date();
      const gerado = gerarArquivoRemessa(
        { cnpj: conta.cnpj, agencia: conta.agencia, conta: conta.conta, dac: conta.dac, nomeEmpresa: conta.apelido },
        itensParaGerar,
        dataGeracao
      );

      const nomeArquivo = `SISPAG_${dataGeracao.toISOString().slice(0, 10).replace(/-/g, "")}_${remessa.id.slice(-6)}.rem`;

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

      return { remessa: atualizada, lotes: gerado.lotes };
    });

    return NextResponse.json(resultado, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Erro ao gerar remessa" }, { status: 400 });
  }
}
