import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { escopoDeCustos, podeVerCcu } from "@/lib/custos/acesso";
import { hojeBR } from "@/lib/financeiro/alertas";
import { FILTROS_SITUACAO, montarAoVivo, type FiltroSituacao } from "@/lib/contratos/aoVivo";
import { carregarAoVivo, nomesDosCentros } from "@/lib/contratos/aoVivoServidor";

// "Ao vivo" do Custo por Centro de Custo (SOMENTE LEITURA): titulos e OCs do Senior ligados ao centro de custo, com status de pagamento e de OC.
// Mesmo controle de acesso da tela de custos: so' os centros de custo que a pessoa pode ver.

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const escopo = await escopoDeCustos(prisma, session.user as any);
  if (escopo.tipo === "nenhum") return NextResponse.json({ error: "Sem centros de custo liberados para você" }, { status: 403 });

  const sp = new URL(req.url).searchParams;
  const ccu = sp.get("ccu");
  if (ccu && !podeVerCcu(escopo, ccu)) return NextResponse.json({ error: "Sem permissão para este centro de custo" }, { status: 403 });
  const situacaoParam = sp.get("situacao") as FiltroSituacao | null;
  const situacao: FiltroSituacao = FILTROS_SITUACAO.some((f) => f.chave === situacaoParam) ? (situacaoParam as FiltroSituacao) : "todas";

  const dados = await carregarAoVivo(prisma, hojeBR());
  const visiveis = dados.itens.filter((i) => podeVerCcu(escopo, i.ccu));
  const fora = dados.foraDoCusto.filter((i) => podeVerCcu(escopo, i.ccu) && (!ccu || i.ccu === ccu));
  const r = montarAoVivo(visiveis, { ccu, conta: sp.get("conta"), situacao, q: sp.get("q") }, Number(sp.get("pagina")) || 1);

  // sem um centro de custo fixo, a tela deixa escolher entre os que a pessoa ve
  let centros: { codccu: string; nome: string; n: number }[] = [];
  if (!ccu) {
    const contagem = new Map<string, number>();
    for (const i of visiveis) contagem.set(i.ccu, (contagem.get(i.ccu) ?? 0) + 1);
    const nomes = await nomesDosCentros(prisma, [...contagem.keys()]);
    centros = [...contagem.entries()].map(([codccu, n]) => ({ codccu, nome: nomes.get(codccu) ?? `CC ${codccu}`, n })).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  }
  const nomesDaPagina = new Map<string, string>();
  if (!ccu) for (const c of centros) nomesDaPagina.set(c.codccu, c.nome);

  return NextResponse.json({
    ...r,
    itens: r.itens.map((i) => ({ ...i, ccuNome: nomesDaPagina.get(i.ccu) ?? null })),
    centros,
    filtros: FILTROS_SITUACAO,
    atualizadoEm: dados.atualizadoEm,
    rateiosLidos: dados.atualizadoEm.rateios !== null,
    ocsSemRateioLegivel: dados.ocsSemRateioLegivel,
    foraDoCusto: { n: fora.length, valor: Math.round(fora.reduce((s, i) => s + i.valor, 0) * 100) / 100 },
  });
}
