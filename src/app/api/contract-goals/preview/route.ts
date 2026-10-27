import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { negarSemModulo, podeAcessarModulo } from "@/lib/acesso/servidor";
import { escopoDeCustos, podeVerCcu } from "@/lib/custos/acesso";
import { lerIndicadoresFinanceiros } from "@/lib/contractGoals/financial";

const month = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);
const preview = z.object({
  source: z.enum(["CUSTO", "MEDICAO", "FATURAMENTO"]),
  sourceCcu: z.string().regex(/^\d+$/).nullish(), codccu: z.string().regex(/^\d+$/).nullish(),
  sourceAccount: z.string().max(100).nullish(), periodStart: month, periodEnd: month,
});

// Prévia sem persistência: nenhuma meta, projeto ou medição é criada por esta rota.
export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const usuario = session.user as any;
  const negado = await negarSemModulo(usuario, "metas"); if (negado) return negado;
  const parsed = preview.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Selecione a fonte, o centro de custo e o período de referência" }, { status: 422 });
  const ccu = parsed.data.sourceCcu || parsed.data.codccu;
  if (!ccu) return NextResponse.json({ error: "A fonte financeira precisa de um centro de custo" }, { status: 422 });
  const [acessoFonte, escopo] = await Promise.all([
    podeAcessarModulo(usuario, parsed.data.source === "CUSTO" ? "custos" : "medicao"), escopoDeCustos(prisma, usuario, "FINANCEIRO"),
  ]);
  if (usuario.role === "CLIENTE" || !acessoFonte || !podeVerCcu(escopo, ccu)) {
    return NextResponse.json({ error: "Sem acesso à fonte deste centro de custo" }, { status: 403 });
  }
  const leitura = (await lerIndicadoresFinanceiros([{ ...parsed.data, id: "preview", sourceCcu: ccu, contrato: null }], usuario)).get("preview");
  return NextResponse.json({ value: leitura?.valor ?? null, updatedAt: leitura?.atualizadoEm ?? null, error: leitura?.erro ?? null });
}
