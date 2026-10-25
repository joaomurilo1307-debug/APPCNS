"use client";

// Telas abertas por muito tempo ficam desatualizadas (outra pessoa mexeu numa tarefa, no projeto...). Este gancho chama a funcao de
// carregar os dados quando a pessoa VOLTA para a aba do navegador (ou clica de novo na janela), no maximo uma vez a cada `minimoMs`.
// So' recarrega dados: nao recarrega a pagina, nao fecha janela aberta nem apaga o que a pessoa esta digitando.
import { useEffect, useRef } from "react";

/** Regra pura: so' atualiza se a aba esta visivel e ja passou o tempo minimo desde a ultima atualizacao. */
export function devoAtualizar(agoraMs: number, ultimoMs: number, minimoMs: number, visivel: boolean): boolean {
  return visivel && agoraMs - ultimoMs >= minimoMs;
}

export function useAtualizarAoVoltar(atualizar: () => unknown, minimoMs = 20000) {
  const ref = useRef(atualizar);
  ref.current = atualizar;
  useEffect(() => {
    let ultimo = Date.now();
    const aoVoltar = () => {
      if (!devoAtualizar(Date.now(), ultimo, minimoMs, document.visibilityState === "visible")) return;
      ultimo = Date.now();
      try { void Promise.resolve(ref.current()).catch(() => {}); } catch { /* a tela segue com o que ja tinha */ }
    };
    document.addEventListener("visibilitychange", aoVoltar);
    window.addEventListener("focus", aoVoltar);
    return () => {
      document.removeEventListener("visibilitychange", aoVoltar);
      window.removeEventListener("focus", aoVoltar);
    };
  }, [minimoMs]);
}
