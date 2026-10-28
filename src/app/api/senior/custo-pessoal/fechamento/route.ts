import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/auditLog";
import { impressaoDoMes, MES_VALIDO, resumoDoMes } from "@/lib/custoPessoal/fechamento";
import { chaveSyncValida } from "@/lib/senior/chaveSync";

// Fechamento dos meses do custo de pessoal (a "memoria": mes fechado nao muda). Mesma chave de sincronizacao das cargas.
//  - acao "fechar": fecha meses que ja estao carregados, guardando resumo e impressao (SHA-256) das linhas. Mes sem folha ou ja fechado e' recusado.
//  - acao "reabrir": caminho EXCEPCIONAL para corrigir um mes fechado. Exige motivo (>= 10 caracteres) e fica na auditoria com a impressao que valia.

const bodySchema = z.object({
  acao: z.enum(["fechar", "reabrir"]),
  meses: z.array(z.string().regex(MES_VALIDO)).min(1).max(12),
  motivo: z.string().trim().max(300).optional(),
});

const chaveValida = (req: Request) => {
  const chave = req.headers.get("x-sync-key");
  return chaveSyncValida(chave);
};

export async function POST(req: Request) {
  if (!chaveValida(req)) return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Payload invalido", detalhes: parsed.error.flatten() }, { status: 422 });
  const { acao, meses, motivo } = parsed.data;

  if (acao === "fechar") {
    const ja = await prisma.custoPessoalFechamento.findMany({ where: { mes: { in: meses } }, select: { mes: true } });
    if (ja.length) return NextResponse.json({ error: "Mes ja fechado", mesesFechados: ja.map((f) => f.mes).sort() }, { status: 409 });
    const fechados: { mes: string; linhas: number; pessoas: number; total: number }[] = [];
    for (const mes of meses) {
      const linhas = await prisma.custoPessoalMes.findMany({ where: { competencia: new Date(`${mes}-01T00:00:00.000Z`) } });
      if (linhas.length === 0) return NextResponse.json({ error: "Nao e' possivel fechar mes sem folha", mesSemFolha: mes, fechadosAntes: fechados.map((f) => f.mes) }, { status: 422 });
      const resumo = resumoDoMes(linhas);
      await prisma.custoPessoalFechamento.create({ data: { mes, fechadoPor: "fechamento pela chave de sincronizacao", impressao: impressaoDoMes(linhas), ...resumo } });
      fechados.push({ mes, ...resumo });
    }
    return NextResponse.json({ ok: true, fechados });
  }

  if (!motivo || motivo.length < 10) return NextResponse.json({ error: "Reabrir um mes fechado exige o motivo (minimo 10 caracteres)" }, { status: 422 });
  const reabertos: string[] = [];
  for (const mes of meses) {
    const f = await prisma.custoPessoalFechamento.findUnique({ where: { mes } });
    if (!f) continue;
    await prisma.custoPessoalFechamento.delete({ where: { mes } });
    await logAudit({ action: "custo_pessoal.reabrir_mes", entityType: "CustoPessoalFechamento", entityId: mes, metadata: { motivo, fechadoEm: f.fechadoEm.toISOString(), impressao: f.impressao, total: f.total, linhas: f.linhas } });
    reabertos.push(mes);
  }
  return NextResponse.json({ ok: true, reabertos, naoEstavamFechados: meses.filter((m) => !reabertos.includes(m)) });
}
