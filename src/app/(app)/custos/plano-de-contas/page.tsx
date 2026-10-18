"use client";

// Custo por Contrato (antes "Custo por Plano de Contas"): visao do portfolio e visao de cada contrato, com filtros,
// graficos, tabelas e os lancamentos por tras de cada numero. Os numeros sao lidos DIRETO do Senior (botao Atualizar e
// atualizacao automatica ao abrir quando estao velhos) pela mesma regra do relatorio do Rito de Gestao.

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import AtualizarCusto, { type EstadoAtualizacaoUI } from "@/components/custos/AtualizarCusto";
import DetalheConta, { type AlvoDetalhe } from "@/components/custos/DetalheConta";
import FiltrosCusto from "@/components/custos/FiltrosCusto";
import VisaoContrato from "@/components/custos/VisaoContrato";
import VisaoGeral from "@/components/custos/VisaoGeral";
import { chaveMes, coresDosGrupos, type ContratoCusto, type Filtros, type TipoCusto } from "@/lib/custos/agregacao";
import { mesLongo } from "@/lib/custos/formato";

type Resposta = { contratos: ContratoCusto[]; meses: string[]; mesCorrente: string; atualizacao: EstadoAtualizacaoUI };

function CustoPorContrato() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const [dados, setDados] = useState<Resposta | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [detalhe, setDetalhe] = useState<AlvoDetalhe | null>(null);

  const carregar = useCallback(async () => {
    try {
      const res = await fetch("/api/custos-conta", { cache: "no-store" });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.error || "Erro ao carregar");
      }
      setDados(await res.json());
      setErro(null);
    } catch (e: any) {
      setErro(e?.message || "Erro ao carregar");
    }
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const mesesAsc = useMemo(() => (dados ? dados.meses.map(chaveMes).sort() : []), [dados]);
  const mesCorrente = dados ? chaveMes(dados.mesCorrente) : "";
  const primeiro = mesesAsc[0] ?? "";
  const ultimo = mesesAsc[mesesAsc.length - 1] ?? "";

  // ---- estado dos filtros vive na URL (link compartilhavel: ?ccu=190&de=2026-01&ate=2026-09...)
  const valido = (m: string | null) => (m && mesesAsc.includes(m) ? m : null);
  const de = valido(params.get("de")) ?? primeiro;
  const ate = valido(params.get("ate")) ?? ultimo;
  const tipoParam = params.get("tipo");
  const tipo: TipoCusto = tipoParam === "proprio" || tipoParam === "reembolsavel" ? tipoParam : "todos";
  const grupo = params.get("grupo") ?? "todos";
  const busca = params.get("q") ?? "";
  const ccu = params.get("ccu");
  const filtros: Filtros = { de: de <= ate ? de : ate, ate, tipo, grupo };

  const mudarUrl = useCallback(
    (parcial: Record<string, string | null>) => {
      const n = new URLSearchParams(params.toString());
      for (const [k, v] of Object.entries(parcial)) {
        if (v === null || v === "" || v === "todos") n.delete(k);
        else n.set(k, v);
      }
      const qs = n.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [params, pathname, router]
  );

  const mudarFiltros = (p: Partial<Filtros>) => mudarUrl({ ...(p.de !== undefined ? { de: p.de === primeiro ? null : p.de } : {}), ...(p.ate !== undefined ? { ate: p.ate === ultimo ? null : p.ate } : {}), ...(p.tipo !== undefined ? { tipo: p.tipo } : {}), ...(p.grupo !== undefined ? { grupo: p.grupo } : {}) });

  const irParaTopo = () => document.querySelector("main")?.scrollTo({ top: 0, behavior: "smooth" });
  const abrirContrato = (c: string) => {
    mudarUrl({ ccu: c });
    irParaTopo();
  };
  const voltar = () => {
    mudarUrl({ ccu: null });
    irParaTopo();
  };

  const cores = useMemo(() => coresDosGrupos(dados?.contratos ?? []), [dados]);
  const grupos = useMemo(() => {
    const total = new Map<string, { nome: string; total: number }>();
    for (const c of dados?.contratos ?? []) for (const conta of c.contas) {
      const g = total.get(conta.grupoCodigo) ?? { nome: conta.grupoNome, total: 0 };
      g.total += conta.total;
      total.set(conta.grupoCodigo, g);
    }
    return Array.from(total.entries())
      .sort((a, b) => b[1].total - a[1].total)
      .map(([codigo, g]) => ({ codigo, nome: g.nome }));
  }, [dados]);

  const contratoAberto = ccu && dados ? dados.contratos.find((c) => c.codccu === ccu) ?? null : null;

  if (erro && !dados) return <div className="p-6 text-sm text-red-600">{erro}</div>;
  if (!dados) {
    return (
      <div className="space-y-4" aria-busy>
        <div className="h-8 w-72 animate-pulse rounded-lg bg-gray-200" />
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-24 animate-pulse rounded-2xl bg-gray-200/70" />
          ))}
        </div>
        <div className="h-72 animate-pulse rounded-2xl bg-gray-200/70" />
      </div>
    );
  }

  const semAcesso = dados.contratos.length === 0;

  return (
    <div className="mx-auto max-w-[1400px]">
      <header className="mb-4 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-gray-900">Custo por centro de custo</h1>
          <p className="mt-1 max-w-3xl text-[15px] text-gray-500">
            Quanto cada centro de custo custa por mês e em quê, direto do Senior. Você vê os centros de custo das equipes de que participa.
          </p>
        </div>
        <AtualizarCusto estadoInicial={dados.atualizacao} onConcluida={carregar} />
      </header>

      {semAcesso ? (
        <div className="rounded-2xl border border-dashed border-gray-200 bg-white/70 px-6 py-14 text-center">
          <p className="text-sm font-medium text-gray-700">Nenhum custo para mostrar ainda.</p>
          <p className="mt-1 text-xs text-gray-400">Ou você não participa de nenhuma equipe com centro de custo vinculado, ou a primeira leitura do Senior ainda não terminou — use “Atualizar”.</p>
        </div>
      ) : (
        <>
          <FiltrosCusto
            mesesAsc={mesesAsc}
            mesCorrente={mesCorrente}
            filtros={filtros}
            onMudar={mudarFiltros}
            grupos={grupos}
            busca={busca}
            onBusca={(v) => mudarUrl({ q: v })}
            placeholderBusca={contratoAberto ? "Buscar conta…" : "Buscar centro de custo, CCU ou equipe…"}
          />

          {ccu && !contratoAberto ? (
            <div className="rounded-2xl border border-dashed border-gray-200 bg-white/70 px-6 py-12 text-center">
              <p className="text-sm font-medium text-gray-700">Centro de custo não encontrado (CCU {ccu}) ou sem acesso para você.</p>
              <button onClick={voltar} className="mt-2 text-sm font-medium text-brand hover:text-brand-dark">
                ← Voltar para todos os centros de custo
              </button>
            </div>
          ) : contratoAberto ? (
            <VisaoContrato contrato={contratoAberto} filtros={filtros} mesesAsc={mesesAsc} mesCorrente={mesCorrente} busca={busca} cores={cores} onVoltar={voltar} onAbrirDetalhe={setDetalhe} />
          ) : (
            <VisaoGeral contratos={dados.contratos} filtros={filtros} mesesAsc={mesesAsc} mesCorrente={mesCorrente} busca={busca} cores={cores} onAbrirContrato={abrirContrato} />
          )}

          <details className="mt-8 rounded-2xl border border-gray-100 bg-white/80 p-5 text-[15px] text-gray-600">
            <summary className="cursor-pointer text-sm font-medium text-gray-700">Como este custo é calculado</summary>
            <div className="mt-3 space-y-2 text-sm leading-relaxed">
              <p>
                O valor de cada mês é a soma do <b>rateio dos títulos já pagos (baixados)</b> no Senior, por centro de custo, conta financeira e <b>mês de competência</b> — a mesma regra do relatório do Rito de Gestão (conferida
                centro de custo a centro de custo, ao centavo). Por isso o mês em andamento mostra só o que já foi pago até agora e cresce a cada atualização.
              </p>
              <p>
                Ficam de fora, porque já entram no Custo de Pessoal / Impostos (ou são distribuição de lucro): Salários, FGTS, INSS, IRRF de colaboradores, Rescisão, GRRF, Férias, 13º, PCC, IRRF retido, ISSQN e Antecipação de lucros — e as
                contas “R - …” (reembolsáveis) que espelham essas mesmas contas.
              </p>
              <p>
                Contas <span className="rounded-full bg-sky-100 px-1.5 py-0.5 text-xs font-semibold text-sky-800">R</span> são reembolsáveis: o novo plano “R - …” do Senior e a conta “Despesas Reembolsáveis”. O filtro “Tipo de custo” separa o custo próprio do reembolsável.
              </p>
              {mesCorrente && <p className="text-xs text-gray-400">Dados de {mesLongo(primeiro)} até {mesLongo(mesCorrente)}.</p>}
            </div>
          </details>
        </>
      )}

      <DetalheConta alvo={detalhe} onFechar={() => setDetalhe(null)} />
    </div>
  );
}

export default function CustoPlanoDeContasPage() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-gray-500">Carregando...</div>}>
      <CustoPorContrato />
    </Suspense>
  );
}
