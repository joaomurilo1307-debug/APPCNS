import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { escopoAprovacoesOC } from "@/lib/acesso/aprovacoesOc";

// Ordens de compra do Senior que AGUARDAM a pessoa, para a secao "aguardando voce" da tela Aprovacoes. SO' LEITURA: a aprovacao e' feita
// no Senior e o sincronizador traz o resultado para ca (a OC deixa de estar pendente e sai desta lista sozinha).
//
// A regra e' a MESMA da tela Aprovacoes (OC Senior): o modulo de Aprovacoes de OC e o vinculo MANUAL da pessoa ao CODUSU do Senior
// (tela Usuarios > Acesso; o de-para automatico por e-mail pode estar errado e nao conta). A pessoa so' ve a OC se o codigo dela esta entre
// os aprovadores que ainda faltam (aprovadoresPendentesCod), assim as duas telas nunca discordam sobre o que e' dela.
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const escopo = await escopoAprovacoesOC(session.user as any);
  const sincronizadoEm = (await prisma.aprovacaoSenior.findFirst({ orderBy: { ultimaSincEm: "desc" }, select: { ultimaSincEm: true } }))?.ultimaSincEm ?? null;
  // sem o modulo, nada a mostrar (a tela de Aprovacoes de OC tambem nao abriria); sem vinculo, a tela avisa o que falta
  if (!escopo.modulo || escopo.codigos.length === 0) {
    return NextResponse.json({ ocs: [], sincronizadoEm, semModulo: !escopo.modulo, semVinculoSenior: escopo.modulo && escopo.codigos.length === 0 });
  }

  const meus = new Set(escopo.codigos.map((c) => c.trim()).filter(Boolean));
  const candidatas = await prisma.aprovacaoSenior.findMany({
    where: {
      situacaoAtual: { in: ["ANA", "PRE"] },
      // consulta grosseira (o texto contem o codigo); quem decide e' a conferencia exata abaixo, porque "17" tambem esta contido em "177"
      OR: Array.from(meus).map((c) => ({ aprovadoresPendentesCod: { contains: c } })),
    },
    orderBy: { dataEmissao: "asc" },
    select: {
      id: true,
      numOcp: true,
      valor: true,
      fornecedorNome: true,
      fornecedorCodigo: true,
      contratoNome: true,
      contratoTexto: true,
      codccu: true,
      temRateio: true,
      niveisExigidos: true,
      niveisAprovados: true,
      nivelAtual: true,
      aprovadoresPendentes: true,
      aprovadoresPendentesCod: true,
      dataEmissao: true,
    },
  });

  const ocs = candidatas.filter((o) => (o.aprovadoresPendentesCod ?? "").split(",").some((c) => meus.has(c.trim())));
  return NextResponse.json({ ocs, sincronizadoEm, semModulo: false, semVinculoSenior: false });
}
