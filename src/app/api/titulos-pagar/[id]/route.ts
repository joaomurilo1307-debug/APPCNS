import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// Marcacao manual de conferencia (30/09/2026): quando o vinculo com OC nao
// e' automatico, alguem confere na origem (Senior) e registra aqui o
// resultado -- nao mexe em nada do motor de vinculoOcTitulo.ts, e' so' um
// rastro de acompanhamento pra saber o que ja foi olhado.
const bodySchema = z.object({
  revisadoStatus: z.enum(["APROVADO", "CORRIGIDO", "SEM_OC_CONFIRMADO", "AGUARDANDO_COMPRAS"]).nullable(),
  revisadoObs: z.string().max(500).nullable().optional(),
});

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const user = session.user as any;
  if (!["ADMIN", "DIRETOR", "GESTOR_PROJETO", "APROVADOR"].includes(user.role)) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Dados inválidos", detalhes: parsed.error.flatten() }, { status: 422 });
  }

  const existente = await prisma.tituloContasAPagar.findUnique({ where: { id: params.id } });
  if (!existente) return NextResponse.json({ error: "Título não encontrado" }, { status: 404 });

  const atualizado = await prisma.tituloContasAPagar.update({
    where: { id: params.id },
    data: {
      revisadoStatus: parsed.data.revisadoStatus,
      revisadoObs: parsed.data.revisadoObs ?? null,
      revisadoPorNome: parsed.data.revisadoStatus ? user.name ?? "Usuário" : null,
      revisadoEm: parsed.data.revisadoStatus ? new Date() : null,
    },
  });

  return NextResponse.json({
    id: atualizado.id,
    revisadoStatus: atualizado.revisadoStatus,
    revisadoPorNome: atualizado.revisadoPorNome,
    revisadoEm: atualizado.revisadoEm,
    revisadoObs: atualizado.revisadoObs,
  });
}
