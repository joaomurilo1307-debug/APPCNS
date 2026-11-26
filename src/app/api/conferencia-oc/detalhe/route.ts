import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { negarSemModulo } from "@/lib/acesso/servidor";
import { prisma } from "@/lib/prisma";
import { dataIso, lerOcParaTitulo, numeroSenior, paraOc } from "@/lib/senior/ocsConferencia";
import { lerAprovacaoOc } from "@/lib/senior/aprovacaoOc";
import { montarPagamentoDoTitulo } from "@/lib/senior/pagamentoParaTitulo";
import { apurarTitulosDeUmaOc } from "@/lib/conferenciaOc/titulosDeUmaOc";
import { ORIGEM_TITULO } from "@/lib/conferenciaOc/titulosDaOc";

// Conferencia de UMA OC, ao vivo da Senior: dados da OC, aprovacao multinivel
// (quem aprovou, o que falta, aprovadores cadastrados por CCU) e os dados de
// pagamento que irao dentro do titulo. So' leitura.


export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const negado = await negarSemModulo(session.user as any, "conferencia_oc");
  if (negado) return negado;

  const u = new URL(req.url);
  const numOcp = u.searchParams.get("numOcp") ?? "";
  const codFil = u.searchParams.get("codFil") ?? "";
  if (!/^\d+$/.test(numOcp) || !/^\d+$/.test(codFil)) return NextResponse.json({ error: "OC/filial inválida." }, { status: 422 });

  try {
    const lida = await lerOcParaTitulo(numOcp, codFil);
    if (!lida) return NextResponse.json({ error: "OC não encontrada na Senior." }, { status: 404 });
    const oc = paraOc(lida.oc);
    const [aprovacao, pagamento, gerado, apuracao] = await Promise.all([
      lerAprovacaoOc(numOcp, codFil),
      montarPagamentoDoTitulo(lida.oc, lida.oc.CODFOR, codFil),
      prisma.tituloGeradoOC.findUnique({ where: { numOcp_codFil: { numOcp, codFil } } }),
      apurarTitulosDeUmaOc(oc).catch(() => null), // null = nao deu para conferir os titulos na Senior
    ]);
    const titulos = apuracao?.titulos ?? [];
    return NextResponse.json({
      oc: { ...oc, vencimento: dataIso(lida.oc.USU_DATVECT) },
      aprovacao,
      pagamento: { ...pagamento, campos: undefined },
      numTit: titulos[0]?.numTit ?? gerado?.numTit ?? oc.numTitSenior,
      titulos: titulos.map((t) => ({ numTit: t.numTit, codTpt: t.codTpt, codFor: t.codFor, situacao: t.situacao, valor: t.valor, vencimento: t.vencimento, origemTexto: ORIGEM_TITULO[t.origem] })),
      tituloProvavel: apuracao?.provavel ?? null,
      titulosConferidos: !!apuracao,
      // Gera so' com saldo em aberto (VLRLIQ) e com a Senior confirmando que a OC ainda nao tem titulo (NF, USU_NUMOCP, digitado, manual).
      podeGerar: !!aprovacao?.completa && numeroSenior(lida.oc.VLRLIQ) > 0 && !gerado && !oc.numTitSenior && !!apuracao && titulos.length === 0,
    });
  } catch (e) {
    return NextResponse.json({ error: `Não foi possível consultar a Senior: ${(e as Error).message}` }, { status: 502 });
  }
}
