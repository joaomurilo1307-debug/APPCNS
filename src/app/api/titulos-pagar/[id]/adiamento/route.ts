import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// "Proxima programacao" (06/10/2026): LEMBRETE do que foi deixado pra depois.
// Nao troca o status de revisao do titulo e nao o tira da lista onde ele esta
// -- so' marca, guarda de qual programacao ele saiu (pro historico) e deixa a
// pessoa tratar de la (devolver a programacao ou mandar pra remessa).
//   POST   -> deixa/atualiza o lembrete (motivo opcional)
//   DELETE -> devolve o titulo a programacao normal (fecha o lembrete; o
//             registro continua no historico)

const ROLES = ["ADMIN", "DIRETOR", "GESTOR_PROJETO", "APROVADOR"];

const bodySchema = z.object({ motivo: z.string().max(200).nullable().optional() });

const SELECAO = { id: true, programacaoOrigem: true, marcadoPorNome: true, marcadoEm: true, motivo: true, resolvidoEm: true, resolvidoComo: true } as const;

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const user = session.user as any;
  if (!ROLES.includes(user.role)) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(body ?? {});
  if (!parsed.success) return NextResponse.json({ error: "Dados inválidos" }, { status: 422 });

  const titulo = await prisma.tituloContasAPagar.findUnique({ where: { id: params.id } });
  if (!titulo) return NextResponse.json({ error: "Título não encontrado" }, { status: 404 });
  if (titulo.pago) return NextResponse.json({ error: "Título já está pago -- não há o que deixar pra próxima programação." }, { status: 422 });

  const motivo = parsed.data.motivo?.trim() || null;
  const aberto = await prisma.tituloAdiamento.findFirst({
    where: { tituloId: titulo.id, resolvidoEm: null },
    orderBy: { marcadoEm: "desc" },
  });

  // Ja' tem lembrete aberto: so' atualiza o motivo (a programacao de origem
  // fica a de quando foi marcado a primeira vez).
  const adiamento = aberto
    ? await prisma.tituloAdiamento.update({ where: { id: aberto.id }, data: { motivo }, select: SELECAO })
    : await prisma.tituloAdiamento.create({
        data: {
          tituloId: titulo.id,
          numTit: titulo.numTit,
          codFor: titulo.codFor,
          fornecedorNome: titulo.fornecedorNome,
          valor: titulo.valorAberto,
          programacaoOrigem: titulo.vencimentoProgramado,
          marcadoPorNome: user.name ?? "Usuário",
          motivo,
        },
        select: SELECAO,
      });

  return NextResponse.json({ adiamento });
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const user = session.user as any;
  if (!ROLES.includes(user.role)) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

  await prisma.tituloAdiamento.updateMany({
    where: { tituloId: params.id, resolvidoEm: null },
    data: { resolvidoEm: new Date(), resolvidoComo: "DEVOLVIDO" },
  });

  const ultimo = await prisma.tituloAdiamento.findFirst({
    where: { tituloId: params.id },
    orderBy: { marcadoEm: "desc" },
    select: SELECAO,
  });
  return NextResponse.json({ adiamento: ultimo });
}
