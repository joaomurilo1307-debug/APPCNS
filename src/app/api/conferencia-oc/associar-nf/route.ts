import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { buscarNotaPorChave } from "@/lib/edocs/notasRecebidas";

// Associacao MANUAL de uma NF recebida (eDocs X) a uma OC. A nota e' relida do eDocs pela
// chave -- o navegador manda so' qual OC e qual chave. DELETE desfaz (corrigir engano).

const PAPEIS = ["ADMIN", "DIRETOR", "GESTOR_PROJETO", "APROVADOR"];
const schema = z.object({ numOcp: z.string().regex(/^\d+$/), codFil: z.string().regex(/^\d+$/), chaveAcesso: z.string().regex(/^\d{44}$/) });
const erro = (error: string, status = 409) => NextResponse.json({ error }, { status });

async function autorizar() {
  const session = await getServerSession(authOptions);
  if (!session) return { r: erro("Não autenticado", 401) } as const;
  const user = session.user as any;
  if (!PAPEIS.includes(user.role)) return { r: erro("Sem permissão", 403) } as const;
  return { user } as const;
}

export async function POST(req: Request) {
  const a = await autorizar();
  if ("r" in a) return a.r;
  const p = schema.safeParse(await req.json().catch(() => null));
  if (!p.success) return erro("Dados inválidos.", 422);
  const { numOcp, codFil, chaveAcesso } = p.data;

  let nota;
  try {
    nota = await buscarNotaPorChave(chaveAcesso);
  } catch (e) {
    return erro(`eDocs indisponível: ${(e as Error).message}`, 502);
  }
  if (!nota) return erro("Nota não encontrada no eDocs.", 404);

  try {
    const criada = await prisma.nfAssociadaOC.create({
      data: {
        numOcp, codFil, chaveAcesso,
        numeroNf: nota.numero, serie: nota.serie, emitente: nota.emitente, emitenteDoc: nota.cnpj, valor: nota.valor,
        emissao: nota.emissao ? new Date(`${nota.emissao}T00:00:00Z`) : null,
        associadoPor: a.user.name ?? a.user.email ?? "?",
      },
    });
    return NextResponse.json({ ok: true, associada: criada });
  } catch {
    return erro("Esta nota já está associada a esta OC.");
  }
}

export async function DELETE(req: Request) {
  const a = await autorizar();
  if ("r" in a) return a.r;
  const p = schema.safeParse(await req.json().catch(() => null));
  if (!p.success) return erro("Dados inválidos.", 422);
  const r = await prisma.nfAssociadaOC.deleteMany({ where: p.data });
  return r.count ? NextResponse.json({ ok: true }) : erro("Associação não encontrada.", 404);
}
