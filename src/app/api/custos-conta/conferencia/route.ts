import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { estadoAtualizacao } from "@/lib/custos/atualizacaoCusto";
import { auditarCustos } from "@/lib/custos/auditoria";

// Conferencia da ULTIMA leitura do Senior, para quem olha a tela de custos (diretoria/coordenacao): as checagens automaticas que
// provam que o numero mostrado e' a soma exata dos lancamentos lidos do Senior. Somente leitura. O historico mes a mes (totais da
// empresa inteira) so' vai para quem ve todos os centros de custo; os demais recebem so' os contadores.
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const user = session.user as any;
  let vePodeTudo = ["ADMIN", "DIRETOR"].includes(user.role);
  if (!vePodeTudo) {
    const eu = await prisma.user.findUnique({ where: { id: user.id }, select: { verTodosCustos: true } });
    vePodeTudo = !!eu?.verTodosCustos;
  }

  const [a, estado] = await Promise.all([auditarCustos(prisma), estadoAtualizacao()]);
  const ok = estado.ultimaOk;
  const resumo = (ok?.resumo ?? {}) as Record<string, any>;
  const meses = Array.from(new Set([...Object.keys(a.totalCelulasPorMes), ...Object.keys(a.totalLancamentosPorMes)])).sort();
  const historico = meses.map((m) => {
    const tela = a.totalCelulasPorMes[m] ?? 0;
    const lanc = a.totalLancamentosPorMes[m] ?? 0;
    return { mes: m, tela, lancamentos: lanc, fecha: Math.abs(tela - lanc) < 0.02 };
  });
  return NextResponse.json({
    atualizadoEm: ok?.finalizadoEm ?? null,
    duracaoSegundos: resumo.duracaoSegundos ?? null,
    regra: resumo.regra ?? null,
    adiantamentos: resumo.adiantamentos ?? null,
    contagem: {
      celulas: a.celulas,
      lancamentos: a.lancamentos,
      titulos: a.titulosDistintos,
      divergencias: a.divergenciasCelulaXLancamentos,
      celulasSemLancamento: a.celulasSemLancamento,
      lancamentosSemCelula: a.lancamentosSemCelula,
      semDataDeEntrada: a.lancamentosSemDataDeEntrada,
      semNomeDeFornecedor: a.lancamentosSemNomeDeFornecedor,
      foraDaProgramacaoDePagamento: a.titulosForaDaProgramacaoDePagamento,
    },
    historico: vePodeTudo ? historico : null,
  });
}
