import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { negarSemEdicao } from "@/lib/acesso/servidor";
import { prisma } from "@/lib/prisma";
import { gerarEGravar } from "@/lib/dossie/gerar";
import { chaveDaOc, marcarGerando } from "@/lib/dossie/salvar";

// Gera o dossie da(s) OC(s) pelo proprio APPCNS (botao "Gerar dossie" da Conferencia de OC).
// Responde na hora (202); a geracao roda em segundo plano, uma por vez, e a tela acompanha pelo
// status GERANDO -> PUBLICADO/ERRO. So' le a Senior; o PDF fica no APPCNS.

const schema = z.object({
  ocs: z.array(z.object({ numOcp: z.string().regex(/^\d{1,9}$/), codFil: z.string().regex(/^\d{1,4}$/) })).min(1).max(100),
});
const GERANDO_VALE_MS = 15 * 60 * 1000; // passou disso, considera que a geracao morreu (ex.: reinicio do servidor)

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const negado = await negarSemEdicao(session.user as any, "conferencia_oc", "programacao_pagamento");
  if (negado) return negado;
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Dados inválidos (até 100 OCs)." }, { status: 422 });

  const unicas = [...new Map(parsed.data.ocs.map((o) => [chaveDaOc(o.codFil, o.numOcp), o])).values()];
  const aceitas: string[] = [];
  const jaGerando: string[] = [];
  for (const oc of unicas) {
    const atual = await prisma.dossieOC.findUnique({ where: { chave: chaveDaOc(oc.codFil, oc.numOcp) }, select: { status: true, atualizadoEm: true } });
    if (atual?.status === "GERANDO" && Date.now() - atual.atualizadoEm.getTime() < GERANDO_VALE_MS) {
      jaGerando.push(oc.numOcp);
      continue;
    }
    await marcarGerando(oc.codFil, oc.numOcp);
    void gerarEGravar({ codFil: Number(oc.codFil), numOcp: Number(oc.numOcp) }); // fila interna: uma por vez
    aceitas.push(oc.numOcp);
  }
  return NextResponse.json({ aceitas, jaGerando }, { status: 202 });
}
