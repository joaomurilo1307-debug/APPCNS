import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { negarSemModulo } from "@/lib/acesso/servidor";
import { prisma } from "@/lib/prisma";
import { listarOcsPorVencimento, titulosQueExistem } from "@/lib/senior/ocsConferencia";
import { decidirReserva } from "@/lib/senior/reservaTitulo";

// Conferencia de OC: TODAS as OCs com vencimento no periodo, direto da Senior
// (GetDBInfo), com a situacao de aprovacao, se ja tem titulo e se tem dossie.

const ISO = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const negado = await negarSemModulo(session.user as any, "conferencia_oc");
  if (negado) return negado;

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
      where: { numOcp: { in: numeros } },
      select: { id: true, numOcp: true, status: true, motivo: true, arquivoPath: true, atualizadoEm: true },
      orderBy: { atualizadoEm: "desc" },
    }),
    prisma.tituloGeradoOC.findMany({ where: { numOcp: { in: numeros } } }),
  ]);
  const nfs = await prisma.nfAssociadaOC.findMany({ where: { numOcp: { in: numeros } }, select: { numOcp: true, codFil: true, numeroNf: true } });
  const nfsPorOc = new Map<string, string[]>();
  for (const n of nfs) nfsPorOc.set(`${n.numOcp}|${n.codFil}`, [...(nfsPorOc.get(`${n.numOcp}|${n.codFil}`) ?? []), n.numeroNf]);
  const dossiePorOc = new Map<string, string>(); // dossie com PDF mais recente
  const ultimoPorOc = new Map<string, (typeof dossies)[number]>(); // registro mais recente (qualquer status)
  for (const d of dossies) {
    if (!d.numOcp) continue;
    if (d.arquivoPath && !dossiePorOc.has(d.numOcp)) dossiePorOc.set(d.numOcp, d.id);
    if (!ultimoPorOc.has(d.numOcp)) ultimoPorOc.set(d.numOcp, d);
  }
  // Reserva de titulo gerado aqui so' vale se o titulo existe na Senior; a que ficou orfa (gravacao que falhou
  // sem criar nada) e' apagada. Uma consulta so' na Senior; falha ao conferir = mantem.
  let existentes: Set<string> | null = null;
  try {
    existentes = gerados.length ? await titulosQueExistem(gerados) : new Set();
  } catch {
    existentes = null; // sem conferir: mantem tudo
  }
  const validos = [];
  for (const g of gerados) {
    const existe = existentes === null ? null : existentes.has(`${g.codFor}|${g.numTit}|${g.codTpt}`);
    if (decidirReserva(g.geradoEm, existe) === "orfa") await prisma.tituloGeradoOC.delete({ where: { id: g.id } }).catch(() => {});
    else validos.push(g);
  }
  const geradoPorOc = new Map(validos.map((g) => [`${g.numOcp}|${g.codFil}`, g]));

  return NextResponse.json({
    ocs: ocs.map((o) => {
      const g = geradoPorOc.get(`${o.numOcp}|${o.codFil}`);
      return { ...o, numTit: g?.numTit ?? o.numTitSenior, tituloGeradoAqui: !!g, dossieId: dossiePorOc.get(o.numOcp) ?? null, dossieStatus: ultimoPorOc.get(o.numOcp)?.status ?? null, dossieMotivo: ultimoPorOc.get(o.numOcp)?.motivo ?? null, nfs: nfsPorOc.get(`${o.numOcp}|${o.codFil}`) ?? [] };
    }),
  });
}
