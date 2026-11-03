import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { escopoDeCustos, escopoDeVisao, podeVerCcu } from "@/lib/custos/acesso";
import { hojeBR } from "@/lib/financeiro/alertas";
import { nomesDosCentros } from "@/lib/contratos/aoVivoServidor";
import { montarPagos, lerDias, FILTROS_SITUACAO_PAGO, type FiltroSituacaoPago } from "@/lib/contratos/pagosPorDia";
import { carregarPagos } from "@/lib/contratos/pagosPorDiaServidor";

// "Pagos / semana" do Custo por Centro de Custo (SOMENTE LEITURA): o que foi pago nos dias escolhidos de um mes, titulo a titulo e centro de custo a centro de custo,
// com o valor so' do centro de custo olhado, o rateio completo, a OC e as aprovacoes. Mesmo controle de acesso do "Ao vivo": so' os centros de custo que a pessoa ve.
// Parametros: mes (aaaa-mm, padrao o mes atual), dias ("1,5,9-12"; vazio = o mes todo), ccu, situacao (todos|pago|pago_banco; vale so' para o que esta pago), q.

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const escopo = await escopoDeCustos(prisma, session.user as any);
  if (escopo.tipo === "nenhum") return NextResponse.json({ error: "Sem centros de custo liberados para você" }, { status: 403 });

  const sp = new URL(req.url).searchParams;
  const hoje = hojeBR();
  const mes = sp.get("mes") ?? hoje.slice(0, 7);
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(mes)) return NextResponse.json({ error: "Mês inválido (use aaaa-mm)" }, { status: 422 });
  const { dias, erro } = lerDias(sp.get("dias"), mes);
  if (erro) return NextResponse.json({ error: erro }, { status: 422 });
  const ccu = sp.get("ccu");
  if (ccu && !/^\d+$/.test(ccu)) return NextResponse.json({ error: "Centro de custo inválido" }, { status: 422 });
  if (ccu && !podeVerCcu(escopo, ccu)) return NextResponse.json({ error: "Sem permissão para este centro de custo" }, { status: 403 });
  const situacaoParam = (sp.get("situacao") ?? "todos") as FiltroSituacaoPago;
  if (!FILTROS_SITUACAO_PAGO.includes(situacaoParam)) return NextResponse.json({ error: "Situação inválida" }, { status: 422 });
  const visao = ccu ? escopo : await escopoDeVisao(escopo);

  const dados = await carregarPagos(prisma, mes, hoje);
  const todosCcus = new Set<string>();
  for (const p of dados.pagamentos) for (const x of p.partes) todosCcus.add(x.ccu);
  const nomes = await nomesDosCentros(prisma, Array.from(todosCcus));
  const nomeDoCentro = (c: string) => nomes.get(c) ?? `CC ${c}`;

  const r = montarPagos(dados.pagamentos, {
    mes, dias, ccu, situacao: situacaoParam, q: sp.get("q"), pode: (c) => podeVerCcu(visao, c), nomeDoCentro, ocDe: (n) => dados.ocs.get(n) ?? null,
  });

  // centros de custo que a pessoa pode escolher: os que tiveram pagamento no mes (sem aplicar o filtro de centro)
  const contagem = new Map<string, Set<string>>();
  for (const p of dados.pagamentos) {
    if (p.data.slice(0, 7) !== mes) continue;
    for (const x of p.partes) if (podeVerCcu(visao, x.ccu)) (contagem.get(x.ccu) ?? contagem.set(x.ccu, new Set()).get(x.ccu))!.add(p.chave);
  }
  const centros = Array.from(contagem.entries()).map(([codccu, s]) => ({ codccu, nome: nomeDoCentro(codccu), n: s.size })).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));

  return NextResponse.json({ mes, dias, hoje, linhas: r.linhas, semConfirmacao: r.semConfirmacao, diasDoMes: r.dias, resumo: r.resumo, centros, atualizadoEm: dados.atualizadoEm });
}
