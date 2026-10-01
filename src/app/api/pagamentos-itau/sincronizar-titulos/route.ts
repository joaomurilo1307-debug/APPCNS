import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

// Botão "Atualizar do Senior agora" do /pagamentos-itau.
//
// ACHADO 30/09/2026: esta rota ANTES consultava a Senior por dentro do
// próprio request HTTP (títulos + fornecedor inteiro + cadastro bancário).
// Resultado ao vivo: estourava o timeout do proxy da Hostinger (502) ou
// derrubava a conexão da Senior quando as consultas rodavam em paralelo
// ("fetch failed") -- em qualquer um dos dois casos, NENHUM dado bancário
// chegava (achado: Edilson Fernandes Batista e outros 2415 títulos, 100%
// sem CPF/CNPJ/conta). Reduzida agora a só disparar o MESMO webhook n8n que
// já roda sincronizar_titulos_pagar.py no VPS (SSH, sem proxy no meio) --
// esse script já traz banco/agência/conta/DAC/PIX/CPF-CNPJ/código de
// barras desde a mesma correção. Mesmo padrão fire-and-forget dos botões de
// Aprovações OC e da Programação de Pagamento: o webhook responde na hora,
// a sincronização roda em segundo plano no VPS.
const ROLES_ESCRITA = ["ADMIN", "DIRETOR"];

export async function POST() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const user = session.user as any;
  if (!ROLES_ESCRITA.includes(user.role)) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

  const url = process.env.TITULOS_SYNC_WEBHOOK_URL;
  const secret = process.env.TITULOS_SYNC_WEBHOOK_SECRET;
  if (!url || !secret) {
    return NextResponse.json({ error: "Sincronização manual não configurada (variáveis de ambiente ausentes)" }, { status: 500 });
  }

  try {
    const resp = await fetch(url, {
      method: "POST",
      headers: { "x-sync-secret": secret, "Content-Type": "application/json" },
      body: "{}",
      signal: AbortSignal.timeout(10000),
    });
    if (!resp.ok) {
      const corpo = await resp.text().catch(() => "");
      return NextResponse.json({ error: `Falha ao disparar sincronização (HTTP ${resp.status})`, detalhe: corpo.slice(0, 300) }, { status: 502 });
    }
    return NextResponse.json({
      ok: true,
      mensagem: "Sincronização disparada (títulos + dados bancários). Leva 2-3 minutos pra refletir aqui -- a lista atualiza sozinha.",
    });
  } catch (e: any) {
    return NextResponse.json({ error: `Não foi possível contatar o serviço de sincronização: ${e?.message || e}` }, { status: 502 });
  }
}
