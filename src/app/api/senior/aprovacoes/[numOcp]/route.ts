import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { criarMotorVinculo } from "@/lib/vinculoOcTitulo";

// Busca UMA OC por numOcp, com o mapa completo (rateio, níveis, eventos) +
// o(s) título(s) que essa OC gerou (sentido inverso do vínculo, mesmo motor
// de /api/titulos-pagar -- pedido do João 14/09/2026: "tudo precisa casar,
// se você quiser achar uma OC pelo título ou o título pela OC, pago ou não,
// tudo tem que aparecer"). Existe pra abrir o descritivo da OC a partir de
// outra tela (ex: coluna "OC" da Programação de Pagamento) sem depender da
// lista de /api/senior/aprovacoes, que só traz pendentes + resolvidas -- a
// maioria das OCs vinculadas a título (histórico 2024/2025) não estaria lá.
export async function GET(req: Request, { params }: { params: { numOcp: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const user = session.user as any;
  let podeVer = ["ADMIN", "DIRETOR", "GESTOR_PROJETO", "APROVADOR"].includes(user.role);
  if (!podeVer) {
    const perfil = await prisma.user.findUnique({ where: { id: user.id }, select: { nivelHierarquico: true } });
    podeVer = !!perfil?.nivelHierarquico && ["DIRETORIA", "GERENCIA", "COORDENACAO"].includes(perfil.nivelHierarquico);
  }
  if (!podeVer) {
    return NextResponse.json({ error: "Sem permissão para ver aprovações do Senior" }, { status: 403 });
  }

  const aprovacao = await prisma.aprovacaoSenior.findUnique({
    where: { numOcp: params.numOcp },
    include: {
      eventos: { orderBy: { detectadoEm: "asc" } },
      proximoAprovador: { select: { id: true, name: true } },
    },
  });
  if (!aprovacao) return NextResponse.json({ error: "OC não encontrada na base sincronizada" }, { status: 404 });

  const usuariosSenior = await prisma.usuarioSenior.findMany({
    include: { user: { select: { name: true } } },
  });
  const codToNome: Record<string, string> = {};
  for (const u of usuariosSenior) codToNome[u.codigo] = u.user?.name || u.nome;

  // Sentido inverso: quais títulos essa OC gerou. Precisa rodar o motor
  // contra TODAS as OCs (mesmo índice de /api/titulos-pagar) pra garantir
  // que os dois sentidos batem exatamente igual -- só filtra o resultado
  // pra esta OC no final, não recalcula uma regra própria.
  const [titulos, todasOcs] = await Promise.all([
    prisma.tituloContasAPagar.findMany(),
    prisma.aprovacaoSenior.findMany({
      select: {
        numOcp: true,
        codFil: true,
        fornecedorCodigo: true,
        fornecedorNome: true,
        valor: true,
        dataEmissao: true,
        situacaoAtual: true,
        usuNumTit: true,
        usuNumNfc: true,
        codccu: true,
        contratoNome: true,
        temRateio: true,
        previsaoPagamento: true,
      },
    }),
  ]);
  const motor = criarMotorVinculo(todasOcs);
  const titulosVinculados = titulos
    .filter((t) => motor.ocRelacionadaDe(t).ocRelacionada?.numOcp === params.numOcp)
    .map((t) => ({
      numTit: t.numTit,
      tipo: t.tipo,
      pago: t.pago,
      valorOriginal: t.valorOriginal,
      valorAberto: t.valorAberto,
      dataEmissao: t.dataEmissao,
      vencimentoProgramado: t.vencimentoProgramado,
      dataPagamento: t.dataPagamento,
      descricao: t.descricao,
      dataLancamento: t.dataLancamento,
      lancadoPorNome: t.lancadoPorCod && t.lancadoPorCod !== "0" ? codToNome[t.lancadoPorCod] || `Usuário Senior #${t.lancadoPorCod}` : null,
      entradaManual: !t.numNfc || t.numNfc === "0",
    }));

  return NextResponse.json({ aprovacao, codToNome, titulosVinculados });
}
