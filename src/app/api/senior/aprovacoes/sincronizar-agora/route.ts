import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { negarSemModulo } from "@/lib/acesso/servidor";

// Botão "Atualizar agora" das telas de OC -- pedido do João 15/09/2026:
// "coloque um sincronizado quando, e um botão de rodar a sincronia ou
// atualizar", junto com o aumento da frequência automática pra 10 em 10
// minutos. Dispara o MESMO workflow n8n que já roda no cron (webhook
// adicionado como segundo gatilho, mesma ação: SSH no VPS do Rito rodando
// sincronizar_aprovacoes_senior.py) -- não duplica lógica, só antecipa a
// próxima rodada quando alguém precisa ver um resultado fresco na hora
// (ex: OC aprovada minutos atrás na frente de um diretor).
//
// O webhook do n8n responde imediatamente ("onReceived") e a sincronização
// roda em segundo plano no VPS -- por isso esta rota não espera o
// resultado, só confirma que o disparo foi aceito. O front deve reconsultar
// a lista depois de alguns segundos pra ver o efeito.
export async function POST() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const user = session.user as any;

  const negado = await negarSemModulo(user, "aprovacoes_oc", "aprovacoes_oc_todas", "programacao_pagamento", "conferencia_oc");
  if (negado) return negado;

  const url = process.env.OC_SYNC_WEBHOOK_URL;
  const secret = process.env.OC_SYNC_WEBHOOK_SECRET;
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
    return NextResponse.json({ ok: true, mensagem: "Sincronização disparada. Deve levar cerca de 1 minuto pra refletir aqui." });
  } catch (e: any) {
    return NextResponse.json({ error: `Não foi possível contatar o serviço de sincronização: ${e?.message || e}` }, { status: 502 });
  }
}
