import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// Lista os dossiês de OC recebidos da automação do n8n.
// Mesmo nível de acesso da Programação de Pagamento e das Aprovações OC.

const PAPEIS = ["ADMIN", "DIRETOR", "GESTOR_PROJETO", "APROVADOR"];

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const user = session.user as any;
  if (!PAPEIS.includes(user.role)) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const [dossies, ocsPagas] = await Promise.all([
    prisma.dossieOC.findMany({ orderBy: [{ geradoEm: "desc" }] }),
    prisma.aprovacaoSenior.findMany({
      where: { pago: true },
      select: {
        numOcp: true,
        codFil: true,
        fornecedorNome: true,
        valor: true,
        previsaoPagamento: true,
        usuNumTit: true,
        resolvidoEm: true,
        ultimaSincEm: true,
      },
    }),
  ]);

  // OC paga na Senior (sincronismo do Rito) que nunca gerou nenhum registro de
  // dossie (nem sucesso, nem erro/pendencia) -- ou seja, a automacao do n8n
  // nunca chegou a processar essa OC. Sem isso, essas OCs ficam invisiveis:
  // a tela so mostra o que o n8n decidiu reportar.
  const numOcpComDossie = new Set(dossies.map((d) => d.numOcp).filter((n): n is string => !!n));
  const semDossie = ocsPagas.filter((a) => !numOcpComDossie.has(a.numOcp));

  const publicados = dossies.filter((d) => d.status === "PUBLICADO");

  const normalizados = dossies.map((d) => ({
    id: d.id,
    numOcp: d.numOcp,
    codFil: d.codFil,
    titulos: d.titulos,
    fornecedorNome: d.fornecedorNome,
    vencimento: d.vencimento,
    valorTotal: d.valorTotal,
    status: d.status,
    motivo: d.motivo,
    origem: d.origem,
    gedDocumentId: d.gedDocumentId,
    temArquivo: !!d.arquivoPath,
    arquivoNome: d.arquivoNome,
    geradoEm: d.geradoEm,
  }));

  const sinteticos = semDossie.map((a) => ({
    id: `oc-sem-dossie-${a.numOcp}`,
    numOcp: a.numOcp,
    codFil: a.codFil ?? "",
    titulos: a.usuNumTit
      ? a.usuNumTit
          .split(/[-;,\n]/)
          .map((s) => s.trim())
          .filter(Boolean)
      : [],
    fornecedorNome: a.fornecedorNome,
    vencimento: a.previsaoPagamento,
    valorTotal: a.valor,
    status: "AGUARDANDO_GERACAO",
    motivo: "OC paga na Senior, mas a automação (n8n) ainda não enviou o dossiê.",
    origem: "DETECCAO_INTERNA",
    gedDocumentId: null,
    temArquivo: false,
    arquivoNome: null,
    geradoEm: a.resolvidoEm ?? a.ultimaSincEm,
  }));

  const todos = [...normalizados, ...sinteticos].sort(
    (a, b) => new Date(b.geradoEm).getTime() - new Date(a.geradoEm).getTime()
  );

  return NextResponse.json({
    dossies: todos,
    total: todos.length,
    qtdPublicados: publicados.length,
    qtdPendentes: dossies.length - publicados.length,
    qtdSemGeracao: sinteticos.length,
    ultimoRecebidoEm: dossies[0]?.geradoEm ?? null,
  });
}
