import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { criarMotorVinculo, aplicarCorrecaoManual, chavesFornecedor, dataCompativel, mesmoValor } from "@/lib/vinculoOcTitulo";
import { carregarCatalogoFormasPagamento, garantirFormasPagamentoAtualizadas } from "@/lib/senior/formasPagamento";

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
  // Forma de pagamento (codigo da Senior + descricao do catalogo F066FPG): o app mantem os dois
  // atualizados em segundo plano; aqui so' le o que ja esta salvo.
  garantirFormasPagamentoAtualizadas(true);
  const catalogoFpg = await carregarCatalogoFormasPagamento();

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
  const ocPorNumero = new Map(todasOcs.map((o) => [o.numOcp, o]));
  const titulosVinculados = titulos
    .filter((t) => aplicarCorrecaoManual(t, (n) => ocPorNumero.get(n), motor.ocRelacionadaDe(t)).ocRelacionada?.numOcp === params.numOcp)
    .map((t) => ({
      id: t.id,
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
      codFpg: t.codFpg,
      formaPagamento: t.codFpg ? catalogoFpg.get(t.codFpg) ?? null : null,
      // Conteudo do pagamento (boleto/PIX/conta), do que a Senior tem no titulo -- o modal monta a mensagem.
      codigoBarras: t.codigoBarrasBoleto,
      chavePix: t.chavePix,
      tipoChavePix: t.tipoChavePix,
      banco: t.bancoFavorecido,
      agencia: t.agenciaFavorecido,
      conta: t.contaFavorecido,
      dac: t.dacFavorecido,
    }));

  // Aviso (13/10/2026, caso Ana Beatriz): a OC 15903 citava o titulo "007990" e o titulo real era 007900 --
  // o motor nao liga por valor/data (de proposito), entao a OC ficava "sem titulo" sem explicar por que.
  // Quando a OC TEM referencia digitada mas nenhum titulo casou, o painel avisa e mostra o provavel
  // (mesmo fornecedor, valor e data, ainda aberto e sem OC). Nao liga nada: so' informa.
  let avisoVinculo: { referencia: string; candidatos: { id: string; numTit: string; valorOriginal: number; vencimentoProgramado: Date | null }[] } | null = null;
  const referenciaDigitada = (aprovacao.usuNumTit ?? "").trim();
  const ocDoMotor = ocPorNumero.get(params.numOcp);
  if (titulosVinculados.length === 0 && referenciaDigitada && ocDoMotor && !["REP", "CAN"].includes(aprovacao.situacaoAtual)) {
    const chavesDaOc = chavesFornecedor(aprovacao.fornecedorCodigo);
    const candidatos = titulos.filter(
      (t) =>
        !t.pago &&
        t.tipo !== "PRV" &&
        chavesFornecedor(t.codFor).some((k) => chavesDaOc.includes(k)) &&
        mesmoValor(ocDoMotor.valor, t.valorOriginal) &&
        dataCompativel(ocDoMotor, t) &&
        !aplicarCorrecaoManual(t, (n) => ocPorNumero.get(n), motor.ocRelacionadaDe(t)).ocRelacionada // ja ligado a outra OC: nao e' candidato
    );
    avisoVinculo = {
      referencia: referenciaDigitada,
      candidatos: candidatos.slice(0, 3).map((t) => ({ id: t.id, numTit: t.numTit, valorOriginal: t.valorOriginal, vencimentoProgramado: t.vencimentoProgramado })),
    };
  }

  return NextResponse.json({ aprovacao: { ...aprovacao, avisoVinculo }, codToNome, titulosVinculados });
}
