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

  const dossies = await prisma.dossieOC.findMany({
    orderBy: [{ geradoEm: "desc" }],
  });

  const publicados = dossies.filter((d) => d.status === "PUBLICADO");

  return NextResponse.json({
    dossies: dossies.map((d) => ({
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
    })),
    total: dossies.length,
    qtdPublicados: publicados.length,
    qtdPendentes: dossies.length - publicados.length,
    ultimoRecebidoEm: dossies[0]?.geradoEm ?? null,
  });
}
