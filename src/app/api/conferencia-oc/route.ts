import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { listarOcsPorVencimento } from "@/lib/senior/ocsConferencia";

// Conferencia de OC: TODAS as OCs com vencimento no periodo, direto da Senior
// (GetDBInfo), com a situacao de aprovacao, se ja tem titulo e se tem dossie.

const PAPEIS = ["ADMIN", "DIRETOR", "GESTOR_PROJETO", "APROVADOR"];
const ISO = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  if (!PAPEIS.includes((session.user as any).role)) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

  const u = new URL(req.url);
  const de = u.searchParams.get("de") ?? "";
  const ate = u.searchParams.get("ate") ?? "";
  if (!ISO.test(de) || !ISO.test(ate) || de > ate) return NextResponse.json({ error: "Informe o período de vencimento (de/até)." }, { status: 422 });

  let ocs;
  try {
    ocs = await listarOcsPorVencimento(de, ate);
  } catch (e) {
    return NextResponse.json({ error: `Não foi possível consultar a Senior: ${(e as Error).message}` }, { status: 502 });
  }

  const numeros = ocs.map((o) => o.numOcp);
  const [dossies, gerados] = await Promise.all([
    prisma.dossieOC.findMany({
      where: { numOcp: { in: numeros }, arquivoPath: { not: null } },
      select: { id: true, numOcp: true },
      orderBy: { geradoEm: "desc" },
    }),
    prisma.tituloGeradoOC.findMany({ where: { numOcp: { in: numeros } } }),
  ]);
  const dossiePorOc = new Map<string, string>();
  for (const d of dossies) if (d.numOcp && !dossiePorOc.has(d.numOcp)) dossiePorOc.set(d.numOcp, d.id); // o mais recente
  const geradoPorOc = new Map(gerados.map((g) => [`${g.numOcp}|${g.codFil}`, g]));

  return NextResponse.json({
    ocs: ocs.map((o) => {
      const g = geradoPorOc.get(`${o.numOcp}|${o.codFil}`);
      return { ...o, numTit: g?.numTit ?? o.numTitSenior, tituloGeradoAqui: !!g, dossieId: dossiePorOc.get(o.numOcp) ?? null };
    }),
  });
}
