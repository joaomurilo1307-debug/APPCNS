import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { consultarSenior } from "@/lib/senior/getDbInfo";
import { COD_EMP, dataIso, lerOcParaTitulo, numeroSenior } from "@/lib/senior/ocsConferencia";
import { documentoValido } from "@/lib/senior/mapeamentoTitulos";
import { situacaoNfNoSenior } from "@/lib/senior/nfEntrada";
import { listarNotasRecebidas, sugerirNotas } from "@/lib/edocs/notasRecebidas";

// Notas fiscais da OC: as ja associadas (com a situacao delas na Senior) e as SUGESTOES
// do eDocs X. O sistema so' sugere; quem associa e' o financeiro (POST /associar-nf).

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
    const [forn] = await consultarSenior(`SELECT CGCCPF, TIPFOR FROM E095FOR WHERE CODFOR IN (${Number(lida.oc.CODFOR)})`);
    const docFornecedor = documentoValido(forn?.CGCCPF, forn?.TIPFOR);

    const [associadas, notas] = await Promise.all([
      prisma.nfAssociadaOC.findMany({ where: { numOcp, codFil }, orderBy: { associadoEm: "asc" } }),
      listarNotasRecebidas().catch((e: Error) => e),
    ]);
    const naSenior = await Promise.all(associadas.map((a) => situacaoNfNoSenior(lida.oc.CODFOR, a.numeroNf).catch(() => null)));

    let sugestoes: any[] = [];
    let avisoEdocs: string | null = null;
    if (notas instanceof Error) avisoEdocs = `eDocs indisponível: ${notas.message}`;
    else {
      const jaAssociadas = new Set(associadas.map((a) => a.chaveAcesso));
      const outrasOcs = await prisma.nfAssociadaOC.findMany({ where: { chaveAcesso: { in: notas.map((n) => n.chave) } }, select: { chaveAcesso: true, numOcp: true } });
      const usadaEm = new Map<string, string[]>();
      for (const o of outrasOcs) usadaEm.set(o.chaveAcesso, [...(usadaEm.get(o.chaveAcesso) ?? []), o.numOcp]);
      sugestoes = sugerirNotas(
        { docFornecedor, valor: numeroSenior(lida.oc.VLRLIQ), emissao: dataIso(lida.oc.DATEMI), numNfc: lida.oc.USU_NUMNFC?.trim() || null },
        notas.filter((n) => !jaAssociadas.has(n.chave))
      ).map((s) => ({ ...s, tambemAssociadaA: usadaEm.get(s.nota.chave) ?? [] }));
    }
    return NextResponse.json({
      docFornecedor,
      associadas: associadas.map((a, i) => ({ ...a, naSenior: naSenior[i] })),
      sugestoes,
      avisoEdocs,
    });
  } catch (e) {
    return NextResponse.json({ error: `Não foi possível consultar: ${(e as Error).message}` }, { status: 502 });
  }
}
