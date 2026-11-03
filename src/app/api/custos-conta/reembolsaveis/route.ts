import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { escopoDeCustos, escopoDeVisao, podeVerCcu } from "@/lib/custos/acesso";
import { hojeBR } from "@/lib/financeiro/alertas";
import { nomesDosCentros } from "@/lib/contratos/aoVivoServidor";
import { montarReembolsaveis, TIPOS_DE_SERVICO, NAO_CLASSIFICADO } from "@/lib/contratos/reembolsaveis";
import { carregarReembolsaveis } from "@/lib/contratos/reembolsaveisServidor";

// Planilha de despesas reembolsaveis (SOMENTE LEITURA): o que foi PAGO no mes em contas reembolsaveis, no layout da planilha que a Cristina preenche
// (DOC., prestador, CPF/CNPJ, data de realizacao, tipo de servico, valor, descricao) + resumo por tipo de servico. Mesmo acesso do "Ao vivo" e do "Pagos / semana":
// so' os centros de custo que a pessoa ve. Parametros: mes (aaaa-mm, padrao o mes atual), ccu, tipo (um tipo de servico), q.

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const escopo = await escopoDeCustos(prisma, session.user as any);
  if (escopo.tipo === "nenhum") return NextResponse.json({ error: "Sem centros de custo liberados para você" }, { status: 403 });

  const sp = new URL(req.url).searchParams;
  const mes = sp.get("mes") ?? hojeBR().slice(0, 7);
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(mes)) return NextResponse.json({ error: "Mês inválido (use aaaa-mm)" }, { status: 422 });
  const ccu = sp.get("ccu");
  if (ccu && !/^\d+$/.test(ccu)) return NextResponse.json({ error: "Centro de custo inválido" }, { status: 422 });
  if (ccu && !podeVerCcu(escopo, ccu)) return NextResponse.json({ error: "Sem permissão para este centro de custo" }, { status: 403 });
  const tipo = sp.get("tipo");
  if (tipo && !(TIPOS_DE_SERVICO as readonly string[]).includes(tipo) && tipo !== NAO_CLASSIFICADO) return NextResponse.json({ error: "Tipo de serviço inválido" }, { status: 422 });
  const visao = ccu ? escopo : await escopoDeVisao(escopo);

  const dados = await carregarReembolsaveis(prisma, mes);
  const nomes = await nomesDosCentros(prisma, Array.from(new Set(dados.entradas.map((x) => x.ccu))));
  const nomeDoCentro = (c: string) => nomes.get(c) ?? `CC ${c}`;
  const r = montarReembolsaveis(dados.entradas, { mes, ccu, tipo, q: sp.get("q"), pode: (c) => podeVerCcu(visao, c), nomeDoCentro });

  // centros que a pessoa pode escolher: os que tiveram reembolsavel pago no mes
  const contagem = new Map<string, number>();
  for (const x of dados.entradas) if (x.dataPagamento.slice(0, 7) === mes && podeVerCcu(visao, x.ccu)) contagem.set(x.ccu, (contagem.get(x.ccu) ?? 0) + 1);
  const centros = Array.from(contagem.entries()).map(([codccu, n]) => ({ codccu, nome: nomeDoCentro(codccu), n })).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));

  return NextResponse.json({ mes, hoje: hojeBR(), linhas: r.linhas, resumo: r.resumo, centros, textosPendentes: dados.textosPendentes, atualizadoEm: dados.atualizadoEm });
}
