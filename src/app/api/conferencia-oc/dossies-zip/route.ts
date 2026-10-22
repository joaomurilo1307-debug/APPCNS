import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { readFile } from "fs/promises";
import path from "path";
import JSZip from "jszip";
import { authOptions } from "@/lib/auth";
import { negarSemModulo } from "@/lib/acesso/servidor";
import { prisma } from "@/lib/prisma";
import { UPLOAD_DIR } from "@/lib/uploadValidation";

// ZIP com o PDF do dossiê de cada OC selecionada. OC sem dossiê vira linha no
// aviso.txt -- nunca some em silêncio.

const schema = z.object({ ocs: z.array(z.string().regex(/^\d+$/)).min(1).max(200) });

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const negado = await negarSemModulo(session.user as any, "conferencia_oc");
  if (negado) return negado;
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Dados inválidos" }, { status: 422 });

  const dossies = await prisma.dossieOC.findMany({
    where: { numOcp: { in: parsed.data.ocs }, arquivoPath: { not: null } },
    orderBy: { geradoEm: "desc" },
  });
  const zip = new JSZip();
  const incluidas = new Set<string>();
  for (const d of dossies) {
    if (!d.numOcp || incluidas.has(d.numOcp)) continue; // o mais recente de cada OC
    try {
      zip.file(`OC-${d.numOcp}.pdf`, await readFile(path.join(UPLOAD_DIR, d.arquivoPath!)));
      incluidas.add(d.numOcp);
    } catch {
      /* arquivo sumiu do disco: cai no aviso */
    }
  }
  const faltando = parsed.data.ocs.filter((n) => !incluidas.has(n));
  if (faltando.length) zip.file("aviso.txt", `OCs sem dossiê disponível (não incluídas):\n${faltando.join("\n")}\n`);

  const out = new Uint8Array(await zip.generateAsync({ type: "nodebuffer" }));
  return new NextResponse(out, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="dossies-oc-${new Date().toISOString().slice(0, 10)}.zip"`,
    },
  });
}
