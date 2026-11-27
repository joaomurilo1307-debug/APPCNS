"use client";

// A Visao geral recebe apenas as curvas; ficha e projetos ficam em uma secao propria.
// Previsao le os titulos em aberto do Senior, somente leitura.

import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import P0CustosContrato from "@/components/p0/P0CustosContrato";
import P0PessoaisContrato from "@/components/p0/P0PessoaisContrato";
import P0ReceitaContrato from "@/components/p0/P0ReceitaContrato";
import CustoPessoalView from "@/components/custoPessoal/CustoPessoalView";
import ClientesDoContrato from "./ClientesDoContrato";
import ProjetosDoContrato from "./ProjetosDoContrato";
import PrevisaoMensal from "./PrevisaoMensal";
import { moeda } from "@/lib/custos/formato";
import type { FichaContrato } from "./FichaEditor";

const dataBr = (iso: string | null) => (iso ? iso.slice(0, 10).split("-").reverse().join("/") : null);

function Cartao({ titulo, sub, children }: { titulo: string; sub?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-gray-100 bg-white p-5 shadow-soft">
      <header className="mb-3"><h2 className="text-base font-semibold text-gray-900">{titulo}</h2>{sub && <p className="mt-0.5 text-[13px] text-gray-500">{sub}</p>}</header>
      {children}
    </section>
  );
}

// ---------------------------------------------------------------- Ficha e projetos (cadastro e vinculos preservados)
export function AbaFichaContrato({ ficha, irParaAba }: { ficha: FichaContrato; irParaAba: (a: string) => void }) {
  const fichaCompleta = !!(ficha.cliente && ficha.numero && ficha.vigenciaFim && ficha.valor);
  // o P0 esta cadastrado para este contrato? (null enquanto nao se sabe)
  const [temP0, setTemP0] = useState<boolean | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/p0/custos?ccu=${encodeURIComponent(ficha.codccu)}`, { cache: "no-store", signal: controller.signal })
      .then(async (r) => {
        const d = await r.json().catch(() => ({}));
        if (!controller.signal.aborted) setTemP0(r.ok && d.existe === true ? true : null);
      })
      .catch(() => {});
    return () => controller.abort();
  }, [ficha.codccu]);
  const itens: [string, boolean | null, string | null][] = [
    ["Custos do Senior (aba Custos)", true, "custos"],
    ["Ficha cadastral (cliente, nÃºmero, vigÃªncia, valor)", fichaCompleta, null],
    ["Custo de pessoal", null, "pessoal"],
    ["OrÃ§amento base (P0)", temP0, "p0"],
    ["PrevisÃ£o do Senior por contrato (tÃ­tulos em aberto)", true, "previsao"],
    ["Metas do contrato", true, "metas"],
    ["Planos de AÃ§Ã£o do contrato", true, "acoes"],
  ];
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Cartao titulo="Ficha do contrato" sub="Dados cadastrais, preenchidos pelo administrador. Os custos vÃªm do Senior, na aba Custos.">
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-[14px]">
          {([["Cliente", ficha.cliente], ["NÃºmero do contrato", ficha.numero], ["InÃ­cio da vigÃªncia", dataBr(ficha.vigenciaInicio)], ["Fim da vigÃªncia", dataBr(ficha.vigenciaFim)], ["Valor do contrato", ficha.valor ? moeda(ficha.valor) : null], ["SituaÃ§Ã£o", ficha.status === "ATIVO" ? "Ativo" : "Encerrado"]] as [string, string | null][]).map(([k, v]) => (
            <div key={k}><dt className="text-xs text-gray-400">{k}</dt><dd className="text-gray-800">{v || <span className="text-gray-300">nÃ£o informado</span>}</dd></div>
          ))}
          {ficha.objeto && <div className="col-span-2"><dt className="text-xs text-gray-400">Objeto</dt><dd className="text-gray-800">{ficha.objeto}</dd></div>}
          {ficha.observacoes && <div className="col-span-2"><dt className="text-xs text-gray-400">ObservaÃ§Ãµes</dt><dd className="text-gray-800">{ficha.observacoes}</dd></div>}
        </dl>
      </Cartao>
      <Cartao titulo="SituaÃ§Ã£o do acompanhamento" sub="O que jÃ¡ estÃ¡ ligado a este contrato">
        <ul className="space-y-2.5 text-[14px]">
          {itens.map(([nome, ok, aba]) => (
            <li key={nome} className="flex items-center gap-2.5">
              <span className={`inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs ${ok === true ? "bg-emerald-100 text-emerald-700" : ok === false ? "bg-amber-100 text-amber-700" : "bg-gray-100 text-gray-400"}`}>{ok === true ? "âœ“" : ok === false ? "â€¢" : "â€“"}</span>
              <span className="text-gray-700">{nome}</span>
              <span className="text-xs text-gray-400">{ok === true ? "disponÃ­vel" : ok === false ? "a preencher" : "em preparaÃ§Ã£o"}</span>
              {aba && <button onClick={() => irParaAba(aba)} className="ml-auto text-[13px] font-medium text-brand hover:text-brand-dark">abrir</button>}
            </li>
          ))}
        </ul>
      </Cartao>
      <ProjetosDoContrato codccu={ficha.codccu} />
      <ClientesDoContrato codccu={ficha.codccu} />
    </div>
  );
}

// ---------------------------------------------------------------- Custo de pessoal
// Folha CLT do centro de custo lida do Senior (qualquer centro com folha); o acesso e' o do modulo restrito e exclusivo "custo_pessoal".
export function AbaPessoal({ codccu }: { codccu: string }) {
  return <CustoPessoalView ccuFixo={codccu} />;
}

// ---------------------------------------------------------------- P0 (base de custos e receita, cadastrada contrato por contrato)
const PARTES_P0 = [
  { t: "Receita", d: "As linhas das mediÃ§Ãµes do contrato: o que se espera faturar, mÃªs a mÃªs." },
  { t: "Custos", d: "As previsÃµes lineares de custo, mÃªs a mÃªs. Cada previsÃ£o vira uma linha no grÃ¡fico principal do contrato." },
  { t: "Desvio", d: "A diferenÃ§a entre o previsto (P0) e o realizado do Senior. Ã‰ onde os coordenadores vÃ£o justificar o desvio." },
];

export function PartesDoP0() {
  return (
    <div className="grid gap-3 md:grid-cols-3">
      {PARTES_P0.map((x) => (
        <div key={x.t} className="rounded-xl border border-gray-100 bg-gray-50/60 p-4">
          <h3 className="text-[14px] font-semibold text-gray-900">{x.t}</h3>
          <p className="mt-1 text-[13.5px] text-gray-600">{x.d}</p>
        </div>
      ))}
    </div>
  );
}

// Subabas do P0: custo de contrato, receita e custos pessoais (so' o previsto, cada um separado dos outros dois)
const SUBABAS_P0 = [
  { id: "custos", nome: "Custos de contrato" },
  { id: "receita", nome: "Receita" },
  { id: "pessoal", nome: "Custos pessoais" },
] as const;

export function AbaP0({ codccu, nomeContrato }: { codccu: string; nomeContrato: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const sub = (SUBABAS_P0.find((a) => a.id === params.get("p0"))?.id ?? "custos") as (typeof SUBABAS_P0)[number]["id"];
  const irPara = (id: string) => {
    const n = new URLSearchParams(params.toString());
    if (id === "custos") n.delete("p0");
    else n.set("p0", id);
    router.replace(`${pathname}${n.toString() ? `?${n}` : ""}`, { scroll: false });
  };
  return (
    <div className="space-y-5">
      <nav className="flex flex-wrap gap-1.5" aria-label="Partes do P0">
        {SUBABAS_P0.map((a) => (
          <button key={a.id} type="button" onClick={() => irPara(a.id)} className={`rounded-full border px-4 py-1.5 text-[14px] font-medium transition ${sub === a.id ? "border-brand bg-brand text-white" : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"}`}>
            {a.nome}
          </button>
        ))}
      </nav>
      {sub === "custos" && <P0CustosContrato key={codccu} codccu={codccu} nomeContrato={nomeContrato} />}
      {sub === "receita" && <P0ReceitaContrato key={codccu} codccu={codccu} />}
      {sub === "pessoal" && <P0PessoaisContrato key={codccu} codccu={codccu} />}
    </div>
  );
}

// ---------------------------------------------------------------- Previsao (titulos em aberto do Senior por centro de custo)
export function AbaPrevisao({ codccu }: { codccu: string }) {
  return <PrevisaoMensal ccuFixo={codccu} />;
}
