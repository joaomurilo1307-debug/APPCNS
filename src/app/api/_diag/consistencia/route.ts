import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// Rota de diagnostico TEMPORARIA -- auditoria sistemica pedida pelo Joao
// 15/09/2026 ("nao podemos ter contradicoes, nao e corrigir pontual"), a
// partir de um bug real (titulo 239A1 mostrava "Sem OC" numa tela e "OC
// 11743" noutra) causado por essa tela rodar o motor de vinculo com
// campos zerados em vez do titulo real. Antes de declarar "resolvido",
// checa se existe o MESMO tipo de risco em qualquer titulo da base, nao
// so nos 2 exemplos que o Joao encontrou por acaso.
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const user = session.user as any;
  if (user.role !== "ADMIN") return NextResponse.json({ error: "Só admin" }, { status: 403 });

  const [detalhes, titulos] = await Promise.all([
    prisma.custoFinanceiroDetalhe.findMany({ select: { numTit: true, codFor: true, codccu: true, contaFinanceira: true, competencia: true, valorRateado: true } }),
    prisma.tituloContasAPagar.findMany({ select: { numTit: true, codFor: true, tipo: true, dataEmissao: true, valorOriginal: true, numOcp: true, numNfc: true } }),
  ]);

  const chavesDetalhe = new Set(detalhes.map((d) => `${d.numTit}|${d.codFor}`));
  const porChaveTitulo = new Map<string, typeof titulos>();
  for (const t of titulos) {
    const chave = `${t.numTit}|${t.codFor}`;
    const lista = porChaveTitulo.get(chave) ?? [];
    lista.push(t);
    porChaveTitulo.set(chave, lista);
  }

  const semTituloReal: { numTit: string; codFor: string; codccu: string; contaFinanceira: string; competencia: string; valorRateado: number }[] = [];
  const comDuplicidade: { numTit: string; codFor: string; qtd: number; tipos: string[]; valores: number[] }[] = [];

  for (const chave of chavesDetalhe) {
    const candidatos = porChaveTitulo.get(chave);
    if (!candidatos || candidatos.length === 0) {
      const [numTit, codFor] = chave.split("|");
      const linhas = detalhes.filter((d) => d.numTit === numTit && d.codFor === codFor);
      for (const l of linhas) {
        semTituloReal.push({ numTit, codFor, codccu: l.codccu, contaFinanceira: l.contaFinanceira, competencia: l.competencia.toISOString(), valorRateado: l.valorRateado });
      }
    } else if (candidatos.length > 1) {
      const [numTit, codFor] = chave.split("|");
      comDuplicidade.push({
        numTit,
        codFor,
        qtd: candidatos.length,
        tipos: candidatos.map((c) => c.tipo),
        valores: candidatos.map((c) => c.valorOriginal),
      });
    }
  }

  return NextResponse.json({
    totalLinhasDetalhe: detalhes.length,
    totalChavesUnicasDetalhe: chavesDetalhe.size,
    totalTitulosContasAPagar: titulos.length,
    semTituloReal: { qtd: semTituloReal.length, amostra: semTituloReal.slice(0, 30) },
    comDuplicidade: { qtd: comDuplicidade.length, amostra: comDuplicidade.slice(0, 30) },
  });
}
