"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { alocacoesQueSeguram, type DadosEfetivos } from "@/lib/efetivos/disponibilidade";
import { chamar, hojeBr, type DadosTela } from "@/components/efetivos/comum";
import Painel from "@/components/efetivos/Painel";
import Campanhas from "@/components/efetivos/Campanhas";
import GanttEfetivos from "@/components/efetivos/GanttEfetivos";
import Efetivos from "@/components/efetivos/Efetivos";
import Veiculos from "@/components/efetivos/Veiculos";
import { Acessos, Historico } from "@/components/efetivos/AcessosEHistorico";

type Aba = "painel" | "campanhas" | "gantt" | "efetivos" | "veiculos" | "historico" | "acessos";

export default function EquipesCampoPage() {
  const [dados, setDados] = useState<DadosTela | null>(null);
  const [erro, setErro] = useState<{ status: number; texto: string } | null>(null);
  const [aba, setAba] = useState<Aba>("painel");
  const [dataRef, setDataRef] = useState(hojeBr());
  const [ocultarNomes, setOcultarNomes] = useState(false);

  const recarregar = useCallback(async () => {
    const r = await chamar<DadosTela>("GET", "/api/efetivos/dados");
    if (!r.ok) return setErro({ status: r.status, texto: r.dados.error ?? "Não foi possível carregar" });
    setErro(null);
    setDados(r.dados as DadosTela);
  }, []);
  useEffect(() => {
    recarregar();
  }, [recarregar]);

  // Dados no formato da regra de disponibilidade (so alocacoes de campanhas que ainda seguram gente).
  const regra: DadosEfetivos | null = useMemo(
    () =>
      dados
        ? {
            equipes: dados.equipes,
            vagas: dados.vagas,
            ausencias: dados.ausencias,
            alocacoes: alocacoesQueSeguram(dados.alocacoes, dados.campanhas),
          }
        : null,
    [dados]
  );

  if (erro) {
    return (
      <div className="p-6">
        <h1 className="text-xl font-semibold">Equipes de Campo</h1>
        <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {erro.status === 403 ? "Você ainda não tem acesso ao controle de efetivos. Peça a um administrador para liberar." : erro.texto}
        </div>
      </div>
    );
  }
  if (!dados || !regra) return <div className="p-6 text-sm text-gray-500">Carregando…</div>;

  const abas: { id: Aba; rotulo: string; visivel: boolean }[] = [
    { id: "painel", rotulo: "Painel", visivel: true },
    { id: "campanhas", rotulo: "Campanhas", visivel: true },
    { id: "gantt", rotulo: "Gantt", visivel: true },
    { id: "efetivos", rotulo: "Efetivos", visivel: true },
    { id: "veiculos", rotulo: "Veículos", visivel: true },
    { id: "historico", rotulo: "Histórico", visivel: dados.podeEditar },
    { id: "acessos", rotulo: "Acessos", visivel: dados.nivel === "ADMIN" },
  ];

  return (
    <div className="p-4 sm:p-6">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Equipes de Campo — Afugentamento e Resgate</h1>
          <p className="mt-0.5 text-sm text-gray-500">
            Efetivos, campanhas, disponibilidade e veículos por contrato.{" "}
            {dados.podeEditar ? "Você pode montar e movimentar equipes." : "Acesso de consulta (dashboard)."}
          </p>
        </div>
        <label className="flex items-center gap-1.5 text-xs text-gray-600" title="Esconde os nomes dos profissionais para mostrar a tela ao cliente">
          <input type="checkbox" checked={ocultarNomes} onChange={(e) => setOcultarNomes(e.target.checked)} />
          Modo apresentação (ocultar nomes)
        </label>
      </div>

      <nav className="mb-4 flex flex-wrap gap-1 border-b border-gray-200" aria-label="Seções">
        {abas
          .filter((a) => a.visivel)
          .map((a) => (
            <button
              key={a.id}
              onClick={() => setAba(a.id)}
              className={`-mb-px rounded-t-lg border border-b-0 px-4 py-2 text-sm font-medium ${aba === a.id ? "border-gray-200 bg-white text-brand-dark" : "border-transparent text-gray-500 hover:text-gray-700"}`}
              aria-current={aba === a.id ? "page" : undefined}
            >
              {a.rotulo}
            </button>
          ))}
      </nav>

      {aba === "painel" && <Painel dados={dados} regra={regra} dataRef={dataRef} setDataRef={setDataRef} ocultarNomes={ocultarNomes} />}
      {aba === "campanhas" && <Campanhas dados={dados} regra={regra} recarregar={recarregar} ocultarNomes={ocultarNomes} />}
      {aba === "gantt" && <GanttEfetivos dados={dados} ocultarNomes={ocultarNomes} />}
      {aba === "efetivos" && <Efetivos dados={dados} regra={regra} recarregar={recarregar} ocultarNomes={ocultarNomes} />}
      {aba === "veiculos" && <Veiculos dados={dados} recarregar={recarregar} />}
      {aba === "historico" && dados.podeEditar && <Historico />}
      {aba === "acessos" && dados.nivel === "ADMIN" && <Acessos />}
    </div>
  );
}
