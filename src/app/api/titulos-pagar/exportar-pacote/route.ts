import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { readFile } from "fs/promises";
import path from "path";
import * as XLSX from "xlsx";
import JSZip from "jszip";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { UPLOAD_DIR } from "@/lib/uploadValidation";

// Pacote pra mandar pra fora do sistema (30/09/2026, pedido do João: "quando
// eu exportar os que selecionei já vem uma pasta com o dossiê deles"): um
// ZIP com Relatorio.xlsx (mesma lista + linha de TOTAL) + o PDF do dossiê de
// cada título que tiver um gerado. Título sem dossiê fica listado num
// aviso.txt em vez de sumir silenciosamente -- ninguém deve achar que "tá
// tudo aí" quando faltou peça.

const bodySchema = z.object({ ids: z.array(z.string()).min(1).max(500) });

const REVISAO_LABEL: Record<string, string> = {
  APROVADO: "Aprovado",
  CORRIGIDO: "Corrigido",
  SEM_OC_CONFIRMADO: "Sem OC (confirmado)",
  AGUARDANDO_COMPRAS: "Aguardando compras",
};

function formatData(d: Date | null) {
  if (!d) return "";
  return d.toLocaleDateString("pt-BR", { timeZone: "UTC" });
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const user = session.user as any;
  if (!["ADMIN", "DIRETOR", "GESTOR_PROJETO", "APROVADOR"].includes(user.role)) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Dados inválidos" }, { status: 422 });

  const titulos = await prisma.tituloContasAPagar.findMany({ where: { id: { in: parsed.data.ids } } });
  if (titulos.length === 0) return NextResponse.json({ error: "Nenhum título encontrado" }, { status: 404 });

  const numTits = titulos.map((t) => t.numTit);
  const dossies = await prisma.dossieOC.findMany({
    where: { titulos: { hasSome: numTits } },
    orderBy: { geradoEm: "desc" },
  });

  // Mesmo criterio de desempate do titulos-pagar/route.ts: prefere o dossiê
  // que também bate o fornecedor; entre vários, o mais recente (já vem
  // ordenado) fica pra trás no set (não sobrescreve o primeiro = mais novo).
  const dossiePorChave = new Map<string, (typeof dossies)[number]>();
  for (const d of dossies) {
    for (const numTit of d.titulos) {
      const limpo = numTit.trim();
      if (!limpo) continue;
      if (d.codFor) {
        const comFornecedor = `${d.codFor}|${limpo}`;
        if (!dossiePorChave.has(comFornecedor)) dossiePorChave.set(comFornecedor, d);
      }
      const soNumero = `*|${limpo}`;
      if (!dossiePorChave.has(soNumero)) dossiePorChave.set(soNumero, d);
    }
  }
  function dossieDe(codFor: string, numTit: string) {
    return dossiePorChave.get(`${codFor}|${numTit}`) ?? dossiePorChave.get(`*|${numTit}`) ?? null;
  }

  // ---------- Excel ----------
  const linhas = titulos.map((t) => ({
    "Título": t.numTit,
    "Fornecedor": t.fornecedorNome ?? `código ${t.codFor}`,
    "Status revisão": t.revisadoStatus ? REVISAO_LABEL[t.revisadoStatus] || t.revisadoStatus : "Não revisado",
    "Revisado por": t.revisadoPorNome || "",
    "Centro de custo": t.ccuNome || "",
    "Vencto programado": formatData(t.vencimentoProgramado),
    "Valor original": t.valorOriginal,
    "Valor em aberto": t.valorAberto,
    "Situação": t.pago ? "Pago" : "Não pago",
    "Dossiê incluso": dossieDe(t.codFor, t.numTit)?.arquivoPath ? "Sim" : "Não",
  }));
  linhas.push({
    "Título": "TOTAL",
    "Fornecedor": "", "Status revisão": "", "Revisado por": "", "Centro de custo": "", "Vencto programado": "",
    "Valor original": titulos.reduce((s, t) => s + t.valorOriginal, 0),
    "Valor em aberto": titulos.reduce((s, t) => s + t.valorAberto, 0),
    "Situação": `${titulos.length} título(s)`,
    "Dossiê incluso": "",
  });
  const ws = XLSX.utils.json_to_sheet(linhas);
  ws["!cols"] = [
    { wch: 14 }, { wch: 38 }, { wch: 20 }, { wch: 20 }, { wch: 22 },
    { wch: 16 }, { wch: 16 }, { wch: 16 }, { wch: 12 }, { wch: 14 },
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Selecionados p_ pagamento");
  const excelBuffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;

  // ---------- ZIP: Excel + dossiês ----------
  const zip = new JSZip();
  const hoje = new Date().toISOString().slice(0, 10);
  zip.file(`Relatorio_Selecionados_${hoje}.xlsx`, excelBuffer);

  const semDossie: string[] = [];
  for (const t of titulos) {
    const dossie = dossieDe(t.codFor, t.numTit);
    if (!dossie?.arquivoPath) {
      semDossie.push(`${t.numTit} — ${t.fornecedorNome ?? "fornecedor código " + t.codFor} — ${dossie?.motivo || "sem dossiê gerado"}`);
      continue;
    }
    try {
      const bytes = await readFile(path.join(UPLOAD_DIR, dossie.arquivoPath));
      const nomeSeguro = t.numTit.replace(/[\\/:*?"<>|]/g, "_");
      zip.file(`dossies/${nomeSeguro}.pdf`, bytes);
    } catch {
      semDossie.push(`${t.numTit} — ${t.fornecedorNome ?? "fornecedor código " + t.codFor} — arquivo do dossiê não encontrado em disco`);
    }
  }
  if (semDossie.length > 0) {
    zip.file(
      "titulos_sem_dossie.txt",
      `${semDossie.length} de ${titulos.length} título(s) NÃO têm dossiê incluso neste pacote:\n\n${semDossie.join("\n")}`
    );
  }

  const zipBuffer = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
  return new NextResponse(new Uint8Array(zipBuffer), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="Pagamento_Selecionados_${hoje}.zip"`,
      "Content-Length": String(zipBuffer.length),
    },
  });
}
