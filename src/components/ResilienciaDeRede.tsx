"use client";

import { useEffect } from "react";

// Quando o sistema reinicia (atualização, ~20 segundos) o servidor da frente responde
// "Bad Gateway" em HTML. As telas liam isso com .json() e mostravam "Unexpected token 'B',
// "Bad Gateway" is not valid JSON" e listas vazias, como se os dados tivessem sumido
// (06/10/2026). Aqui, em TODAS as telas:
//   - consulta (GET) que cair nesse erro é repetida sozinha, de 4 em 4 segundos (até ~20 s);
//   - se continuar fora do ar, a resposta vira um JSON com mensagem clara (mesmo status),
//     em vez do HTML -- as telas que já mostram `data.error` passam a explicar o que houve.
// Só mexe em /api/ e só em erro 502/503/504 que NÃO seja JSON (erro de gateway, não do app).
// Gravações (POST/PATCH/DELETE) nunca são repetidas: não dá pra saber se a primeira executou.

const GATEWAY = [502, 503, 504];
// Consultas em segundo plano (chat, presença, agenda): não vale insistir, a próxima rodada tenta de novo.
const SEM_REPETICAO = /^\/api\/(?:messages|presence|events|auth)\b/;
const TENTATIVAS = 6;
const ESPERA_MS = 4000;

const MENSAGEM =
  "O sistema está sendo atualizado ou ficou fora do ar por instantes. Aguarde cerca de 30 segundos e tente de novo — nada foi perdido.";

function caminhoDe(entrada: RequestInfo | URL): string | null {
  try {
    const texto = typeof entrada === "string" ? entrada : entrada instanceof URL ? entrada.href : entrada.url;
    const url = new URL(texto, window.location.origin);
    return url.origin === window.location.origin ? url.pathname : null;
  } catch {
    return null;
  }
}

const esperar = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export default function ResilienciaDeRede() {
  useEffect(() => {
    const w = window as unknown as { __fetchResiliente?: boolean };
    if (w.__fetchResiliente) return;
    w.__fetchResiliente = true;

    const original = window.fetch.bind(window);
    window.fetch = async (entrada: RequestInfo | URL, init?: RequestInit) => {
      const caminho = caminhoDe(entrada);
      if (!caminho || !caminho.startsWith("/api/")) return original(entrada, init);

      const metodo = (init?.method ?? (entrada instanceof Request ? entrada.method : "GET")).toUpperCase();
      const maximo = metodo === "GET" && !SEM_REPETICAO.test(caminho) ? TENTATIVAS : 1;

      let ultimaResposta: Response | null = null;
      for (let tentativa = 1; tentativa <= maximo; tentativa++) {
        try {
          const res = await original(entrada, init);
          const ehJson = /json/i.test(res.headers.get("content-type") ?? "");
          if (!GATEWAY.includes(res.status) || ehJson) return res;
          ultimaResposta = res;
        } catch (e: any) {
          // Cancelada de propósito, ou última tentativa: devolve o erro como sempre foi.
          if (e?.name === "AbortError" || tentativa === maximo) throw e;
        }
        if (tentativa < maximo) await esperar(ESPERA_MS);
      }
      // Consulta que continuou fora do ar: devolve a resposta original (tela que espera lista não
      // recebe um objeto de erro no lugar dela). Gravação: mensagem clara em JSON, que as telas
      // já mostram via `data.error` (e nunca repetimos gravação).
      if (metodo === "GET" && ultimaResposta) return ultimaResposta;
      return new Response(JSON.stringify({ error: MENSAGEM }), {
        status: ultimaResposta?.status ?? 503,
        headers: { "Content-Type": "application/json" },
      });
    };
  }, []);

  return null;
}
