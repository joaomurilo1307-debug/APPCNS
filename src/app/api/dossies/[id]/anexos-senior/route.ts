import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { negarSemModulo } from "@/lib/acesso/servidor";
import { prisma } from "@/lib/prisma";
import { lerAnexosDaOc } from "@/lib/senior/anexosOc";

// Anexos que a OC do dossiê tem na Senior (tela F000ANX), para a janela "Editar dossiê" mostrar o que ainda falta anexar.
// So' leitura. A Senior guarda so' o caminho do arquivo, nao o arquivo (ver lib/dossie/anexosSenior.ts). Mesmo acesso da
// rota de anexos do dossiê.

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const negado = await negarSemModulo(session.user as any, "conferencia_oc", "programacao_pagamento");
  if (negado) return negado;

  const dossie = await prisma.dossieOC.findUnique({ where: { id: params.id }, select: { numOcp: true, codFil: true } });
  if (!dossie) return NextResponse.json({ error: "Dossiê não encontrado" }, { status: 404 });
  const numOcp = (dossie.numOcp ?? "").trim();
  const codFil = (dossie.codFil ?? "").trim() || "1";
  if (!/^\d+$/.test(numOcp)) return NextResponse.json({ numOcp: null, ocEncontrada: false, anexos: [] });

  try {
    const anexos = await lerAnexosDaOc(numOcp, codFil);
    return NextResponse.json({ numOcp, ocEncontrada: anexos !== null, anexos: anexos ?? [] });
  } catch (e) {
    console.error("[dossies/anexos-senior]", numOcp, e);
    return NextResponse.json({ error: "Não foi possível consultar os anexos da OC na Senior agora. Tente de novo em instantes." }, { status: 502 });
  }
}
