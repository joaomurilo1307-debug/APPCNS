"use client";

// Faz uma aba de custo ACOMPANHAR o Senior enquanto estiver aberta: relê o que o sistema ja tem a cada 3 minutos (e quando a aba do navegador volta a ficar
// visivel) e, quando as baixas lidas do Senior passam de 20 minutos, pede a mesma atualizacao do botao "Atualizar" do alto da tela (roda em segundo plano, uma por
// vez no servidor) e recarrega quando ela termina. Nao faz nada enquanto a aba esta fechada.

import { useCallback, useEffect, useRef, useState } from "react";

const BAIXAS_VELHAS_MS = 20 * 60_000;

export function useSeguirSenior(ativo: boolean, recarregar: () => Promise<void> | void, custoEm: () => string | null | undefined) {
  const [atualizando, setAtualizando] = useState(false);
  const emCurso = useRef(false);
  const recarregarRef = useRef(recarregar);
  const custoRef = useRef(custoEm);
  useEffect(() => { recarregarRef.current = recarregar; custoRef.current = custoEm; });

  const pedirAtualizacao = useCallback(async () => {
    if (emCurso.current) return;
    try {
      const r = await fetch("/api/custos-conta/atualizar", { method: "POST" });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !(j.iniciada || j.estado?.emCurso)) { if (r.ok) await recarregarRef.current(); return; }
      emCurso.current = true;
      setAtualizando(true);
      for (let i = 0; i < 150; i++) { // ate ~10 min, olhando de 4 em 4 s
        await new Promise((res) => setTimeout(res, 4000));
        const e = await fetch("/api/custos-conta/atualizar", { cache: "no-store" }).then((x) => (x.ok ? x.json() : null)).catch(() => null);
        if (e && !e.emCurso) break;
      }
    } catch {
      /* sem permissao ou sem rede: a aba continua com o que ja tem */
    } finally {
      emCurso.current = false;
      setAtualizando(false);
      await recarregarRef.current();
    }
  }, []);

  useEffect(() => {
    if (!ativo) return;
    const ciclo = async () => {
      if (document.visibilityState !== "visible") return;
      await recarregarRef.current();
      const c = custoRef.current();
      if (!c || Date.now() - new Date(c).getTime() > BAIXAS_VELHAS_MS) void pedirAtualizacao();
    };
    const t = setInterval(() => void ciclo(), 180_000);
    const v = () => void ciclo();
    document.addEventListener("visibilitychange", v);
    return () => { clearInterval(t); document.removeEventListener("visibilitychange", v); };
  }, [ativo, pedirAtualizacao]);

  return { atualizando, pedirAtualizacao };
}
