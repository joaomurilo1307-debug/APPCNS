"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import MedicaoDetalhe from "@/components/medicao/MedicaoDetalhe";
import type { VinculoMedicaoContrato } from "@/lib/medicao/vinculoContrato";

export type EstadoMedicaoContrato =
  | { codccu: string; estado: "carregando" }
  | { codccu: string; estado: "erro" | "negado"; mensagem: string }
  | { codccu: string; estado: "ok"; dados: VinculoMedicaoContrato };

// Um lookup por ficha, compartilhado pelas curvas e pela aba de detalhe. Sem polling.
export function useMedicaoDoContrato(codccu: string): EstadoMedicaoContrato {
  const [estado, setEstado] = useState<EstadoMedicaoContrato>({ codccu, estado: "carregando" });
  useEffect(() => {
    const controller = new AbortController();
    setEstado({ codccu, estado: "carregando" });
    fetch(`/api/contratos/${encodeURIComponent(codccu)}/medicao`, { cache: "no-store", signal: controller.signal })
      .then(async (r) => {
        const j = await r.json().catch(() => ({}));
        if (controller.signal.aborted) return;
        if (!r.ok) {
          setEstado({ codccu, estado: r.status === 403 ? "negado" : "erro", mensagem: typeof j.error === "string" ? j.error : "Não foi possível carregar a medição deste contrato." });
          return;
        }
        setEstado({ codccu, estado: "ok", dados: j });
      })
      .catch(() => { if (!controller.signal.aborted) setEstado({ codccu, estado: "erro", mensagem: "Não foi possível carregar a medição deste contrato. Tente novamente ao reabrir a ficha." }); });
    return () => controller.abort();
  }, [codccu]);
  return estado.codccu === codccu ? estado : { codccu, estado: "carregando" };
}

function EstadoDoVinculo({ estado }: { estado: EstadoMedicaoContrato }) {
  if (estado.estado === "carregando") return <div className="h-32 animate-pulse rounded-xl bg-gray-100" aria-label="Carregando medição do contrato" aria-busy />;
  if (estado.estado !== "ok") return <p className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-5 text-sm text-gray-600" role={estado.estado === "erro" ? "alert" : undefined}>{estado.mensagem}</p>;
  return <p className="rounded-xl border border-dashed border-gray-200 px-4 py-6 text-sm text-gray-500">Ainda não há contrato de medição do Senior vinculado a este centro de custo.</p>;
}

export function AbaMedicaoDoContrato({ estado, periodo, onPeriodo }: { estado: EstadoMedicaoContrato; periodo?: { de: string; ate: string }; onPeriodo?: (de: string, ate: string) => void }) {
  const [selecionado, setSelecionado] = useState<string | null>(null);
  const dados = estado.estado === "ok" ? estado.dados : null;
  if (!dados || !dados.contratos.length) return <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-soft"><EstadoDoVinculo estado={estado} /></div>;
  const ativo = dados.contratos.find((c) => c.numCtr === selecionado) ?? dados.contratos[0];
  return <div className="space-y-5">
    <section className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-gray-100 bg-white p-4 shadow-soft">
      <div className="space-y-1"><h2 className="text-base font-semibold text-gray-900">Receita e Medição</h2><p className="text-xs text-gray-500">{dados.contratos.length > 1 ? "A medição por linha é de cada número Senior. A receita reúne os números deste CCU uma única vez." : "Medição por linha, receita, notas e recebimentos deste contrato."}</p></div>
      <div className="flex flex-wrap items-center gap-3">
        {dados.contratos.length > 1 && <label className="text-[13px] text-gray-600">Contrato Senior <select value={ativo.numCtr} onChange={(e) => setSelecionado(e.target.value)} className="ml-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm" aria-label="Contrato de medição do Senior">{dados.contratos.map((c) => <option key={c.numCtr} value={c.numCtr}>{c.numOfi} · nº {c.numCtr}</option>)}</select></label>}
        <Link href={`/medicao/${encodeURIComponent(ativo.numCtr)}`} className="text-[13px] font-medium text-brand hover:text-brand-dark">Abrir na tela de medição ↗</Link>
      </div>
    </section>
    <MedicaoDetalhe key={`${dados.codccu}:${ativo.numCtr}`} numCtr={ativo.numCtr} embutido periodoControlado={periodo} onPeriodoMudar={onPeriodo} />
  </div>;
}
