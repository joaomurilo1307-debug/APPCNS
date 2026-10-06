import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { conferirItensRemessa, itemRemessaSchema } from "@/lib/pagamentos/conferenciaRemessa";

const ROLES_LEITURA = ["ADMIN", "DIRETOR", "GESTOR_PROJETO", "APROVADOR"];

const bodySchema = z.object({ itens: z.array(itemRemessaSchema).max(500) });

// Relatorio de conferencia do carrinho ANTES de gerar a remessa: por item, o
// que falta ou esta errado. Nao grava nada -- e' o mesmo relatorio que a
// geracao (POST /remessas) usa pra decidir se pode ou nao gerar.
export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const role = (session.user as any).role;
  if (!ROLES_LEITURA.includes(role)) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

  const body = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Dados inválidos" }, { status: 422 });

  const relatorio = await conferirItensRemessa(parsed.data.itens);
  return NextResponse.json(relatorio);
}
