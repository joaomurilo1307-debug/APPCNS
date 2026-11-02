import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { negarSemModulo } from "@/lib/acesso/servidor";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { primeiroDia, somaDias } from "@/lib/timesheetAuto/calculo";
import { COMPETENCIA_VALIDA, DIA_VALIDO, competenciaAtual, configDaPessoa, hojeSP, nomesDosCentros, podeVerTimesheetDe, relatorioDaPessoa, tarefasSemCentro } from "@/lib/timesheetAuto/servidor";

// Timesheet automatico (aba "Timesheet" do modulo Projetos): opcional, a pessoa ativa e o sistema passa a contar, das tarefas dela, as horas e o percentual por
// centro de custo. Regra de calculo em src/lib/timesheetAuto/calculo.ts. GET = relatorio do mes (o da propria pessoa, ou de alguem da equipe de quem lidera).

const paraDataUtc = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const u = session.user as any;
  const negado = await negarSemModulo(u, "timesheet_auto");
  if (negado) return negado;

  const sp = new URL(req.url).searchParams;
  const competencia = sp.get("competencia") ?? competenciaAtual();
  if (!COMPETENCIA_VALIDA.test(competencia)) return NextResponse.json({ error: "Competência inválida (use AAAA-MM)" }, { status: 422 });
  const alvoId = sp.get("userId") ?? u.id;
  if (!(await podeVerTimesheetDe(u, alvoId))) return NextResponse.json({ error: "Sem permissão para ver o timesheet desta pessoa" }, { status: 403 });

  const pessoa = await prisma.user.findUnique({ where: { id: alvoId }, select: { id: true, name: true, cargo: true, setor: true } });
  if (!pessoa) return NextResponse.json({ error: "Pessoa não encontrada" }, { status: 404 });
  const rel = await relatorioDaPessoa(alvoId, competencia);
  if (!rel) return NextResponse.json({ pessoa, ehMeu: alvoId === u.id, ativado: false, competencia, hoje: hojeSP() });

  const nomes = await nomesDosCentros(rel.resultado.centros.map((c) => c.codccu ?? ""));
  const semCentro = alvoId === u.id ? await tarefasSemCentro(alvoId) : [];
  // meses que podem ser consultados: da ativacao ate o mes corrente
  const meses: string[] = [];
  for (let m = rel.config.desde.slice(0, 7); m <= competenciaAtual(); ) {
    meses.push(m);
    const [a, mm] = m.split("-").map(Number);
    m = mm === 12 ? `${a + 1}-01` : `${a}-${String(mm + 1).padStart(2, "0")}`;
  }
  return NextResponse.json({ pessoa, ehMeu: alvoId === u.id, ativado: true, competencia, hoje: hojeSP(), meses, nomesCentros: nomes, semCentro, ...rel });
}

const acaoSchema = z.discriminatedUnion("acao", [
  z.object({ acao: z.literal("ativar"), desde: z.string().regex(DIA_VALIDO).optional(), horasPorDia: z.number().min(1).max(12).optional() }),
  z.object({ acao: z.literal("desativar") }),
  z.object({ acao: z.literal("configurar"), horasPorDia: z.number().min(1).max(12) }),
]);

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const u = session.user as any;
  const negado = await negarSemModulo(u, "timesheet_auto");
  if (negado) return negado;
  const parsed = acaoSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });
  const d = parsed.data;
  const hoje = hojeSP();
  const atual = await prisma.timesheetAuto.findUnique({ where: { userId: u.id } });

  if (d.acao === "ativar") {
    // "a partir de": hoje, ou um dia anterior dentro do mes corrente (quem ativa no meio do mes pode incluir o comeco dele)
    const desde = d.desde ?? hoje;
    if (desde > hoje) return NextResponse.json({ error: "O início não pode ser no futuro" }, { status: 422 });
    if (desde < primeiroDia(hoje.slice(0, 7)) && !atual) return NextResponse.json({ error: "O início deve ser dentro do mês corrente" }, { status: 422 });
    if (!atual) {
      await prisma.timesheetAuto.create({ data: { userId: u.id, ativo: true, desde: paraDataUtc(desde), horasPorDia: d.horasPorDia ?? 8 } });
    } else if (!atual.ativo) {
      // reativou: o intervalo desligado vira ausencia automatica, para nao contar horas de quando o timesheet estava desligado
      const parouEm = atual.desativadoEm ? new Date(atual.desativadoEm.getTime()).toISOString().slice(0, 10) : null;
      if (parouEm && parouEm < hoje) {
        await prisma.timesheetAutoAusencia.create({ data: { userId: u.id, de: paraDataUtc(somaDias(parouEm, 1)), ate: paraDataUtc(somaDias(hoje, -1)), motivo: "Timesheet desativado" } });
      }
      await prisma.timesheetAuto.update({ where: { userId: u.id }, data: { ativo: true, desativadoEm: null, ...(d.horasPorDia ? { horasPorDia: d.horasPorDia } : {}) } });
    }
  } else if (d.acao === "desativar") {
    if (!atual || !atual.ativo) return NextResponse.json({ error: "O timesheet não está ativo" }, { status: 409 });
    await prisma.timesheetAuto.update({ where: { userId: u.id }, data: { ativo: false, desativadoEm: new Date() } });
  } else {
    if (!atual) return NextResponse.json({ error: "Ative o timesheet primeiro" }, { status: 409 });
    await prisma.timesheetAuto.update({ where: { userId: u.id }, data: { horasPorDia: d.horasPorDia } });
  }
  return NextResponse.json({ ok: true, config: await configDaPessoa(u.id) });
}
