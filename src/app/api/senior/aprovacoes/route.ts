import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { escopoAprovacoesOC, idsDeOcsEnvolvidas } from "@/lib/acesso/aprovacoesOc";

// Lista as Ordens de Compra do Senior (pendentes + resolvidas recentes) pro
// Relatorio de Aprovacoes. Desde 22/10/2026 (pedido do Joao): quem tem o modulo "Aprovacoes de OC: ver todas" (time financeiro) ve
// todas; as demais pessoas veem so' as OCs em que estao envolvidas (emitiu, falta aprovar, ja assinou ou esta na alcada) --
// src/lib/acesso/envolvimentoOc.ts. Sem acesso ao modulo: 403.
export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const user = session.user as any;
  const escopo = await escopoAprovacoesOC(user);
  if (!escopo.modulo) {
    return NextResponse.json({ error: "Sem permissão para ver aprovações do Senior" }, { status: 403 });
  }
  // quem ve TODAS pode pedir so' as dela (?visao=minhas): as em que esta envolvida, pelo vinculo ao Senior
  const soMinhasPedido = new URL(req.url).searchParams.get("visao") === "minhas";
  const verTodas = escopo.todas && !soMinhasPedido;
  const meusIds = verTodas ? null : Array.from(await idsDeOcsEnvolvidas(user.id, escopo.codigos));
  const soMinhas = meusIds ? { id: { in: meusIds } } : {};

  // Pedido do João 14/09/2026: "todas", buscável igual no Senior -- não
  // mais um recorte de 50/500. Traz TODA OC resolvida (situacaoAtual, não
  // resolvidoEm -- esse campo só existe pra quem foi resolvida enquanto
  // rastreada aqui; OC histórica trazida pelo backfill nunca teve
  // resolvidoEm, senão viraria "resolvida hoje" -- bug real corrigido em
  // 14/09/2026, ver corrigir-resolvidoem-backfill).
  //
  // Bug real corrigido 14/09/2026 (a tela travou/ficou lentíssima assim que
  // isso foi ao ar): "todas" passou de ~500 pra ~9 mil linhas, e cada linha
  // trazia rateioDetalhe/historicoNiveis (JSON grande) + eventos completos
  // -- um payload de dezenas de MB numa página só. A LISTA só precisa dos
  // campos escalares (pra exibir e buscar); o detalhe completo (rateio,
  // níveis, eventos) é buscado sob demanda, 1 OC por vez, quando o usuário
  // clica numa linha resolvida -- reaproveita a rota /aprovacoes/[numOcp]
  // que já existia exatamente pra isso.
  const camposLista = {
    id: true,
    numOcp: true,
    dataEmissao: true,
    fornecedorCodigo: true,
    fornecedorNome: true,
    valor: true,
    descricao: true,
    contratoTexto: true,
    codccu: true,
    contratoNome: true,
    usuNumTit: true,
    situacaoAtual: true,
    temRateio: true,
    primeiraDeteccaoEm: true,
    resolvidoEm: true,
    resolvidoComo: true,
  } as const;

  const [pendentes, resolvidas, usuariosSenior, ultimaSinc] = await Promise.all([
    prisma.aprovacaoSenior.findMany({
      where: { situacaoAtual: { in: ["ANA", "PRE"] }, ...soMinhas },
      orderBy: { dataEmissao: "desc" },
      include: {
        eventos: { orderBy: { detectadoEm: "asc" } },
        proximoAprovador: { select: { id: true, name: true } },
      },
    }),
    prisma.aprovacaoSenior.findMany({
      where: { situacaoAtual: { in: ["APR", "REP", "CAN"] }, ...soMinhas },
      // Bug real corrigido 14/09/2026: ordenar por resolvidoEm primeiro
      // empurrava as ~8.700 OCs históricas (sem resolvidoEm, só o backfill
      // sabe que já foram resolvidas) pro final da lista -- como o front só
      // renderiza um recorte por padrão, elas ficavam PERMANENTEMENTE fora
      // de vista (só apareciam buscando o número exato). dataEmissao é
      // preenchida em toda linha (rastreada ou histórica), então ordenar só
      // por ela mistura recente com antigo de forma justa.
      orderBy: { dataEmissao: "desc" },
      select: camposLista,
    }),
    prisma.usuarioSenior.findMany({
      include: { user: { select: { name: true } } },
    }),
    // Pedido do João 15/09/2026: "coloque um sincronizado quando" -- mesmo
    // padrão já usado em Programação de Pagamento, pra deixar claro há
    // quanto tempo esse retrato das OCs foi tirado do Senior.
    prisma.aprovacaoSenior.findFirst({ orderBy: { ultimaSincEm: "desc" }, select: { ultimaSincEm: true } }),
  ]);

  // {codigoSenior: nome} pra resolver os codigos que aparecem no historico
  // de niveis (E614USU) dentro do mapa da OC
  const codToNome: Record<string, string> = {};
  for (const u of usuariosSenior) {
    codToNome[u.codigo] = u.user?.name || u.nome;
  }

  return NextResponse.json({
    pendentes,
    resolvidasRecentes: resolvidas,
    codToNome,
    sincronizadoEm: ultimaSinc?.ultimaSincEm ?? null,
    // Para a tela explicar por que a lista esta curta/vazia
    escopo: verTodas ? "TODAS" : "ENVOLVIDO",
    podeVerTodas: escopo.todas,
    semVinculoSenior: !verTodas && escopo.codigos.length === 0,
  });
}
