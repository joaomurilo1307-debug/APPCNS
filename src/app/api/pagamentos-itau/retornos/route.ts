import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { negarSemModulo } from "@/lib/acesso/servidor";
import { prisma } from "@/lib/prisma";
import { processarRetorno } from "@/lib/pagamentos/processarRetorno";
import { alterarSituacaoTitulo } from "@/lib/senior/situacaoTitulo";
import { metadadosRetorno, remessasDoRetorno } from "@/lib/pagamentos/resumoRetorno";

const bodySchema = z.object({ nomeArquivo: z.string().min(1).max(255), conteudo: z.string().min(1).max(10_000_000) });

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const negado = await negarSemModulo(session.user as any, "pagamentos_itau");
  if (negado) return negado;
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
  const negado = await negarSemModulo(session.user as any, "pagamentos_itau");
  if (negado) return negado;
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Dados inválidos", detalhes: parsed.error.flatten() }, { status: 422 });
  let resultado;
  try {
    resultado = await processarRetorno(prisma, { ...parsed.data, userId: user.id });
  } catch (e: any) {
    // A transacao garante que uma falha no ultimo item desfaz os anteriores.
    return NextResponse.json({ error: String(e.message ?? "Falha ao processar retorno"), nadaAlterado: true }, { status: 422 });
  }

  // Rejeitado/cancelado sem outro pagamento ativo: devolve o titulo pra AB na
  // Senior (a geracao da remessa marcou PE). Fora da transacao do retorno --
  // falha aqui so' aparece na resposta, o retorno ja esta gravado.
  const situacaoSenior: { numTit: string; ok: boolean; mensagem: string }[] = [];
  const ids = "titulosSemPagamentoAtivo" in resultado ? resultado.titulosSemPagamentoAtivo : [];
  for (const t of await prisma.tituloContasAPagar.findMany({ where: { id: { in: ids } }, select: { id: true, numTit: true, codFil: true, codFor: true, tipo: true } })) {
    const r = await alterarSituacaoTitulo({ codFil: Number(t.codFil), codFor: Number(t.codFor), codTpt: t.tipo, numTit: t.numTit }, "AB");
    situacaoSenior.push({ numTit: t.numTit, ...r });
    await prisma.auditLog
      .create({ data: { userId: user.id, action: "SENIOR_SITUACAO_AB", entityType: "TituloContasAPagar", entityId: t.id, metadata: JSON.stringify(r) } })
      .catch(() => {});
  }
  return NextResponse.json({ ...resultado, situacaoSenior });
}
