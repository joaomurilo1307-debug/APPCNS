import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// Botão "Atualizar agora" da Programação de Pagamento -- pedido do João
// 16/09/2026: "a programação de compra não está atualizada, preciso que
// ela atualize a cada 10 min, e tenha botão de atualizar também igual as
// OC". Achado no caminho: sincronizar_titulos_pagar.py existia no VPS mas
// nunca tinha sido colocado num cron nem workflow n8n -- rodava só sob
// demanda manual (a própria docstring do script já previa isso: "se o João
// quiser isso sempre atualizado, dá pra colocar num workflow n8n próprio,
// tipo o de Aprovações OC"). Criado o workflow "Sergio - Titulos a Pagar
// (Sync)" espelhando exatamente o de Aprovações OC: schedule (10 em 10 min)
// + webhook (headerAuth) rodando a MESMA ação (SSH no VPS chamando
// sincronizar_titulos_pagar.py) -- esta rota dispara esse webhook.
export async function POST() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const user = session.user as any;

  let podeVer = ["ADMIN", "DIRETOR", "GESTOR_PROJETO", "APROVADOR"].includes(user.role);
  if (!podeVer) {
    const perfil = await prisma.user.findUnique({ where: { id: user.id }, select: { nivelHierarquico: true } });
    podeVer = !!perfil?.nivelHierarquico && ["DIRETORIA", "GERENCIA", "COORDENACAO"].includes(perfil.nivelHierarquico);
  }
  if (!podeVer) {
    return NextResponse.json({ error: "Sem permissão para sincronizar a programação de pagamento" }, { status: 403 });
  }

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
    return NextResponse.json({ ok: true, mensagem: "Sincronização disparada. O sync completo (~2 mil títulos) leva alguns minutos pra refletir aqui." });
  } catch (e: any) {
    return NextResponse.json({ error: `Não foi possível contatar o serviço de sincronização: ${e?.message || e}` }, { status: 502 });
  }
}
