import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { decidirContestacao, ehRevisorDeContestacao } from "@/lib/contestacoesServidor";

// Decisao do financeiro sobre uma contestacao de custo (aceitar, marcar como realocado ou rejeitar). NAO altera o Senior: registra o andamento e o financeiro ajusta o lancamento la.
const schema = z.object({ status: z.enum(["ACEITA", "REALOCADA", "REJEITADA"]), parecer: z.string().trim().max(4000).nullable().optional() });

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  const user = session?.user as any;
  if (!user?.id) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  if (!(await ehRevisorDeContestacao(user))) return NextResponse.json({ error: "Só o financeiro decide contestações de custo" }, { status: 403 });

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Decisão inválida." }, { status: 422 });
  const r = await decidirContestacao(params.id, parsed.data.status, parsed.data.parecer, { userId: user.id, nome: user.name ?? "O financeiro", via: "sistema" });
  if (!r.ok) return NextResponse.json({ error: r.erro }, { status: r.codigo });
  return NextResponse.json({ id: r.id, status: r.status });
}
