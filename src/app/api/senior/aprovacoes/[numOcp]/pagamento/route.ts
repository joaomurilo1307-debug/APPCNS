import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { negarSemModulo } from "@/lib/acesso/servidor";
import { prisma } from "@/lib/prisma";
import { pagamentoDaOc } from "@/lib/senior/pagamentoDaOc";

// Tipo de pagamento da OC (cartao, PIX, boleto...) lido ao vivo da Senior.
// Rota separada de /api/senior/aprovacoes/[numOcp] pra o resumo da OC abrir na
// hora e este dado entrar quando a Senior responder (a consulta ao vivo pode
// demorar alguns segundos).
export async function GET(_req: Request, { params }: { params: { numOcp: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  // Forma de pagamento da OC e' dado de pagamento: so' o time financeiro (decisao do Joao, 22/10/2026).
  const negado = await negarSemModulo(session.user as any, "programacao_pagamento", "pagamentos_itau", "conferencia_oc");
  if (negado) return negado;

  const oc = await prisma.aprovacaoSenior.findUnique({ where: { numOcp: params.numOcp }, select: { codFil: true } });
  if (!oc) return NextResponse.json({ error: "OC não encontrada na base sincronizada" }, { status: 404 });

  try {
    return NextResponse.json(await pagamentoDaOc(params.numOcp, oc.codFil));
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message ?? e).replace(/<[^>]+>/g, " ").slice(0, 200) }, { status: 502 });
  }
}
