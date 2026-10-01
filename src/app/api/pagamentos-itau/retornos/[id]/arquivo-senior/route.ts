import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const ROLES_LEITURA = ["ADMIN", "DIRETOR", "GESTOR_PROJETO", "APROVADOR"];

// Reexporta o retorno (CNAB240) já importado aqui pro formato que a Sênior
// aceita em Finanças > Contas a Pagar > Pagamento Eletrônico > Retorno
// (F510PRT, ver documentacao.senior.com.br/.../pagamento-eletronico.htm).
// O Pagamento Eletrônico da Sênior é construído sobre o MESMO padrão CNAB
// 240 que o Itaú já entrega -- não existe layout próprio pra converter.
// O que a Sênior valida ali é a EXTENSÃO do arquivo ("por exemplo .TXT, .REM
// e .DOC") -- o .ret que o banco entrega não está nessa lista. Normaliza a
// quebra de linha pra CRLF (padrão CNAB240, mesmo usado por
// lib/cnab240/itau/remessa.ts) por garantia, caso o arquivo tenha passado
// por algo que uniformizou pra LF no caminho até aqui.
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
