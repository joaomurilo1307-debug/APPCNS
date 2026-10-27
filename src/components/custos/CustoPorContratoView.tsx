"use client";

// Tela de custos por centro de custo como COMPONENTE: a pagina /custos/plano-de-contas e a aba Custos de cada contrato usam este mesmo codigo.
// Custo por Contrato (antes "Custo por Plano de Contas"): visao do portfolio e visao de cada contrato, com filtros,
// graficos, tabelas e os lancamentos por tras de cada numero. Os numeros sao lidos DIRETO do Senior (botao Atualizar e
// atualizacao automatica ao abrir quando estao velhos) pela mesma regra do relatorio do Rito de Gestao.

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import AtualizarCusto, { type EstadoAtualizacaoUI } from "./AtualizarCusto";
import DetalheConta, { type AlvoDetalhe } from "./DetalheConta";
import AoVivo from "./AoVivo";
import FiltrosCusto from "./FiltrosCusto";
import SeloSenior from "./SeloSenior";
import VisaoContrato from "./VisaoContrato";
import VisaoGeral from "./VisaoGeral";
import AvisoCentroDeCusto from "@/components/contratos/AvisoCentroDeCusto";
import { chaveMes, contratosNaBase, coresDosGrupos, type BaseMes, type ContratoCusto, type Filtros, type TipoCusto } from "@/lib/custos/agregacao";
import { mesLongo } from "@/lib/custos/formato";

type Escopo = { tipo: "todos" | "varios" | "um" | "nenhum"; quantidade: number | null; podeGerenciarAcessos: boolean };
type Resposta = { contratos: ContratoCusto[]; meses: string[]; mesesCompetencia?: string[]; temCompetencia?: boolean; mesCorrente: string; atualizacao: EstadoAtualizacaoUI; escopo?: Escopo };

export default function CustoPorContratoView({ ccuFixo }: { ccuFixo?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const [dados, setDados] = useState<Resposta | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [detalhe, setDetalhe] = useState<AlvoDetalhe | null>(null);

  const carregar = useCallback(async () => {
    try {
      const res = await fetch(ccuFixo ? `/api/custos-conta?ccu=${encodeURIComponent(ccuFixo)}` : "/api/custos-conta", { cache: "no-store" });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.error || "Erro ao carregar");
      }
      setDados(await res.json());
      setErro(null);
    } catch (e: any) {
      setErro(e?.message || "Erro ao carregar");
    }
  }, [ccuFixo]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  // base do mes: data de pagamento (padrao, como as planilhas) ou competencia (a compra inteira no mes da nota)
  const base: BaseMes = params.get("base") === "competencia" && dados?.temCompetencia ? "competencia" : "pagamento";
  const contratosBase = useMemo(() => (dados ? contratosNaBase(dados.contratos, base) : []), [dados, base]);
  const mesesAsc = useMemo(() => (dados ? (base === "competencia" && dados.mesesCompetencia ? dados.mesesCompetencia : dados.meses).map(chaveMes).sort() : []), [dados, base]);
  const mesCorrente = dados ? chaveMes(dados.mesCorrente) : "";
  const primeiro = mesesAsc[0] ?? "";
  const ultimo = mesesAsc[mesesAsc.length - 1] ?? "";

  // ---- estado dos filtros vive na URL (link compartilhavel: ?ccu=190&de=2026-01&ate=2026-09...)
  const valido = (m: string | null) => (m && mesesAsc.includes(m) ? m : null);
  // na competencia a lista comeca em meses anteriores a 2026 (compras antigas pagas em 2026): o padrao e' de jan/26 em diante
  const primeiroPadrao = base === "competencia" && mesesAsc.includes("2026-01") ? "2026-01" : primeiro;
  const de = valido(params.get("de")) ?? primeiroPadrao;
  const ate = valido(params.get("ate")) ?? ultimo;
  const tipoParam = params.get("tipo");
  const tipo: TipoCusto = tipoParam === "proprio" || tipoParam === "reembolsavel" ? tipoParam : "todos";
  const grupo = params.get("grupo") ?? "todos";
  const busca = params.get("q") ?? "";
  // quem acompanha UM so' centro de custo abre direto nele: nao ha lista, ranking nem "voltar"
  const unico = dados && dados.contratos.length === 1 ? dados.contratos[0].codccu : null;
  const ccu = ccuFixo ?? unico ?? params.get("ccu");
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

  const mudarBase = (b: BaseMes) => mudarUrl({ base: b === "pagamento" ? null : b, de: null, ate: null });
  const mudarFiltros = (p: Partial<Filtros>) => mudarUrl({ ...(p.de !== undefined ? { de: p.de === primeiroPadrao ? null : p.de } : {}), ...(p.ate !== undefined ? { ate: p.ate === ultimo ? null : p.ate } : {}), ...(p.tipo !== undefined ? { tipo: p.tipo } : {}), ...(p.grupo !== undefined ? { grupo: p.grupo } : {}) });

  const irParaTopo = () => document.querySelector("main")?.scrollTo({ top: 0, behavior: "smooth" });
  const abrirContrato = (c: string) => {
    mudarUrl({ ccu: c });
    irParaTopo();
  };
  const voltar = () => {
    mudarUrl({ ccu: null });
    irParaTopo();
  };

  const cores = useMemo(() => coresDosGrupos(contratosBase), [contratosBase]);
  const grupos = useMemo(() => {
    const total = new Map<string, { nome: string; total: number }>();
    for (const c of contratosBase) for (const conta of c.contas) {
      const g = total.get(conta.grupoCodigo) ?? { nome: conta.grupoNome, total: 0 };
      g.total += conta.total;
      total.set(conta.grupoCodigo, g);
    }
    return Array.from(total.entries())
      .sort((a, b) => b[1].total - a[1].total)
      .map(([codigo, g]) => ({ codigo, nome: g.nome }));
  }, [contratosBase]);

  const contratoAberto = ccu && dados ? contratosBase.find((c) => c.codccu === ccu) ?? null : null;

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
  const escopo = dados.escopo;
  const escopoTexto =
    escopo?.tipo === "todos"
      ? "Visão completa: você acompanha todos os centros de custo."
      : escopo?.tipo === "um"
        ? "Você acompanha 1 centro de custo."
        : escopo?.tipo === "varios"
          ? `Você acompanha ${escopo.quantidade} centros de custo.`
          : "";

  return (
    <div className="mx-auto max-w-[1400px]">
      <header className="mb-4 flex flex-wrap items-start justify-between gap-4">
        <div>
          {!ccuFixo && <h1 className="text-3xl font-semibold tracking-tight text-gray-900">Custo por centro de custo</h1>}
          {!ccuFixo && (
            <p className="mt-1 max-w-3xl text-[15px] text-gray-500">
              {unico ? "Quanto este centro de custo custa por mês e em quê, direto do Senior." : "Quanto cada centro de custo custa por mês e em quê, direto do Senior."}
            </p>
          )}
          <SeloSenior />
        </div>
        <div className="flex flex-col items-end gap-2">
          <AtualizarCusto estadoInicial={dados.atualizacao} onConcluida={carregar} />
          {!ccuFixo && escopo?.podeGerenciarAcessos && (
            <Link href="/custos/acessos" className="text-[13px] font-medium text-brand hover:text-brand-dark">
              Escolher quem vê cada centro de custo →
            </Link>
          )}
        </div>
      </header>
      {escopoTexto && !ccuFixo && <p className="-mt-2 mb-4 text-[13px] text-gray-500">{escopoTexto}</p>}

      {semAcesso ? (
        <div className="rounded-2xl border border-dashed border-gray-200 bg-white/70 px-6 py-14 text-center">
          {escopo?.tipo === "nenhum" ? (
            <>
              <p className="text-base font-medium text-gray-700">Você ainda não tem nenhum centro de custo liberado.</p>
              <p className="mt-1 text-sm text-gray-500">Peça ao administrador para liberar os centros de custo que você acompanha.</p>
            </>
          ) : (
            <>
              <p className="text-base font-medium text-gray-700">Nenhum custo para mostrar ainda.</p>
              <p className="mt-1 text-sm text-gray-500">A primeira leitura do Senior ainda não terminou — use “Atualizar”.</p>
            </>
          )}
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
            base={base}
            onBase={mudarBase}
            temCompetencia={!!dados.temCompetencia}
          />

          {ccu && !contratoAberto ? (
            <div className="rounded-2xl border border-dashed border-gray-200 bg-white/70 px-6 py-12 text-center">
              <p className="text-sm font-medium text-gray-700">Centro de custo não encontrado (CCU {ccu}) ou sem acesso para você.</p>
              <button onClick={voltar} className="mt-2 text-sm font-medium text-brand hover:text-brand-dark">
                ← Voltar para todos os centros de custo
              </button>
            </div>
          ) : contratoAberto ? (
            <>
              {!ccuFixo && <AvisoCentroDeCusto codccus={[contratoAberto.codccu]} />}
              <VisaoContrato contrato={contratoAberto} filtros={filtros} base={base} mesesAsc={mesesAsc} mesCorrente={mesCorrente} busca={busca} cores={cores} onVoltar={unico || ccuFixo ? undefined : voltar} embutido={!!ccuFixo} onAbrirDetalhe={setDetalhe} />
              <AoVivo key={contratoAberto.codccu} codccu={contratoAberto.codccu} />
            </>
          ) : (
            <>
              {!ccuFixo && <AvisoCentroDeCusto resumo codccus={contratosBase.map((c) => c.codccu)} />}
              <VisaoGeral contratos={contratosBase} filtros={filtros} base={base} mesesAsc={mesesAsc} mesCorrente={mesCorrente} busca={busca} cores={cores} onAbrirContrato={abrirContrato} />
              <AoVivo />
            </>
          )}

          <details className="mt-8 rounded-2xl border border-gray-100 bg-white/80 p-5 text-[15px] text-gray-600">
            <summary className="cursor-pointer text-sm font-medium text-gray-700">Como este custo é calculado</summary>
            <div className="mt-3 space-y-2 text-sm leading-relaxed">
              <p>
                O custo é a soma do <b>rateio das notas já quitadas</b> no Senior, por centro de custo e conta financeira: notas <b>pagas</b> e notas <b>quitadas com adiantamento</b> já dado ao fornecedor (mostradas com o selo
                “adiantamento”). Nota lançada e ainda não paga <b>não entra</b>, por isso o mês em andamento mostra só o que já foi pago e cresce a cada atualização.
              </p>
              <p>
                <b>Ver por data de pagamento</b> (padrão) coloca cada parcela no mês em que foi paga — é o mesmo critério da coluna “Data competência” das planilhas dos coordenadores.{" "}
                <b>Ver por competência</b> coloca a compra inteira no mês da competência cadastrada no título pelo financeiro, mesmo que as parcelas sejam pagas depois.
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
