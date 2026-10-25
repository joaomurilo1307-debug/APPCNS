"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import MedicaoDetalhe from "@/components/medicao/MedicaoDetalhe";
import ReceitaContrato from "@/components/medicao/ReceitaContrato";
import { moedaCompacta, percentual } from "@/lib/custos/formato";
import { somaMes } from "@/lib/medicao/competencia";
import type { VinculoMedicaoContrato } from "@/lib/medicao/vinculoContrato";
import SeletorPeriodo, { atalhosDePeriodo } from "./SeletorPeriodo";

export type EstadoMedicaoContrato =
  | { codccu: string; estado: "carregando" }
  | { codccu: string; estado: "erro" | "negado"; mensagem: string }
  | { codccu: string; estado: "ok"; dados: VinculoMedicaoContrato };

// Um lookup por ficha, compartilhado pelo resumo e pela aba de detalhe. Sem polling.
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

export function ResumoMedicaoDoContrato({ estado, abrirDetalhe }: { estado: EstadoMedicaoContrato; abrirDetalhe: () => void }) {
  const [periodo, setPeriodo] = useState<{ de: string; ate: string } | null>(null);
  const dados = estado.estado === "ok" ? estado.dados : null;
  const contratos = dados?.contratos ?? [];
  const per = periodo ?? (dados ? { de: somaMes(dados.mesAtual, -11), ate: dados.mesAtual } : null);
  return (
    <section className="space-y-4 lg:col-span-2" aria-label="Receita e medição do contrato">
      <div className="space-y-4 rounded-2xl border border-gray-100 bg-white p-5 shadow-soft">
        <header className="flex flex-wrap items-center justify-between gap-2">
          <div><h2 className="text-base font-semibold text-gray-900">Receita e Medição</h2><p className="mt-0.5 text-[13px] text-gray-500">Valores do Senior ligados ao CCU desta ficha.</p></div>
          {contratos.length > 0 && <button type="button" onClick={abrirDetalhe} className="text-[13px] font-medium text-brand hover:text-brand-dark">Ver medição por linha →</button>}
        </header>
        {!dados || !contratos.length ? <EstadoDoVinculo estado={estado} /> : <>
          <div className="grid gap-3 sm:grid-cols-3">
            {[
              { titulo: "Contratado no Senior", valor: moedaCompacta(dados.totais.contratado), detalhe: `${contratos.length} contrato(s) de medição` },
              { titulo: "Medido acumulado", valor: moedaCompacta(dados.totais.medido), detalhe: `${percentual(dados.totais.pct, 1)} do contratado` },
              { titulo: "Saldo a medir", valor: moedaCompacta(dados.totais.saldo), detalhe: "contratado menos medido, desde o início" },
            ].map((k) => <div key={k.titulo} className="rounded-xl bg-gray-50 px-4 py-3"><p className="text-xs font-medium text-gray-500">{k.titulo}</p><p className="mt-1 text-lg font-semibold tabular-nums text-gray-900">{k.valor}</p><p className="text-xs text-gray-400">{k.detalhe}</p></div>)}
          </div>
          <p className="text-xs text-gray-500">Os indicadores acima consideram todo o histórico. O período abaixo vale para a receita mensal; o valor cadastral da ficha permanece separado.</p>
          {per && <SeletorPeriodo de={per.de} ate={per.ate} mesAtual={dados.mesAtual} modo="passado" atalhos={[...atalhosDePeriodo("passado", dados.mesAtual), { rotulo: "Últimos 12 meses", de: somaMes(dados.mesAtual, -11), ate: dados.mesAtual }]} onMudar={(de, ate) => {
            ate = ate > dados.mesAtual ? dados.mesAtual : ate;
            de = de > ate ? ate : de;
            if (somaMes(de, 47) < ate) de = somaMes(ate, -47);
            setPeriodo({ de, ate });
          }} />}
        </>}
      </div>
      {dados && contratos.length > 0 && per && <ReceitaContrato key={`${dados.codccu}:${per.de}:${per.ate}`} numCtr={contratos[0].numCtr} de={per.de} ate={per.ate} />}
    </section>
  );
}

export function AbaMedicaoDoContrato({ estado }: { estado: EstadoMedicaoContrato }) {
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
    <MedicaoDetalhe key={`${dados.codccu}:${ativo.numCtr}`} numCtr={ativo.numCtr} embutido />
  </div>;
}
