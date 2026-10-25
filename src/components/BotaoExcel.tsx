"use client";

// Botao "Exportar Excel" reutilizavel: recebe uma funcao que monta as abas (pode ser assincrona, por exemplo buscando o detalhe na API)
// e baixa um .xlsx. Mesmo visual dos botoes de exportacao que ja existem, para nao destoar.
import { useState } from "react";
import { baixarExcel, type AbaExcel } from "@/lib/exportarExcel";

export default function BotaoExcel({
  arquivo, gerar, rotulo = "Exportar Excel", className, desabilitado,
}: { arquivo: string; gerar: () => AbaExcel[] | Promise<AbaExcel[]>; rotulo?: string; className?: string; desabilitado?: boolean }) {
  const [gerando, setGerando] = useState(false);
  async function exportar() {
    setGerando(true);
    try {
      const abas = await gerar();
      if (!abas.length || abas.every((a) => a.linhas.length === 0)) {
        alert("Não há dados para exportar com os filtros atuais.");
        return;
      }
      baixarExcel(arquivo, abas);
    } catch (e: any) {
      alert(e?.message || "Não foi possível gerar o arquivo Excel.");
    } finally {
      setGerando(false);
    }
  }
  return (
    <button
      type="button"
      onClick={exportar}
      disabled={gerando || desabilitado}
      title="Baixa uma planilha Excel (.xlsx) com o que está na tela"
      className={className ?? "inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-[13px] font-medium text-emerald-800 transition hover:bg-emerald-100 disabled:opacity-50"}
    >
      <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="M4 3h8l4 4v10H4z" /><path d="M12 3v4h4" /><path d="M7 10l4 5M11 10l-4 5" /></svg>
      {gerando ? "Gerando…" : rotulo}
    </button>
  );
}
