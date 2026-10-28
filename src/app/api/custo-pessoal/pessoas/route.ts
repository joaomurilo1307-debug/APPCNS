import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { negarSemModulo } from "@/lib/acesso/servidor";
import { logAudit } from "@/lib/auditLog";
import { CCUS_ADM } from "@/lib/custoPessoal/escopo";
import { totalComProLabore } from "@/lib/custoPessoal/componentes";

// A folha de um centro de custo ADM: quem compoe o total, pessoa a pessoa (nome, cargo e cada componente). `mes` (aaaa-mm) e' opcional: sem ele
// devolve todos os meses do centro. Dado sensivel: so' o modulo restrito "custo_pessoal" le, e cada abertura fica registrada na auditoria.
export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  const usuario = session?.user as any;
  const negado = await negarSemModulo(usuario, "custo_pessoal");
  if (negado) return negado;

  const url = new URL(req.url);
  const ccu = url.searchParams.get("ccu") ?? "";
  const mes = url.searchParams.get("mes");
  if (!CCUS_ADM.has(ccu)) return NextResponse.json({ error: "Centro de custo fora do escopo (só os núcleos ADM)" }, { status: 400 });
  if (mes && !/^\d{4}-\d{2}$/.test(mes)) return NextResponse.json({ error: "Mês inválido (use aaaa-mm)" }, { status: 400 });

  const linhas = await prisma.custoPessoalMes.findMany({
    where: { codccu: ccu, ...(mes ? { competencia: new Date(`${mes}-01T00:00:00.000Z`) } : {}) },
    orderBy: [{ competencia: "asc" }, { total: "desc" }, { nome: "asc" }],
  });
  await logAudit({ userId: usuario?.id, action: "custo_pessoal.ver_folha", entityType: "CentroDeCusto", entityId: ccu, metadata: { mes: mes ?? "todos", pessoas: linhas.length } });
  return NextResponse.json({
    pessoas: linhas.map((l) => ({
      mes: l.competencia.toISOString().slice(0, 7), matricula: l.matricula, nome: l.nome, cargo: l.cargo, situacao: l.situacao, dataSituacao: l.dataSituacao, admissao: l.admissao, salarioBase: l.salarioBase,
      liquido: l.liquido, rescisao: l.rescisao, inss: l.inss, fgts: l.fgts, irrf: l.irrf, provFerias: l.provFerias, provTerco: l.provTerco, prov13: l.prov13, provInss: l.provInss, provFgts: l.provFgts,
      proLabore: l.proLabore, total: l.total, totalComProLabore: totalComProLabore(l),
    })),
  });
}
