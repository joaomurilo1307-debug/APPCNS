import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { processarRetorno } from "@/lib/pagamentos/processarRetorno";
import { metadadosRetorno, remessasDoRetorno } from "@/lib/pagamentos/resumoRetorno";

const bodySchema = z.object({ nomeArquivo: z.string().min(1).max(255), conteudo: z.string().min(1).max(10_000_000) });

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  if (!["ADMIN", "DIRETOR", "GESTOR_PROJETO", "APROVADOR"].includes((session.user as any).role)) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  const arquivos = await prisma.retornoPagamentoArquivo.findMany({ take: 50, orderBy: { processadoEm: "desc" }, select: {
    id: true, nomeArquivo: true, processadoEm: true, totalRegistros: true, totalReconhecidos: true, remessaId: true, resultadoImportacao: true,
  } });
  const registros = arquivos.map(a => ({ ...a, metadados: metadadosRetorno(a.resultadoImportacao, a.remessaId) }));
  const remessas = await remessasDoRetorno(prisma, registros.flatMap(r => r.metadados.remessaIds));
  return NextResponse.json({ retornos: registros.map(({ resultadoImportacao, metadados, ...a }) => ({
    ...a, naoReconhecidos: metadados.naoReconhecidos, resumoStatus: metadados.resumoStatus,
    remessasVinculadas: remessas.filter(r => metadados.remessaIds.includes(r.id)),
    legadoSemResumo: resultadoImportacao === null,
  })) });
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const user = session.user as any;
  if (!["ADMIN", "DIRETOR"].includes(user.role)) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Dados inválidos", detalhes: parsed.error.flatten() }, { status: 422 });
  try {
    return NextResponse.json(await processarRetorno(prisma, { ...parsed.data, userId: user.id }));
  } catch (e: any) {
    // A transacao garante que uma falha no ultimo item desfaz os anteriores.
    return NextResponse.json({ error: String(e.message ?? "Falha ao processar retorno"), nadaAlterado: true }, { status: 422 });
  }
}
