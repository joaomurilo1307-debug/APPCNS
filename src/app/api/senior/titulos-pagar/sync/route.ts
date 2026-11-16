import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { itemTituloSchema, processarTitulos } from "@/lib/senior/sincronizacao/titulos";
import { comTravaDeGravacao, registrarRecebimentoExterno } from "@/lib/senior/sincronizacao/execucao";

// Entrada do retrato de titulos a pagar (E501TCP) enviado de FORA do sistema -- o script sincronizar_titulos_pagar.py do VPS,
// disparado pelo n8n -- autenticada pela SENIOR_SYNC_KEY. Desde 12/11/2026 o proprio sistema busca os titulos na Senior
// (src/lib/senior/sincronizacao/), com a MESMA gravacao usada aqui (processarTitulos: upsert pela chave real
// numTit+codFil+codFor+tipo+dataEmissao e limpeza do que sumiu). Esta rota fica para o envio externo ate o n8n ser desligado.
//
// ?modo=incremental: o payload NAO e' o universo completo (ex.: so' os abertos, de scripts/senior-sync-pagamentos.ts) --
// nada e' removido e titulo existente so' recebe situacao/vencimento/valor/pagamento.

const bodySchema = z.object({ itens: z.array(itemTituloSchema) });

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

  const incremental = new URL(req.url).searchParams.get("modo") === "incremental";
  const r = await comTravaDeGravacao("titulos", () => processarTitulos(parsed.data.itens, { incremental }));
  if (!incremental) await registrarRecebimentoExterno("titulos", r.processados);
  return NextResponse.json({ ok: true, processados: r.processados, totalRecebido: r.totalRecebido, removidos: r.removidos });
}

export async function GET(req: Request) {
  const chave = req.headers.get("x-sync-key");
  if (!chave || chave !== process.env.SENIOR_SYNC_KEY) {
    return NextResponse.json({ error: "Nao autorizado" }, { status: 401 });
  }
  const total = await prisma.tituloContasAPagar.count();
  return NextResponse.json({ total });
}
