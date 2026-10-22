import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { negarSemEdicao } from "@/lib/acesso/servidor";
import { prisma } from "@/lib/prisma";
import { alterarVencimentoTitulo } from "@/lib/senior/alterarVencimento";

// "Proxima programacao" (06/10/2026): LEMBRETE do que foi deixado pra depois.
// Nao troca o status de revisao do titulo e nao o tira da lista onde ele esta
// -- so' marca, guarda de qual programacao ele saiu (pro historico) e deixa a
// pessoa tratar de la (devolver a programacao ou mandar pra remessa).
//   POST   -> deixa/atualiza o lembrete (motivo opcional)
//   DELETE -> devolve o titulo a programacao normal (fecha o lembrete; o
//             registro continua no historico)


// novoVencimento (aaaa-mm-dd), opcional: ao deixar pra proxima programacao o vencimento
// programado tambem e' alterado NA SENIOR (AlteraTitulosCP). Se a Senior recusar, nada e' marcado.
const bodySchema = z.object({
  motivo: z.string().max(200).nullable().optional(),
  novoVencimento: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

const SELECAO = { id: true, programacaoOrigem: true, marcadoPorNome: true, marcadoEm: true, motivo: true, resolvidoEm: true, resolvidoComo: true } as const;

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const user = session.user as any;
  const negado = await negarSemEdicao(session.user as any, "programacao_pagamento");
  if (negado) return negado;

  const body = await req.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(body ?? {});
  if (!parsed.success) return NextResponse.json({ error: "Dados inválidos" }, { status: 422 });

  const titulo = await prisma.tituloContasAPagar.findUnique({ where: { id: params.id } });
  if (!titulo) return NextResponse.json({ error: "Título não encontrado" }, { status: 404 });
  if (titulo.pago) return NextResponse.json({ error: "Título já está pago -- não há o que deixar pra próxima programação." }, { status: 422 });

  const motivo = parsed.data.motivo?.trim() || null;

  let vencimentoNovo: Date | null = null;
  if (parsed.data.novoVencimento) {
    vencimentoNovo = new Date(`${parsed.data.novoVencimento}T00:00:00Z`);
    if (Number.isNaN(vencimentoNovo.getTime()) || vencimentoNovo.toISOString().slice(0, 10) !== parsed.data.novoVencimento)
      return NextResponse.json({ error: "Data inválida." }, { status: 422 });
    const hoje = new Date().toISOString().slice(0, 10);
    if (parsed.data.novoVencimento < hoje) return NextResponse.json({ error: "O novo vencimento não pode ser no passado." }, { status: 422 });
    if (titulo.vencimentoProgramado && parsed.data.novoVencimento <= titulo.vencimentoProgramado.toISOString().slice(0, 10))
      return NextResponse.json({ error: "O novo vencimento precisa ser depois do vencimento atual." }, { status: 422 });
    try {
      const r = await alterarVencimentoTitulo(
        { codFil: Number(titulo.codFil), numTit: titulo.numTit, codTpt: titulo.tipo, codFor: Number(titulo.codFor) },
        vencimentoNovo
      );
      if (!r.ok) return NextResponse.json({ error: `A Senior não alterou o vencimento: ${r.mensagem}` }, { status: 422 });
    } catch (e) {
      return NextResponse.json({ error: `Não foi possível falar com a Senior (${(e as Error).message}). Confira o vencimento do título lá antes de repetir.` }, { status: 502 });
    }
    // Senior alterada e conferida: espelha aqui pra tela nao mostrar a data antiga ate o proximo sync.
    await prisma.tituloContasAPagar.update({ where: { id: titulo.id }, data: { vencimentoProgramado: vencimentoNovo } });
  }

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
  const negado = await negarSemEdicao(session.user as any, "programacao_pagamento");
  if (negado) return negado;

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
