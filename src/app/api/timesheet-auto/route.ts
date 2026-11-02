import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { negarSemModulo } from "@/lib/acesso/servidor";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { primeiroDia, somaDias } from "@/lib/timesheetAuto/calculo";
import { DIA_VALIDO, competenciaAtual, configDaPessoa, hojeSP, nomesDosCentros, periodoDaRequisicao, podeVerTimesheetDe, relatorioDaPessoa, tarefasSemCentro } from "@/lib/timesheetAuto/servidor";
import { logAudit } from "@/lib/auditLog";

// Timesheet automatico (aba "Timesheet" do modulo Projetos): opcional, a pessoa ativa e o sistema passa a contar, das tarefas dela, as horas e o percentual por
// centro de custo. Regra de calculo em src/lib/timesheetAuto/calculo.ts (memorial em grupo-consominas-engenharia/memorial_calculo_timesheet_automatico.md).
// GET = relatorio de QUALQUER periodo (`competencia=AAAA-MM`, ou `de`+`ate`): o da propria pessoa, ou de alguem da equipe de quem lidera. Recalculado a cada
// consulta, entao corrigir um dado antigo (horas, status, ausencia) ja aparece; so' o mes FECHADO fica congelado.

const paraDataUtc = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const LIMITE_RETROATIVO_DIAS = 730;

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const u = session.user as any;
  const negado = await negarSemModulo(u, "timesheet_auto");
  if (negado) return negado;

  const sp = new URL(req.url).searchParams;
  const periodo = periodoDaRequisicao(sp);
  if ("erro" in periodo) return NextResponse.json({ error: periodo.erro }, { status: 422 });
  const alvoId = sp.get("userId") ?? u.id;
  if (!(await podeVerTimesheetDe(u, alvoId))) return NextResponse.json({ error: "Sem permissão para ver o timesheet desta pessoa" }, { status: 403 });

  const pessoa = await prisma.user.findUnique({ where: { id: alvoId }, select: { id: true, name: true, cargo: true, setor: true } });
  if (!pessoa) return NextResponse.json({ error: "Pessoa não encontrada" }, { status: 404 });
  const rel = await relatorioDaPessoa(alvoId, periodo.de, periodo.ate);
  if (!rel) return NextResponse.json({ pessoa, ehMeu: alvoId === u.id, ativado: false, periodo, hoje: hojeSP() });

  const nomes = await nomesDosCentros(rel.resultado.centros.map((c) => c.codccu ?? ""));
  const semCentro = alvoId === u.id ? await tarefasSemCentro(alvoId) : [];
  // meses que podem ser consultados: da ativacao ate o mes corrente
  const meses: string[] = [];
  for (let m = rel.config.desde.slice(0, 7); m <= competenciaAtual(); ) {
    meses.push(m);
    const [a, mm] = m.split("-").map(Number);
    m = mm === 12 ? `${a + 1}-01` : `${a}-${String(mm + 1).padStart(2, "0")}`;
  }
  return NextResponse.json({ pessoa, ehMeu: alvoId === u.id, ativado: true, periodo, hoje: hojeSP(), meses, nomesCentros: nomes, semCentro, ...rel });
}

const acaoSchema = z.discriminatedUnion("acao", [
  z.object({ acao: z.literal("ativar"), desde: z.string().regex(DIA_VALIDO).optional(), horasPorDia: z.number().min(1).max(12).optional() }),
  z.object({ acao: z.literal("desativar") }),
  z.object({ acao: z.literal("configurar"), horasPorDia: z.number().min(1).max(12) }),
  z.object({ acao: z.literal("ajustarInicio"), desde: z.string().regex(DIA_VALIDO) }),
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

  const inicioValido = (desde: string) => {
    if (desde > hoje) return "O início não pode ser no futuro";
    if (desde < somaDias(hoje, -LIMITE_RETROATIVO_DIAS)) return "O início não pode ser há mais de 2 anos";
    return null;
  };

  if (d.acao === "ativar") {
    // "a partir de": hoje ou um dia anterior (retroativo: o sistema reconstitui o passado pelas tarefas e pelas horas dedicadas)
    const desde = d.desde ?? hoje;
    const erro = inicioValido(desde);
    if (erro) return NextResponse.json({ error: erro }, { status: 422 });
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
  } else if (d.acao === "ajustarInicio") {
    // corrige o retroativo: antecipar traz mais passado para o calculo; adiar tira. Mes ja fechado nao pode ficar de fora.
    if (!atual) return NextResponse.json({ error: "Ative o timesheet primeiro" }, { status: 409 });
    const erro = inicioValido(d.desde);
    if (erro) return NextResponse.json({ error: erro }, { status: 422 });
    const fechados = await prisma.timesheetAutoFechamento.findMany({ where: { userId: u.id }, select: { competencia: true } });
    if (fechados.some((f) => primeiroDia(f.competencia) < d.desde)) return NextResponse.json({ error: "Há mês fechado antes dessa data: peça ao administrador para reabrir" }, { status: 409 });
    await prisma.timesheetAuto.update({ where: { userId: u.id }, data: { desde: paraDataUtc(d.desde) } });
    await logAudit({ userId: u.id, action: "timesheet.ajustar_inicio", entityType: "TimesheetAuto", entityId: u.id, metadata: { de: atual.desde.toISOString().slice(0, 10), para: d.desde } });
  } else {
    if (!atual) return NextResponse.json({ error: "Ative o timesheet primeiro" }, { status: 409 });
    await prisma.timesheetAuto.update({ where: { userId: u.id }, data: { horasPorDia: d.horasPorDia } });
  }
  return NextResponse.json({ ok: true, config: await configDaPessoa(u.id) });
}
