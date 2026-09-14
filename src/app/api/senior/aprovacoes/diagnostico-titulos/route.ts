import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Rota de diagnostico TEMPORARIA (14/09/2026) -- mesmo padrao de auth por
// chave da sync, pra medir a cobertura real do vinculo titulo<->OC sem
// precisar de sessao logada. Remover depois que a investigacao fechar.
export async function GET(req: Request) {
  const chave = req.headers.get("x-sync-key");
  if (!chave || chave !== process.env.SENIOR_SYNC_KEY) {
    return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });
  }

  const [titulos, ocs] = await Promise.all([
    prisma.tituloContasAPagar.findMany({
      select: { numTit: true, codFor: true, codFil: true, fornecedorNome: true, valorOriginal: true, dataEmissao: true },
    }),
    prisma.aprovacaoSenior.findMany({
      select: { numOcp: true, fornecedorCodigo: true, valor: true, dataEmissao: true, situacaoAtual: true, usuNumTit: true },
    }),
  ]);

  const ocPorTituloReal = new Map<string, (typeof ocs)[number]>();
  for (const oc of ocs) {
    if (!oc.usuNumTit) continue;
    const bruto = oc.usuNumTit.trim();
    if (!bruto) continue;
    const candidatos = new Set<string>([bruto]);
    for (const parte of bruto.split(/[\n\r;,]+/)) {
      const p = parte.trim();
      if (p) candidatos.add(p);
    }
    for (const cand of candidatos) {
      const chaveMap = `${oc.fornecedorCodigo}|${cand}`;
      if (!ocPorTituloReal.has(chaveMap)) ocPorTituloReal.set(chaveMap, oc);
    }
  }

  const ocsPorChaveValor = new Map<string, typeof ocs>();
  for (const oc of ocs) {
    const chaveMap = `${oc.fornecedorCodigo}|${oc.valor.toFixed(2)}`;
    const lista = ocsPorChaveValor.get(chaveMap) ?? [];
    lista.push(oc);
    ocsPorChaveValor.set(chaveMap, lista);
  }

  let real = 0;
  let aproximado = 0;
  let semNenhum = 0;
  const semNenhumAmostra: any[] = [];

  for (const t of titulos) {
    const r = ocPorTituloReal.get(`${t.codFor}|${t.numTit}`);
    if (r) {
      real++;
      continue;
    }
    const candidatas = ocsPorChaveValor.get(`${t.codFor}|${t.valorOriginal.toFixed(2)}`);
    if (candidatas && candidatas.length > 0) {
      aproximado++;
      continue;
    }
    semNenhum++;
    if (semNenhumAmostra.length < 25) {
      semNenhumAmostra.push({
        numTit: t.numTit,
        codFor: t.codFor,
        fornecedorNome: t.fornecedorNome,
        valorOriginal: t.valorOriginal,
        dataEmissao: t.dataEmissao,
      });
    }
  }

  return NextResponse.json({
    totalTitulos: titulos.length,
    totalOCsComUsuNumTit: ocs.filter((o) => o.usuNumTit).length,
    real,
    aproximado,
    semNenhum,
    pctReal: ((real / titulos.length) * 100).toFixed(1),
    pctComAlgumVinculo: (((real + aproximado) / titulos.length) * 100).toFixed(1),
    semNenhumAmostra,
  });
}
