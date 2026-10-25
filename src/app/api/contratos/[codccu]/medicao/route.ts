import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { negarSemModulo } from "@/lib/acesso/servidor";
import { escopoDeCustos, podeVerCcu } from "@/lib/custos/acesso";
import { hojeBR } from "@/lib/financeiro/alertas";
import { resumirVinculosMedicao } from "@/lib/medicao/vinculoContrato";

// A ficha usa o CCU exato e o acesso da pessoa, sem o filtro global das listas.
// Consulta somente a copia local; abrir a ficha nunca inicia sincronizacao do Senior.
export async function GET(_req: Request, { params }: { params: { codccu: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const user = session.user as any;
  const negado = await negarSemModulo(user, "medicao");
  if (negado) return negado;
  const escopo = await escopoDeCustos(prisma, user);
  if (!podeVerCcu(escopo, params.codccu)) return NextResponse.json({ error: "Sem permissão para a medição deste contrato" }, { status: 403 });
  const ficha = await prisma.contrato.findUnique({ where: { codccu: params.codccu }, select: { id: true } });
  if (!ficha) return NextResponse.json({ error: "Contrato não encontrado" }, { status: 404 });
  const [contratos, ultima] = await Promise.all([
    prisma.medicaoContrato.findMany({
      where: { codccu: params.codccu },
      select: { numCtr: true, numOfi: true, codccu: true, codccusItens: true, valorContratado: true, valorMedido: true },
    }),
    prisma.atualizacaoMedicao.findFirst({ where: { status: "OK" }, orderBy: { finalizadoEm: "desc" }, select: { finalizadoEm: true } }),
  ]);
  return NextResponse.json({
    codccu: params.codccu,
    mesAtual: hojeBR().slice(0, 7),
    atualizadoEm: ultima?.finalizadoEm ?? null,
    ...resumirVinculosMedicao(params.codccu, contratos),
  }, { headers: { "Cache-Control": "private, no-store" } });
}
