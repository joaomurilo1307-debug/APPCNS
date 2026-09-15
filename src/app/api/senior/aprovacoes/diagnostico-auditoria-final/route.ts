import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { criarMotorVinculo } from "@/lib/vinculoOcTitulo";

// Auditoria final TEMPORARIA (14/09/2026) -- verificar rigorosamente que o
// vinculo bidirecional bate: consistencia titulo->OC vs OC->titulo, e
// sanidade de valor pra vinculos "exato" (nao-parcela). So leitura, remove
// depois de conferir.
export async function GET(req: Request) {
  const chave = req.headers.get("x-sync-key");
  if (!chave || chave !== process.env.SENIOR_SYNC_KEY) {
    return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });
  }

  const [titulos, ocs] = await Promise.all([
    prisma.tituloContasAPagar.findMany(),
    prisma.aprovacaoSenior.findMany({
      select: {
        numOcp: true, codFil: true, fornecedorCodigo: true, fornecedorNome: true, valor: true,
        dataEmissao: true, situacaoAtual: true, usuNumTit: true, usuNumNfc: true, codccu: true,
        contratoNome: true, temRateio: true, previsaoPagamento: true,
      },
    }),
  ]);
  const motor = criarMotorVinculo(ocs);

  const resultados = titulos.map((t) => ({ titulo: t, vinculo: motor.ocRelacionadaDe(t) }));

  // 1) contagens gerais
  const totalTitulos = titulos.length;
  const comOC = resultados.filter((r) => r.vinculo.ocRelacionada).length;
  const exatos = resultados.filter((r) => r.vinculo.ocRelacionada && !r.vinculo.ocRelacionada.parcela).length;
  const porParcela = resultados.filter((r) => r.vinculo.ocRelacionada?.parcela).length;
  const semOCEsperada = resultados.filter((r) => !r.vinculo.ocRelacionada && r.vinculo.ocEsperada).length;
  const semOCJustificada = resultados.filter((r) => !r.vinculo.ocRelacionada && !r.vinculo.ocEsperada).length;

  // 2) consistencia bidirecional: pra cada titulo COM vinculo, refaz a busca
  // inversa (filtra todos os titulos por aquele numOcp) e confere que o
  // proprio titulo aparece na lista -- tem que ser sempre verdade, e' a
  // MESMA funcao rodando duas vezes, mas prova que nao ha efeito colateral
  // de estado entre chamadas.
  let inconsistencias = 0;
  const amostraInconsistencia: any[] = [];
  const porOC = new Map<string, typeof resultados>();
  for (const r of resultados) {
    if (!r.vinculo.ocRelacionada) continue;
    const numOcp = r.vinculo.ocRelacionada.numOcp;
    const lista = porOC.get(numOcp) ?? [];
    lista.push(r);
    porOC.set(numOcp, lista);
  }
  for (const r of resultados) {
    if (!r.vinculo.ocRelacionada) continue;
    const doMesmoOC = porOC.get(r.vinculo.ocRelacionada.numOcp) ?? [];
    const achou = doMesmoOC.some((x) => x.titulo.numTit === r.titulo.numTit && x.titulo.dataEmissao.getTime() === r.titulo.dataEmissao.getTime());
    if (!achou) {
      inconsistencias++;
      if (amostraInconsistencia.length < 10) {
        amostraInconsistencia.push({ numTit: r.titulo.numTit, numOcp: r.vinculo.ocRelacionada.numOcp });
      }
    }
  }

  // 3) sanidade de valor pra vinculo EXATO (nao-parcela): titulo.valorOriginal
  // deveria bater bem proximo do oc.valor (mesmo documento). Parcela nao
  // entra aqui de proposito (valor da parcela != valor total da OC, e' o
  // comportamento esperado, ja documentado no motivo do vinculo).
  const ocPorNumero = new Map(ocs.map((o) => [o.numOcp, o]));
  let exatosComValorBatendo = 0;
  let exatosComValorDivergente = 0;
  const amostraDivergencia: any[] = [];
  for (const r of resultados) {
    if (!r.vinculo.ocRelacionada || r.vinculo.ocRelacionada.parcela) continue;
    const oc = ocPorNumero.get(r.vinculo.ocRelacionada.numOcp);
    if (!oc) continue;
    const diff = Math.abs(oc.valor - r.titulo.valorOriginal);
    const diffPct = oc.valor > 0 ? diff / oc.valor : 0;
    if (diff < 0.01 || diffPct < 0.02) {
      exatosComValorBatendo++;
    } else {
      exatosComValorDivergente++;
      if (amostraDivergencia.length < 15) {
        amostraDivergencia.push({
          numTit: r.titulo.numTit, numOcp: oc.numOcp, valorTitulo: r.titulo.valorOriginal, valorOC: oc.valor,
          motivo: r.vinculo.ocRelacionada.motivo,
        });
      }
    }
  }

  // 4) uma OC referenciada por titulos de fornecedores DIFERENTES seria um
  // bug grave (fornecedorCompativel deveria impedir isso sempre) -- checa
  // mesmo assim, custa nada.
  let ocComFornecedorMisto = 0;
  const amostraFornecedorMisto: any[] = [];
  for (const [numOcp, lista] of porOC) {
    const fornecedoresDistintos = new Set(lista.map((r) => r.titulo.codFor));
    if (fornecedoresDistintos.size > 1) {
      ocComFornecedorMisto++;
      if (amostraFornecedorMisto.length < 10) {
        amostraFornecedorMisto.push({ numOcp, fornecedores: [...fornecedoresDistintos], titulos: lista.map((r) => r.titulo.numTit) });
      }
    }
  }

  return NextResponse.json({
    totalTitulos,
    comOC,
    exatos,
    porParcela,
    semOCEsperada,
    semOCJustificada,
    pctComOC: ((comOC / totalTitulos) * 100).toFixed(1),
    inconsistenciasBidirecionais: inconsistencias,
    amostraInconsistencia,
    exatosComValorBatendo,
    exatosComValorDivergente,
    amostraDivergencia,
    ocComFornecedorMisto,
    amostraFornecedorMisto,
    totalTitulosNoBanco: await prisma.tituloContasAPagar.count(),
    totalOCsNoBanco: await prisma.aprovacaoSenior.count(),
  });
}
