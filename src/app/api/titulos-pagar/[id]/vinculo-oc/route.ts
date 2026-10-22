import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { negarSemModulo } from "@/lib/acesso/servidor";
import { prisma } from "@/lib/prisma";
import { chavesFornecedor, normalizarReferencia } from "@/lib/vinculoOcTitulo";

// Associa (PUT) ou desfaz (DELETE) a OC de um titulo na Programacao de Pagamento.
// Grava em TituloOcVinculo, que tem prioridade sobre o motor automatico.

const schema = z.object({ numOcp: z.string().trim().min(1).max(30) });

async function autorizar() {
  const session = await getServerSession(authOptions);
  if (!session) return { erro: NextResponse.json({ error: "Não autenticado" }, { status: 401 }) };
  const user = session.user as any;
  const negado = await negarSemModulo(user, "programacao_pagamento", "conferencia_oc");
  if (negado) return { erro: negado };
  return { user };
}

export async function PUT(req: Request, { params }: { params: { id: string } }) {
  const { user, erro } = await autorizar();
  if (erro) return erro;
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Informe o número da OC." }, { status: 422 });

  const titulo = await prisma.tituloContasAPagar.findUnique({ where: { id: params.id } });
  if (!titulo) return NextResponse.json({ error: "Título não encontrado" }, { status: 404 });

  const numOcp = normalizarReferencia(parsed.data.numOcp);
  const oc = await prisma.aprovacaoSenior.findUnique({ where: { numOcp } });
  if (!oc) return NextResponse.json({ error: `OC ${numOcp} não encontrada na base sincronizada` }, { status: 422 });
  const fornecedorBate = chavesFornecedor(oc.fornecedorCodigo, oc.fornecedorNome).some((c) =>
    chavesFornecedor(titulo.codFor, titulo.fornecedorNome).includes(c)
  );
  if (!fornecedorBate) {
    return NextResponse.json(
      { error: `OC ${numOcp} é do fornecedor ${oc.fornecedorNome || oc.fornecedorCodigo}, diferente do título (${titulo.fornecedorNome || titulo.codFor}) -- confira o número` },
      { status: 422 }
    );
  }

  const chave = { numTit: titulo.numTit, codFil: titulo.codFil, codFor: titulo.codFor };
  const v = await prisma.tituloOcVinculo.upsert({
    where: { numTit_codFil_codFor: chave },
    create: { ...chave, numOcp: oc.numOcp, criadoPorNome: user.name ?? "Usuário" },
    update: { numOcp: oc.numOcp, criadoPorNome: user.name ?? "Usuário", criadoEm: new Date() },
  });
  return NextResponse.json({ numOcp: v.numOcp });
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const { erro } = await autorizar();
  if (erro) return erro;
  const titulo = await prisma.tituloContasAPagar.findUnique({ where: { id: params.id } });
  if (!titulo) return NextResponse.json({ error: "Título não encontrado" }, { status: 404 });
  await prisma.tituloOcVinculo.deleteMany({ where: { numTit: titulo.numTit, codFil: titulo.codFil, codFor: titulo.codFor } });
  return NextResponse.json({ ok: true });
}
