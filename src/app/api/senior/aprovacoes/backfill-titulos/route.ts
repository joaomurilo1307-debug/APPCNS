import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

// Backfill ÚNICO (14/09/2026) de USU_NUMTIT/USU_NUMNFC em TODAS as OCs do
// Senior -- não é o sync recorrente (esse continua em /aprovacoes/sync,
// janela de 42 dias + rastreadas). Esta rota é deliberadamente "burra" e
// segura: pra OC que JÁ existe na base, só grava usuNumTit/usuNumNfc, nada
// mais -- nunca toca em rateioDetalhe/niveisExigidos/historicoNiveis/etc
// (que só o sync completo, com E420RAT/E614APR/E068CNA, sabe montar
// direito; sobrescrever com null aqui apagaria dado real já sincronizado).
// Pra OC que NÃO existe ainda (histórico antigo, nunca esteve pendente nem
// nos últimos 30 dias resolvida), cria um registro mínimo -- o suficiente
// pro link com o título e pro modal mostrar o essencial, sem rateio/alçada.
const itemSchema = z.object({
  numOcp: z.string(),
  dataEmissao: z.string(),
  fornecedorCodigo: z.string(),
  fornecedorNome: z.string().optional().nullable(),
  valor: z.number(),
  descricao: z.string().optional().nullable(),
  numApr: z.string(),
  situacaoAtual: z.string(),
  usuNumTit: z.string().optional().nullable(),
  usuNumNfc: z.string().optional().nullable(),
});
const bodySchema = z.object({ itens: z.array(itemSchema) });

const SITUACOES_RESOLVIDAS = new Set(["APR", "REP", "CAN"]);

export async function POST(req: Request) {
  const chave = req.headers.get("x-sync-key");
  if (!chave || chave !== process.env.SENIOR_SYNC_KEY) {
    return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });
  }
  const body = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Payload invalido", detalhes: parsed.error.flatten() }, { status: 422 });
  }

  let atualizadas = 0;
  let criadas = 0;
  let semUsuNumTit = 0;

  for (const item of parsed.data.itens) {
    if (!item.usuNumTit && !item.usuNumNfc) {
      semUsuNumTit++;
      continue; // nada pra gravar nesta OC
    }
    const existente = await prisma.aprovacaoSenior.findUnique({ where: { numOcp: item.numOcp }, select: { id: true } });
    if (existente) {
      await prisma.aprovacaoSenior.update({
        where: { id: existente.id },
        data: { usuNumTit: item.usuNumTit || null, usuNumNfc: item.usuNumNfc || null },
      });
      atualizadas++;
    } else {
      await prisma.aprovacaoSenior.create({
        data: {
          numOcp: item.numOcp,
          dataEmissao: new Date(item.dataEmissao),
          fornecedorCodigo: item.fornecedorCodigo,
          fornecedorNome: item.fornecedorNome || null,
          valor: item.valor,
          descricao: item.descricao || null,
          numApr: item.numApr,
          situacaoAtual: item.situacaoAtual,
          usuNumTit: item.usuNumTit || null,
          usuNumNfc: item.usuNumNfc || null,
          pago: false,
          // Bug real achado 14/09/2026: aqui gravava resolvidoEm=new Date()
          // (HOJE) pra OC que na verdade foi resolvida no Senior meses/anos
          // atras -- isso inflou "resolvidas recentemente" (janela de 30
          // dias) com ~8.700 OCs fantasma, e a lista virou grande demais pro
          // IN(...) do script de sync (ORA-01795, limite de 1000 no
          // Oracle). Nao sabemos a data real de resolucao de uma OC
          // historica via este backfill (so' veio SITAPR/dados leves) --
          // gravar resolvidoComo (dado real) sem resolvidoEm (que nao
          // sabemos) e mais honesto que inventar "resolvida hoje".
          ...(SITUACOES_RESOLVIDAS.has(item.situacaoAtual) ? { resolvidoComo: item.situacaoAtual } : {}),
        },
      });
      criadas++;
    }
  }

  return NextResponse.json({ ok: true, atualizadas, criadas, semUsuNumTit, totalRecebido: parsed.data.itens.length });
}
