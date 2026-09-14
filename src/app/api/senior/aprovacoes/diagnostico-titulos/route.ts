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
      select: { numTit: true, codFor: true, codFil: true, fornecedorNome: true, valorOriginal: true, dataEmissao: true, tipo: true },
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

  // Nem todo titulo pode ter OC -- impostos, INSS/FGTS, pagamentos a governo
  // e folha nao passam por Ordem de Compra (nao e' falta de dado, e' a
  // natureza do lancamento). Marca por padrao de nome do fornecedor + tipo
  // de titulo (CODTPT), pra medir cobertura so' do universo que DEVERIA ter
  // OC (compra de fornecedor de verdade).
  const PADRAO_NAO_OC = /SECRETARIA DE (ESTADO|FAZENDA)|GOVERNO FEDERAL|MINISTERIO DA FAZENDA|RECEITA FEDERAL|PREFEITURA|MUNICIPIO DE|INSS\b|FGTS\b|CAIXA ECON.MICA|FOPAG|FORNECEDORES DIVERSOS|SALARIO|INPS/i;

  function provavelNaoOC(t: (typeof titulos)[number]) {
    if (PADRAO_NAO_OC.test(t.fornecedorNome || "")) return true;
    if (/^FOPAG/i.test(t.numTit)) return true;
    if (t.tipo === "IMP") return true;
    return false;
  }

  let real = 0;
  let aproximado = 0;
  let semNenhumAddressavel = 0;
  let naoAplicavel = 0;
  const semNenhumAmostra: any[] = [];
  const semNenhumAmostraNaoPRV: any[] = [];
  const semNenhumPorTipo: Record<string, number> = {};

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
    if (provavelNaoOC(t)) {
      naoAplicavel++;
      continue;
    }
    semNenhumAddressavel++;
    semNenhumPorTipo[t.tipo] = (semNenhumPorTipo[t.tipo] || 0) + 1;
    if (t.tipo !== "PRV" && semNenhumAmostraNaoPRV.length < 40) {
      semNenhumAmostraNaoPRV.push({
        numTit: t.numTit,
        codFor: t.codFor,
        tipo: t.tipo,
        fornecedorNome: t.fornecedorNome,
        valorOriginal: t.valorOriginal,
        dataEmissao: t.dataEmissao,
      });
    }
    if (semNenhumAmostra.length < 40) {
      semNenhumAmostra.push({
        numTit: t.numTit,
        codFor: t.codFor,
        tipo: t.tipo,
        fornecedorNome: t.fornecedorNome,
        valorOriginal: t.valorOriginal,
        dataEmissao: t.dataEmissao,
      });
    }
  }

  const universoAddressavel = titulos.length - naoAplicavel;

  return NextResponse.json({
    totalTitulos: titulos.length,
    naoAplicavel_semOCPorNatureza: naoAplicavel,
    universoAddressavel,
    totalOCsComUsuNumTit: ocs.filter((o) => o.usuNumTit).length,
    real,
    aproximado,
    semNenhumAddressavel,
    semNenhumPorTipo,
    semNenhumAmostraNaoPRV,
    pctRealDoUniversoAddressavel: ((real / universoAddressavel) * 100).toFixed(1),
    pctComAlgumVinculoDoAddressavel: (((real + aproximado) / universoAddressavel) * 100).toFixed(1),
    semNenhumAmostra,
  });
}
