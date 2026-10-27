"use client";

// Financeiro > P0: tela preparada. O P0 (orcamento base de cada contrato) so' sera cadastrado depois que todos os contratos tiverem o seu.
// Aqui ainda nao ha dados: lista os contratos que a pessoa acompanha e mostra que o P0 de cada um esta por cadastrar.

import Link from "next/link";
import FiltroContratos from "@/components/FiltroContratos";
import BotaoExcel from "@/components/BotaoExcel";
import { useEffect, useMemo, useState } from "react";
import { PartesDoP0 } from "@/components/contratos/AbasContrato";
import { mesCurto, moedaCompacta } from "@/lib/custos/formato";

type Contrato = { codccu: string; nome: string; tipo: string; status: string; cliente: string | null; numero: string | null };
type SituacaoP0 = { codccu: string; versao: number; rotulo: string; mesIni: string; mesFim: string; totalCusto: number };

export default function P0Page() {
  const [contratos, setContratos] = useState<Contrato[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [busca, setBusca] = useState("");
  const [p0s, setP0s] = useState<Map<string, SituacaoP0>>(new Map());

  useEffect(() => {
    fetch("/api/contratos", { cache: "no-store" }).then(async (r) => {
      const j = await r.json().catch(() => ({}));
      if (!r.ok) return setErro(j.error || "Não foi possível carregar os contratos.");
      setContratos((j.contratos as Contrato[]).filter((c) => c.tipo === "CONTRATO"));
    });
  }, []);

  useEffect(() => {
    fetch("/api/p0/situacao", { cache: "no-store" })
      .then(async (r) => {
        const j = await r.json().catch(() => ({}));
        if (r.ok) setP0s(new Map((j.p0s as SituacaoP0[]).map((x) => [x.codccu, x])));
      })
      .catch(() => {});
  }, []);
  const situacaoTexto = (c: Contrato) => {
    const x = p0s.get(c.codccu);
    return x ? `cadastrado (${mesCurto(x.mesIni)} a ${mesCurto(x.mesFim)})` : "não cadastrado";
  };

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return (contratos ?? []).filter((c) => !q || c.codccu.toLowerCase().includes(q) || c.nome.toLowerCase().includes(q) || (c.cliente ?? "").toLowerCase().includes(q));
  }, [contratos, busca]);

  return (
    <div className="mx-auto max-w-[1500px] space-y-5 p-6">
      <header>
        <h1 className="text-2xl font-semibold text-gray-900">P0 dos contratos</h1>
        <p className="mt-1 max-w-3xl text-[14px] text-gray-500">O P0 é o orçamento base de cada contrato: a receita (linhas das medições) e os custos (previsões lineares mês a mês), comparados com o realizado do Senior. Os contratos com P0 cadastrado aparecem abaixo; os demais entram à medida que cada contrato tiver o seu P0 definido.</p>
      </header>

      <section className="rounded-2xl border border-gray-100 bg-white p-5 shadow-soft">
        <header className="mb-3"><h2 className="text-base font-semibold text-gray-900">Como o P0 vai funcionar</h2></header>
        <PartesDoP0 />
      </section>

      <section className="rounded-2xl border border-gray-100 bg-white p-5 shadow-soft">
        <header className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <div><h2 className="text-base font-semibold text-gray-900">Situação do P0 por contrato</h2><p className="mt-0.5 text-[13px] text-gray-500">{p0s.size === 0 ? "Nenhum P0 foi cadastrado ainda." : `${p0s.size} ${p0s.size === 1 ? "contrato com P0 cadastrado" : "contratos com P0 cadastrado"}.`}</p></div>
          <div className="flex flex-wrap items-center gap-2"><input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar contrato, CCU ou cliente" className="w-72 rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-brand" /><FiltroContratos />
            <BotaoExcel
              arquivo="p0-dos-contratos"
              desabilitado={!contratos || filtrados.length === 0}
              gerar={() => [{
                nome: "Situação do P0",
                observacao: "O P0 (orçamento base) de cada contrato incluído nos resultados e se já está cadastrado",
                colunas: [{ titulo: "CCU", largura: 8 }, { titulo: "Contrato", largura: 44 }, { titulo: "Cliente", largura: 30 }, { titulo: "P0", largura: 16 }],
                linhas: filtrados.map((c) => [c.codccu, c.nome, c.cliente ?? "", situacaoTexto(c)]),
              }]}
            />
          </div>
        </header>
        {erro ? <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{erro}</div> : !contratos ? <p className="py-6 text-center text-sm text-gray-500">Carregando contratos…</p> : (
          <div className="overflow-x-auto rounded-xl border border-gray-100">
            <table className="w-full min-w-[700px] text-[13.5px]">
              <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500"><tr><th className="px-3 py-2">CCU</th><th className="px-3 py-2">Contrato</th><th className="px-3 py-2">Cliente</th><th className="px-3 py-2">P0</th><th className="px-3 py-2" /></tr></thead>
              <tbody>
                {filtrados.map((c) => (
                  <tr key={c.codccu} className="border-t border-gray-100">
                    <td className="whitespace-nowrap px-3 py-2 text-gray-500">{c.codccu}</td>
                    <td className="px-3 py-2 font-medium text-gray-800">{c.nome}</td>
                    <td className="px-3 py-2 text-gray-600">{c.cliente ?? <span className="text-gray-300">não informado</span>}</td>
                    <td className="px-3 py-2">
                      {p0s.get(c.codccu) ? (
                        <span className="inline-flex flex-wrap items-center gap-x-2"><span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-800">cadastrado</span><span className="text-xs text-gray-500">{mesCurto(p0s.get(c.codccu)!.mesIni)} a {mesCurto(p0s.get(c.codccu)!.mesFim)} · custo de contrato {moedaCompacta(p0s.get(c.codccu)!.totalCusto)}</span></span>
                      ) : (
                        <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-semibold text-gray-600">não cadastrado</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right"><Link href={`/contratos/${encodeURIComponent(c.codccu)}?aba=p0`} className="text-[13px] font-medium text-brand hover:text-brand-dark">abrir</Link></td>
                  </tr>
                ))}
                {filtrados.length === 0 && <tr><td colSpan={5} className="px-3 py-6 text-center text-gray-400">Nenhum contrato encontrado.</td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
