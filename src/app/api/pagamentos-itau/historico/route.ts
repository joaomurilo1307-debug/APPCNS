import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// Histórico de pagamentos: tudo que já foi gerado em remessa (item a item, com as
// mesmas informações do carrinho + o dia em que o arquivo remessa foi gerado).
//
// Também devolve `tituloIdsGerados`: os títulos que já estão numa remessa gerada e
// ainda valem (pendente/agendado/pago -- o MESMO critério da conferência da remessa,
// conferenciaRemessa.ts). A tela usa isso pra não manter no carrinho (nem trazer da
// Programação de Pagamento) o que já virou remessa. Rejeitado/cancelado não entram:
// o banco não pagou, o título pode ir pra uma remessa nova.
//
// Remessa RASCUNHO (arquivo nunca gerado) não conta como "gerada".

const ROLES_LEITURA = ["ADMIN", "DIRETOR", "GESTOR_PROJETO", "APROVADOR"];
const STATUS_ATIVOS = ["PENDENTE", "AGENDADO", "PAGO"] as const;
const LIMITE_PADRAO = 300;
const LIMITE_MAXIMO = 1000;

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const role = (session.user as any).role;
  if (!ROLES_LEITURA.includes(role)) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

  const pedido = Number(new URL(req.url).searchParams.get("limite") ?? LIMITE_PADRAO);
  const limite = Number.isFinite(pedido) ? Math.min(Math.max(Math.trunc(pedido), 1), LIMITE_MAXIMO) : LIMITE_PADRAO;
  const geradas = { remessa: { status: { not: "RASCUNHO" as const } } };

  const [itens, total, ativos] = await Promise.all([
    prisma.remessaItemPagamento.findMany({
      where: geradas,
      orderBy: [{ criadoEm: "desc" }, { numeroSequencial: "asc" }],
      take: limite,
      include: {
        titulo: { select: { numTit: true, fornecedorNome: true } },
        remessa: { select: { nomeArquivo: true, geradoEm: true, criadoEm: true, contaBancaria: { select: { apelido: true } } } },
      },
    }),
    prisma.remessaItemPagamento.count({ where: geradas }),
    prisma.remessaItemPagamento.findMany({
      where: { ...geradas, tituloId: { not: null }, status: { in: [...STATUS_ATIVOS] } },
      select: { tituloId: true },
    }),
  ]);

  return NextResponse.json({
    total,
    itens: itens.map((i) => ({
      id: i.id,
      remessaId: i.remessaId,
      arquivo: i.remessa.nomeArquivo,
      geradaEm: i.remessa.geradoEm ?? i.remessa.criadoEm,
      contaApelido: i.remessa.contaBancaria.apelido,
      tituloId: i.tituloId,
      numTit: i.titulo?.numTit ?? null,
      fornecedorNome: i.titulo?.fornecedorNome ?? null,
      favorecidoNome: i.favorecidoNome,
      favorecidoTipoDoc: i.favorecidoTipoDoc,
      favorecidoDocumento: i.favorecidoDocumento,
      segmento: i.segmento,
      formaPagamento: i.formaPagamento,
      bancoFavorecido: i.bancoFavorecido,
      agenciaFavorecido: i.agenciaFavorecido,
      contaFavorecido: i.contaFavorecido,
      dacFavorecido: i.dacFavorecido,
      codigoBarras: i.codigoBarras,
      chavePixTipo: i.chavePixTipo,
      chavePixValor: i.chavePixValor,
      valor: i.valor,
      dataPagamento: i.dataPagamento,
      status: i.status,
      valorEfetivado: i.valorEfetivado,
      dataEfetivacao: i.dataEfetivacao,
      baixaSeniorStatus: i.baixaSeniorStatus,
    })),
    tituloIdsGerados: [...new Set(ativos.map((a) => a.tituloId!))],
  });
}
