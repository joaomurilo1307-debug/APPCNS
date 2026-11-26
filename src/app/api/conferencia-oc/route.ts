import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { negarSemModulo } from "@/lib/acesso/servidor";
import { prisma } from "@/lib/prisma";
import { lerTitulosDasOcs, listarOcsPorVencimento, titulosQueExistem } from "@/lib/senior/ocsConferencia";
import { decidirReserva } from "@/lib/senior/reservaTitulo";
import { tituloDigitadoExiste } from "@/lib/conferenciaOc/tituloDigitado";
import { apurarTitulosDasOcs, chaveOc, ORIGEM_TITULO, type ApuracaoTitulos } from "@/lib/conferenciaOc/titulosDaOc";
import { carregarGruposFornecedores } from "@/lib/senior/vinculosOc";

// Conferencia de OC: TODAS as OCs com vencimento no periodo, direto da Senior
// (GetDBInfo), com a situacao de aprovacao, se ja tem titulo e se tem dossie.
// A tela so' mostra as que AINDA NAO TEM titulo: a que ja' virou titulo segue na Programacao de Pagamento
// (regra em src/lib/conferenciaOc/titulosDaOc.ts).

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
  const [dossies, gerados, manuais] = await Promise.all([
    prisma.dossieOC.findMany({
      where: { numOcp: { in: numeros } },
      select: { id: true, numOcp: true, status: true, motivo: true, arquivoPath: true, atualizadoEm: true },
      orderBy: { atualizadoEm: "desc" },
    }),
    prisma.tituloGeradoOC.findMany({ where: { numOcp: { in: numeros } } }),
    prisma.tituloOcVinculo.findMany({ where: { numOcp: { in: numeros } }, select: { numTit: true, codFil: true, codFor: true, numOcp: true } }),
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

  // Titulos de cada OC, lidos agora na Senior (NF de compra, USU_NUMOCP do titulo, numero digitado, grupo de fornecedores,
  // vinculo manual e titulo gerado aqui). Se a Senior falhar nessa parte, cai na conferencia antiga (base espelhada, so' o
  // numero digitado) e a tela avisa.
  let apuracao: Map<string, ApuracaoTitulos> | null = null;
  try {
    const grupos = await carregarGruposFornecedores();
    const { titulos, nfs: nfsSenior } = await lerTitulosDasOcs(ocs, grupos);
    apuracao = apurarTitulosDasOcs(ocs, {
      titulos,
      nfs: nfsSenior,
      manuais,
      gerados: validos.map((g) => ({ ...g, vencimento: g.vencimento.toISOString().slice(0, 10) })),
      grupos,
    });
  } catch (e) {
    console.error("[conferencia-oc] titulos na Senior:", String((e as Error)?.message ?? e).replace(/<[^>]+>/g, " ").slice(0, 200));
  }

  const resposta = apuracao ? montarPelaSenior(ocs, apuracao) : await montarPelaBaseEspelhada(ocs, validos);
  return NextResponse.json({
    titulosConferidos: !!apuracao,
    ocs: resposta.map((o) => ({
      ...o,
      dossieId: dossiePorOc.get(o.numOcp) ?? null,
      dossieStatus: ultimoPorOc.get(o.numOcp)?.status ?? null,
      dossieMotivo: ultimoPorOc.get(o.numOcp)?.motivo ?? null,
      nfs: nfsPorOc.get(`${o.numOcp}|${o.codFil}`) ?? [],
    })),
  });
}

type OcLida = Awaited<ReturnType<typeof listarOcsPorVencimento>>[number];

function montarPelaSenior(ocs: OcLida[], apuracao: Map<string, ApuracaoTitulos>) {
  return ocs.map((o) => {
    const a = apuracao.get(chaveOc(o)) ?? { titulos: [], provavel: null, digitadoInexistente: !!o.numTitSenior };
    const primeiro = a.titulos[0];
    return {
      ...o,
      numTit: primeiro?.numTit ?? o.numTitSenior,
      tituloGeradoAqui: a.titulos.some((t) => t.origem === "GERADO_AQUI"),
      temTitulo: a.titulos.length > 0,
      titulos: a.titulos.map((t) => ({ numTit: t.numTit, codTpt: t.codTpt, codFor: t.codFor, codFil: t.codFil, situacao: t.situacao, valor: t.valor, vencimento: t.vencimento, origem: t.origem, origemTexto: ORIGEM_TITULO[t.origem] })),
      tituloProvavel: a.provavel
        ? { numTit: a.provavel.numTit, codTpt: a.provavel.codTpt, codFor: a.provavel.codFor, codFil: a.provavel.codFil, valor: a.provavel.valor, vencimento: a.provavel.vencimento, numNfc: a.provavel.numNfc }
        : null,
      digitadoInexistente: a.digitadoInexistente,
    };
  });
}

// Conferencia antiga (ate' 23/11/2026), so' quando a Senior nao respondeu a leitura dos titulos: numero digitado na OC
// (USU_NUMTIT) conferido contra os titulos do mesmo fornecedor na base espelhada, mais o titulo gerado aqui.
// 29/10/2026: a OC 16239 digitou 43=1, que nao existia, e sumiu da tela -- por isso o digitado precisa existir.
async function montarPelaBaseEspelhada(ocs: OcLida[], gerados: { numOcp: string; codFil: string; numTit: string }[]) {
  const geradoPorOc = new Map(gerados.map((g) => [`${g.numOcp}|${g.codFil}`, g]));
  const digitados = ocs.filter((o) => o.numTitSenior);
  let titulosPorFornecedor: Map<string, string[]> | null = new Map();
  if (digitados.length) {
    try {
      const linhas = await prisma.tituloContasAPagar.findMany({
        where: { codFor: { in: [...new Set(digitados.map((o) => o.codFor))] }, situacao: { not: "CA" } },
        select: { codFor: true, numTit: true },
      });
      for (const l of linhas) titulosPorFornecedor.set(l.codFor, [...(titulosPorFornecedor.get(l.codFor) ?? []), l.numTit]);
    } catch {
      titulosPorFornecedor = null;
    }
  }
  return ocs.map((o) => {
    const g = geradoPorOc.get(`${o.numOcp}|${o.codFil}`);
    const digitadoExiste = !!o.numTitSenior && (titulosPorFornecedor === null || tituloDigitadoExiste(o.numTitSenior, titulosPorFornecedor.get(o.codFor) ?? []));
    return {
      ...o,
      numTit: g?.numTit ?? o.numTitSenior,
      tituloGeradoAqui: !!g,
      temTitulo: !!g || digitadoExiste,
      titulos: [],
      tituloProvavel: null,
      digitadoInexistente: !!o.numTitSenior && !digitadoExiste,
    };
  });
}
