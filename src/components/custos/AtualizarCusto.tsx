"use client";

// Botao "Atualizar" + estado da leitura do Senior (barra de progresso, "atualizado em", erro). A leitura roda em segundo
// plano no servidor (POST dispara e responde na hora; este componente acompanha pelo GET e avisa a tela quando termina).
// Tambem dispara sozinho UMA vez ao abrir a tela quando os dados estao velhos (mais de 45 min) -- assim quem abre de
// manha ja ve o numero se atualizando, sem precisar lembrar do botao.

import { useCallback, useEffect, useRef, useState } from "react";
import { dataHoraCurta, haQuantoTempo } from "@/lib/custos/formato";

export type ExecucaoUI = {
  id: string;
  status: string;
  etapa: string | null;
  progresso: number;
  iniciadoEm: string;
  finalizadoEm: string | null;
  disparadoPor: string | null;
  erro: string | null;
  resumo: any;
};
export type EstadoAtualizacaoUI = { emCurso: ExecucaoUI | null; ultimaOk: ExecucaoUI | null; ultimoErro: ExecucaoUI | null; dadosVelhos: boolean };

const INTERVALO_CONSULTA_MS = 3000;
const SEM_AUTO_APOS_ERRO_MS = 10 * 60_000;

export default function AtualizarCusto({ estadoInicial, onConcluida }: { estadoInicial: EstadoAtualizacaoUI; onConcluida: () => void }) {
  const [estado, setEstado] = useState<EstadoAtualizacaoUI>(estadoInicial);
  const [disparando, setDisparando] = useState(false);
  const [aviso, setAviso] = useState<{ tipo: "ok" | "info" | "erro"; texto: string } | null>(null);
  const [, relogio] = useState(0);
  const autoFeito = useRef(false);
  const idAcompanhado = useRef<string | null>(estadoInicial.emCurso?.id ?? null);

  useEffect(() => setEstado(estadoInicial), [estadoInicial]);
  useEffect(() => {
    const t = setInterval(() => relogio((n) => n + 1), 30_000); // mantem o "há X min" fresco
    return () => clearInterval(t);
  }, []);

  const disparar = useCallback(async (automatico: boolean) => {
    setDisparando(true);
    setAviso(automatico ? { tipo: "info", texto: "Os dados estavam velhos — atualizando agora do Senior." } : null);
    try {
      const res = await fetch("/api/custos-conta/atualizar", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Não foi possível iniciar a atualização.");
      if (data.estado) setEstado(data.estado);
      if (data.estado?.emCurso) idAcompanhado.current = data.estado.emCurso.id;
      if (!data.iniciada && !data.estado?.emCurso) setAviso({ tipo: "info", texto: data.motivo || "Nada a atualizar agora." });
    } catch (e: any) {
      setAviso({ tipo: "erro", texto: e?.message || "Falha ao iniciar a atualização." });
    } finally {
      setDisparando(false);
    }
  }, []);

  // disparo automatico (uma vez) quando abre e esta velho
  useEffect(() => {
    if (autoFeito.current) return;
    autoFeito.current = true;
    const erroRecente = estadoInicial.ultimoErro?.finalizadoEm && Date.now() - new Date(estadoInicial.ultimoErro.finalizadoEm).getTime() < SEM_AUTO_APOS_ERRO_MS;
    if (estadoInicial.dadosVelhos && !estadoInicial.emCurso && !erroRecente) void disparar(true);
  }, [estadoInicial, disparar]);

  // acompanha enquanto roda
  const rodando = !!estado.emCurso;
  useEffect(() => {
    if (!rodando) return;
    const t = setInterval(async () => {
      try {
        const res = await fetch("/api/custos-conta/atualizar", { cache: "no-store" });
        if (!res.ok) return;
        const novo: EstadoAtualizacaoUI = await res.json();
        setEstado(novo);
        if (!novo.emCurso && idAcompanhado.current) {
          idAcompanhado.current = null;
          if (novo.ultimoErro && (!novo.ultimaOk || novo.ultimoErro.finalizadoEm! > (novo.ultimaOk.finalizadoEm ?? ""))) {
            setAviso({ tipo: "erro", texto: "A atualização não terminou: " + (novo.ultimoErro.erro || "erro desconhecido") });
          } else {
            setAviso({ tipo: "ok", texto: "Custos atualizados com os dados mais recentes do Senior." });
            onConcluida();
          }
        }
      } catch {
        /* rede oscilou: tenta de novo no proximo ciclo */
      }
    }, INTERVALO_CONSULTA_MS);
    return () => clearInterval(t);
  }, [rodando, onConcluida]);

  useEffect(() => {
    if (aviso?.tipo !== "ok") return;
    const t = setTimeout(() => setAviso(null), 8000);
    return () => clearTimeout(t);
  }, [aviso]);

  const ok = estado.ultimaOk;
  const resumo = ok?.resumo as { titulos?: number; ccusComCusto?: number; duracaoSegundos?: number } | null;
  const comErro = !rodando && !!estado.ultimoErro;
  const corPonto = rodando ? "bg-sky-500" : comErro ? "bg-red-500" : estado.dadosVelhos ? "bg-amber-500" : "bg-emerald-500";

  return (
    <div className="flex flex-wrap items-center justify-end gap-x-4 gap-y-2">
      <div className="min-w-0 text-right" aria-live="polite">
        {rodando ? (
          <div className="flex flex-col items-end gap-1">
            <p className="text-xs font-medium text-gray-700">
              <span className="mr-1.5 inline-block h-2 w-2 animate-pulse rounded-full bg-sky-500 align-middle" />
              Lendo do Senior… <span className="tabular-nums">{estado.emCurso!.progresso}%</span>
            </p>
            <div className="h-1.5 w-52 overflow-hidden rounded-full bg-gray-200">
              <div className="h-full rounded-full bg-brand transition-all duration-700" style={{ width: `${Math.max(3, estado.emCurso!.progresso)}%` }} />
            </div>
            <p className="max-w-[18rem] truncate text-[11px] text-gray-400" title={estado.emCurso!.etapa ?? ""}>
              {estado.emCurso!.etapa}
            </p>
          </div>
        ) : (
          <>
            <p className="text-xs text-gray-600" title={resumo ? `Leitura direta do Senior: ${resumo.titulos ?? "?"} lançamentos pagos · ${resumo.ccusComCusto ?? "?"} centros de custo · ${resumo.duracaoSegundos ?? "?"} s` : undefined}>
              <span className={`mr-1.5 inline-block h-2 w-2 rounded-full align-middle ${corPonto}`} />
              {ok ? (
                <>
                  Atualizado em <span className="font-medium text-gray-800">{dataHoraCurta(ok.finalizadoEm)}</span>
                </>
              ) : (
                "Ainda não atualizado pelo Senior"
              )}
            </p>
            <p className="text-[11px] text-gray-400">
              {ok ? haQuantoTempo(ok.finalizadoEm) : "clique em Atualizar"}
              {comErro && <span className="ml-1 font-medium text-red-600">· a última tentativa falhou</span>}
            </p>
          </>
        )}
      </div>

      <button
        type="button"
        onClick={() => void disparar(false)}
        disabled={rodando || disparando}
        className="inline-flex items-center gap-2 rounded-lg bg-brand px-3.5 py-2 text-sm font-medium text-white shadow-soft transition hover:bg-brand-dark disabled:cursor-not-allowed disabled:opacity-60"
        title="Lê o custo direto do Senior agora (leva alguns minutos; a tela atualiza sozinha)"
      >
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={rodando || disparando ? "animate-spin" : ""} aria-hidden>
          <path d="M21 12a9 9 0 1 1-2.64-6.36" />
          <path d="M21 4v5h-5" />
        </svg>
        {rodando ? "Atualizando…" : "Atualizar"}
      </button>

      {aviso && (
        <p
          role="status"
          className={`basis-full text-right text-xs ${aviso.tipo === "erro" ? "font-medium text-red-600" : aviso.tipo === "ok" ? "font-medium text-emerald-700" : "text-gray-500"}`}
        >
          {aviso.texto}
        </p>
      )}
    </div>
  );
}
