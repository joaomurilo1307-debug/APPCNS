import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const ROLES_LEITURA = ["ADMIN", "DIRETOR", "GESTOR_PROJETO", "APROVADOR"];

// Disponibiliza uma copia do retorno importado, com CRLF e extensao .REM.
// A extensao nao converte o layout nem comprova compatibilidade com F510PRT.
// O fluxo de remessa externa usa a baixa SOAP, apos validacao do retorno.
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const role = (session.user as any).role;
  if (!ROLES_LEITURA.includes(role)) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

  const retorno = await prisma.retornoPagamentoArquivo.findUnique({ where: { id: params.id } });
  if (!retorno || !retorno.conteudoArquivo) {
    return NextResponse.json({ error: "Retorno não encontrado ou sem conteúdo salvo" }, { status: 404 });
  }

  const normalizado = retorno.conteudoArquivo.replace(/\r\n|\r|\n/g, "\r\n");
  const nomeBase = retorno.nomeArquivo.replace(/\.[^.]+$/, "") || `retorno-${retorno.id}`;

  return new NextResponse(normalizado, {
    headers: {
      "Content-Type": "text/plain; charset=ascii",
      "Content-Disposition": `attachment; filename="${nomeBase}.REM"`,
    },
  });
}
