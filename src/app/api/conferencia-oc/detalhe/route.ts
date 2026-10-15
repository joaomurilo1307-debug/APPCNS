import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { dataIso, lerOcParaTitulo, numeroSenior, paraOc } from "@/lib/senior/ocsConferencia";
import { lerAprovacaoOc } from "@/lib/senior/aprovacaoOc";
import { montarPagamentoDoTitulo } from "@/lib/senior/pagamentoParaTitulo";

// Conferencia de UMA OC, ao vivo da Senior: dados da OC, aprovacao multinivel
// (quem aprovou, o que falta, aprovadores cadastrados por CCU) e os dados de
// pagamento que irao dentro do titulo. So' leitura.

const PAPEIS = ["ADMIN", "DIRETOR", "GESTOR_PROJETO", "APROVADOR"];

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  if (!PAPEIS.includes((session.user as any).role)) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

  const u = new URL(req.url);
  const numOcp = u.searchParams.get("numOcp") ?? "";
  const codFil = u.searchParams.get("codFil") ?? "";
  if (!/^\d+$/.test(numOcp) || !/^\d+$/.test(codFil)) return NextResponse.json({ error: "OC/filial inválida." }, { status: 422 });

  try {
    const lida = await lerOcParaTitulo(numOcp, codFil);
    if (!lida) return NextResponse.json({ error: "OC não encontrada na Senior." }, { status: 404 });
    const [aprovacao, pagamento, gerado] = await Promise.all([
      lerAprovacaoOc(numOcp, codFil),
      montarPagamentoDoTitulo(lida.oc, lida.oc.CODFOR, codFil),
      prisma.tituloGeradoOC.findUnique({ where: { numOcp_codFil: { numOcp, codFil } } }),
    ]);
    const oc = paraOc(lida.oc);
    return NextResponse.json({
      oc: { ...oc, vencimento: dataIso(lida.oc.USU_DATVECT), valor: numeroSenior(lida.oc.VLRLIQ) },
      aprovacao,
      pagamento: { ...pagamento, campos: undefined },
      numTit: gerado?.numTit ?? oc.numTitSenior,
      podeGerar: !!aprovacao?.completa && oc.valor > 0 && !gerado && !oc.numTitSenior,
    });
  } catch (e) {
    return NextResponse.json({ error: `Não foi possível consultar a Senior: ${(e as Error).message}` }, { status: 502 });
  }
}
