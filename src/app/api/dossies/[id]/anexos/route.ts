import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { negarSemModulo } from "@/lib/acesso/servidor";
import { prisma } from "@/lib/prisma";
import { LIMITES_ANEXO, incluirAnexo, listarAnexos } from "@/lib/dossie/anexos";

// Anexos do dossiê (botão "Editar dossiê"): lista e inclui. Mesmo acesso de quem abre o dossiê (Conferência de OC ou
// Programação de Pagamento). Os arquivos entram no fim do PDF do dossiê (ver lib/dossie/anexos.ts).

async function autorizar() {
  const session = await getServerSession(authOptions);
  if (!session) return { erro: NextResponse.json({ error: "Não autenticado" }, { status: 401 }) };
  const negado = await negarSemModulo(session.user as any, "conferencia_oc", "programacao_pagamento");
  if (negado) return { erro: negado };
  return { usuario: session.user as { id?: string; name?: string | null } };
}

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const a = await autorizar();
  if (a.erro) return a.erro;
  const dossie = await prisma.dossieOC.findUnique({ where: { id: params.id }, select: { id: true, numOcp: true, codFil: true, fornecedorNome: true, arquivoPath: true, geradoEm: true, atualizadoEm: true } });
  if (!dossie) return NextResponse.json({ error: "Dossiê não encontrado" }, { status: 404 });
  return NextResponse.json({
    dossie: { id: dossie.id, numOcp: dossie.numOcp, codFil: dossie.codFil, fornecedorNome: dossie.fornecedorNome, temArquivo: !!dossie.arquivoPath, atualizadoEm: dossie.atualizadoEm },
    anexos: await listarAnexos(dossie.id),
    limites: LIMITES_ANEXO,
  });
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const a = await autorizar();
  if (a.erro) return a.erro;
  const dossie = await prisma.dossieOC.findUnique({ where: { id: params.id }, select: { id: true, numOcp: true, arquivoPath: true } });
  if (!dossie) return NextResponse.json({ error: "Dossiê não encontrado" }, { status: 404 });
  if (!dossie.arquivoPath) return NextResponse.json({ error: "Gere o dossiê antes de anexar documentos." }, { status: 409 });

  const form = await req.formData().catch(() => null);
  const arquivos = (form?.getAll("arquivos") ?? []).filter((f): f is File => typeof f === "object" && f !== null && "arrayBuffer" in f);
  if (!arquivos.length) return NextResponse.json({ error: "Nenhum arquivo enviado." }, { status: 422 });

  const resultado: { nome: string; ok: boolean; erro?: string }[] = [];
  for (const arquivo of arquivos) {
    try {
      const anexo = await incluirAnexo(dossie.id, { nome: arquivo.name, bytes: new Uint8Array(await arquivo.arrayBuffer()) }, { id: a.usuario.id, nome: a.usuario.name });
      resultado.push({ nome: arquivo.name, ok: true });
      await prisma.auditLog
        .create({ data: { userId: a.usuario.id ?? null, action: "DOSSIE_ANEXO_INCLUIDO", entityType: "DossieOC", entityId: dossie.id, metadata: JSON.stringify({ numOcp: dossie.numOcp, anexoId: anexo.id, nome: anexo.nome, tipo: anexo.tipo, bytes: anexo.bytes }) } })
        .catch(() => {});
    } catch (e) {
      resultado.push({ nome: arquivo.name, ok: false, erro: e instanceof Error ? e.message : String(e) });
    }
  }
  const incluidos = resultado.filter((r) => r.ok).length;
  return NextResponse.json({ resultado, anexos: await listarAnexos(dossie.id) }, { status: incluidos ? 201 : 422 });
}
