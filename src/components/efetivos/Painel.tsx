"use client";

import { useMemo } from "react";
import {
  alocacoesQueSeguram,
  balancoCapacidade,
  montarPainel,
  serieDisponibilidade,
  somarDias,
  atendimentoDaCampanha,
  STATUS_CAMPANHA_QUE_LIBERAM,
  type DadosEfetivos,
} from "@/lib/efetivos/disponibilidade";
import { COR_ATENDIMENTO, COR_DISPONIBILIDADE, COR_RH, COR_STATUS_CAMPANHA, fmtDia, hojeBr, type DadosTela } from "./comum";

function Kpi({ rotulo, valor, cor, dica }: { rotulo: string; valor: number | string; cor?: string; dica?: string }) {
  return (
    <div className="rounded-xl border border-gray-100 bg-white p-3.5 shadow-sm" title={dica}>
      <div className="text-[11px] font-medium uppercase tracking-wide text-gray-400">{rotulo}</div>
      <div className={`mt-1 text-2xl font-semibold tabular-nums ${cor ?? "text-ink"}`}>{valor}</div>
    </div>
  );
}

// Barra empilhada simples (disponíveis / alocadas / indisponíveis).
function BarraEmpilhada({ d, a, i }: { d: number; a: number; i: number }) {
  const total = d + a + i || 1;
  return (
    <div className="flex h-3 w-full overflow-hidden rounded-full bg-gray-100" role="img" aria-label={`${d} disponíveis, ${a} alocadas, ${i} indisponíveis`}>
      <div className="bg-emerald-500" style={{ width: `${(d / total) * 100}%` }} />
      <div className="bg-sky-500" style={{ width: `${(a / total) * 100}%` }} />
      <div className="bg-red-400" style={{ width: `${(i / total) * 100}%` }} />
    </div>
  );
}

export default function Painel({
  dados,
  regra,
  dataRef,
  setDataRef,
  ocultarNomes,
}: {
  dados: DadosTela;
  regra: DadosEfetivos;
  dataRef: string;
  setDataRef: (d: string) => void;
  ocultarNomes: boolean;
}) {
  const painel = useMemo(() => montarPainel(regra, dataRef), [regra, dataRef]);
  const hoje = hojeBr();

  // "agora e depois": hoje, +7, +15, +30, +60, +90 dias
  const marcos = useMemo(() => [0, 7, 15, 30, 60, 90].map((n) => somarDias(hoje, n)), [hoje]);
  const serie = useMemo(() => serieDisponibilidade(regra, marcos), [regra, marcos]);
  const grupos = painel.grupos.map((g) => g.grupo);

  // pessoas livres semana a semana (próximas 12 semanas) por grupo
  const semanas = useMemo(() => Array.from({ length: 12 }, (_, k) => somarDias(hoje, k * 7)), [hoje]);
  const serieSemanal = useMemo(() => serieDisponibilidade(regra, semanas), [regra, semanas]);
  const maxLivres = Math.max(1, ...serieSemanal.flatMap((p) => grupos.map((g) => p.porGrupo[g]?.livres ?? 0)));

  const balancos = useMemo(
    () => [0, 30, 60, 90].map((n) => ({ dia: somarDias(hoje, n), linhas: balancoCapacidade(regra, dados.campanhas, somarDias(hoje, n)) })),
    [regra, dados.campanhas, hoje]
  );

  const novas = dados.campanhas.filter((c) => c.status === "Nova").length;
  const naoAtendidas = useMemo(() => {
    const alocs = alocacoesQueSeguram(dados.alocacoes, dados.campanhas);
    return dados.campanhas
      .filter((c) => !STATUS_CAMPANHA_QUE_LIBERAM.includes(c.status) && c.fim >= hoje)
      .map((c) => ({ c, at: atendimentoDaCampanha({ ...regra, alocacoes: alocs }, c) }))
      .filter((x) => x.at.atendimento !== "CAPACIDADE SUFICIENTE" && x.at.pessoasAlocadas === 0);
  }, [dados.campanhas, dados.alocacoes, regra, hoje]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-gray-100 bg-white p-3.5 shadow-sm">
        <label className="text-xs text-gray-500">
          Data de referência
          <input type="date" value={dataRef} onChange={(e) => e.target.value && setDataRef(e.target.value)} className="mt-1 block rounded-lg border border-gray-200 px-2.5 py-1.5 text-sm text-ink" />
        </label>
        <button onClick={() => setDataRef(hoje)} className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50">
          Hoje
        </button>
        <p className="ml-auto max-w-xl text-xs text-gray-400">
          Uma equipe fica <strong>DISPONÍVEL</strong> quando está ativa, todas as vagas têm profissional, ninguém está ausente na data e nenhum membro está escalado em campanha.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Kpi rotulo="Total de equipes" valor={painel.totais.equipes} />
        <Kpi rotulo="Disponíveis" valor={painel.totais.disponiveis} cor="text-emerald-600" />
        <Kpi rotulo="Alocadas" valor={painel.totais.alocadas} cor="text-sky-600" />
        <Kpi rotulo="Indisponíveis" valor={painel.totais.indisponiveis} cor="text-red-600" />
        <Kpi rotulo="Campanhas novas" valor={novas} cor="text-purple-600" dica="Solicitações ainda não analisadas" />
      </div>

      {painel.totais.conflitos > 0 && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-800">
          <strong>{painel.totais.conflitos}</strong> pessoa{painel.totais.conflitos > 1 ? "s" : ""} escalada{painel.totais.conflitos > 1 ? "s" : ""} em campanha e ausente{painel.totais.conflitos > 1 ? "s" : ""} na data
          escolhida. Revise a equipe da campanha.
        </div>
      )}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <section className="overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm">
          <h2 className="border-b border-gray-100 bg-brand px-4 py-2 text-center text-xs font-semibold uppercase tracking-wide text-white">Situação das equipes na data selecionada</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-[11px] uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-3 py-2 text-left">ID</th>
                  <th className="px-3 py-2 text-left">Projeto</th>
                  <th className="px-3 py-2 text-left">Grupo</th>
                  <th className="px-3 py-2 text-left">Equipe / base</th>
                  <th className="px-3 py-2 text-left">Status</th>
                  <th className="px-3 py-2 text-left">Situação RH</th>
                  <th className="px-3 py-2 text-right" title="Vagas com profissional / vagas previstas">Preenchidas</th>
                  <th className="px-3 py-2 text-right" title="Pessoas da equipe escaladas em campanha na data">Alocações</th>
                  <th className="px-3 py-2 text-left">Disponibilidade</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {painel.equipes.map((e) => (
                  <tr key={e.id} className="hover:bg-gray-50/60">
                    <td className="px-3 py-1.5 font-medium text-ink">{e.codigo}</td>
                    <td className="px-3 py-1.5 text-gray-600">{e.projeto}</td>
                    <td className="px-3 py-1.5 text-gray-600">{e.grupo}</td>
                    <td className="px-3 py-1.5 text-gray-700">{e.nome}</td>
                    <td className="px-3 py-1.5 text-gray-600">{e.status}</td>
                    <td className="px-3 py-1.5">
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${COR_RH[e.situacaoRh]}`}>{e.situacaoRh}</span>
                    </td>
                    <td className="px-3 py-1.5 text-right tabular-nums text-gray-600">
                      {e.nomesPreenchidos}/{e.vagasPrevistas}
                    </td>
                    <td className="px-3 py-1.5 text-right tabular-nums text-gray-600">{e.alocacoes}</td>
                    <td className="px-3 py-1.5">
                      <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${COR_DISPONIBILIDADE[e.disponibilidade]}`}>{e.disponibilidade}</span>
                    </td>
                  </tr>
                ))}
                {painel.equipes.length === 0 && (
                  <tr>
                    <td colSpan={9} className="px-3 py-8 text-center text-gray-400">
                      Nenhuma equipe cadastrada ainda. Use a aba “Efetivos” para importar a planilha.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <div className="space-y-5">
          <section className="overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm">
            <h2 className="border-b border-gray-100 bg-brand px-4 py-2 text-center text-xs font-semibold uppercase tracking-wide text-white">Resumo por grupo — equipes</h2>
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-[11px] uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-3 py-2 text-left">Grupo</th>
                  <th className="px-3 py-2 text-right">Total</th>
                  <th className="px-3 py-2 text-right">Disponíveis</th>
                  <th className="px-3 py-2 text-right">Alocadas</th>
                  <th className="px-3 py-2 text-right">Indisponíveis</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {painel.grupos.map((g) => (
                  <tr key={g.grupo}>
                    <td className="px-3 py-2 font-medium text-ink">{g.grupo}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{g.total}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-emerald-700">{g.disponiveis}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-sky-700">{g.alocadas}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-red-600">{g.indisponiveis}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="space-y-2.5 border-t border-gray-100 p-3.5">
              {painel.grupos.map((g) => (
                <div key={g.grupo}>
                  <div className="mb-1 flex justify-between text-[11px] text-gray-500">
                    <span>{g.grupo}</span>
                    <span>
                      <span className="text-emerald-600">●</span> disp. <span className="text-sky-600">●</span> aloc. <span className="text-red-500">●</span> indisp.
                    </span>
                  </div>
                  <BarraEmpilhada d={g.disponiveis} a={g.alocadas} i={g.indisponiveis} />
                </div>
              ))}
            </div>
          </section>

          <section className="overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm">
            <h2 className="border-b border-gray-100 bg-brand px-4 py-2 text-center text-xs font-semibold uppercase tracking-wide text-white">Resumo por grupo — pessoas</h2>
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-[11px] uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-3 py-2 text-left">Grupo</th>
                  <th className="px-3 py-2 text-right" title="Vagas previstas">Vagas</th>
                  <th className="px-3 py-2 text-right">Livres</th>
                  <th className="px-3 py-2 text-right">Alocadas</th>
                  <th className="px-3 py-2 text-right">Ausentes</th>
                  <th className="px-3 py-2 text-right" title="Vagas sem profissional (inclui em contratação)">Abertas</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {painel.grupos.map((g) => (
                  <tr key={g.grupo}>
                    <td className="px-3 py-2 font-medium text-ink">{g.grupo}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{g.pessoas.vagas}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-emerald-700">{g.pessoas.livres}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-sky-700">{g.pessoas.alocadas}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-red-600">{g.pessoas.ausentes}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-amber-700">{g.pessoas.abertas}</td>
                  </tr>
                ))}
                <tr className="bg-gray-50 font-semibold">
                  <td className="px-3 py-2">Total</td>
                  <td className="px-3 py-2 text-right tabular-nums">{painel.totais.pessoas.vagas}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-emerald-700">{painel.totais.pessoas.livres}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-sky-700">{painel.totais.pessoas.alocadas}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-red-600">{painel.totais.pessoas.ausentes}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-amber-700">{painel.totais.pessoas.abertas}</td>
                </tr>
              </tbody>
            </table>
          </section>
        </div>
      </div>

      <section className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
        <h2 className="text-sm font-semibold text-ink">Disponibilidade agora e depois</h2>
        <p className="mb-3 text-xs text-gray-500">Equipes disponíveis e pessoas livres em cada data, com a agenda de campanhas e ausências já lançada.</p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-[11px] uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-3 py-2 text-left">Grupo</th>
                {serie.map((p, k) => (
                  <th key={p.data} className="px-3 py-2 text-right">
                    {k === 0 ? "Hoje" : `+${[0, 7, 15, 30, 60, 90][k]} dias`}
                    <div className="font-normal normal-case text-gray-400">{fmtDia(p.data)}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {grupos.map((g) => (
                <tr key={g}>
                  <td className="px-3 py-2 font-medium text-ink">{g}</td>
                  {serie.map((p) => (
                    <td key={p.data} className="px-3 py-2 text-right tabular-nums">
                      <span className="text-emerald-700">{p.porGrupo[g].equipesDisponiveis}</span>
                      <span className="text-gray-400"> equipes · </span>
                      <span className="text-ink">{p.porGrupo[g].livres}</span>
                      <span className="text-gray-400"> livres</span>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-4">
          <div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-gray-400">Pessoas livres por semana (próximas 12 semanas)</div>
          <div className="flex h-36 items-end gap-1.5 overflow-x-auto pb-1">
            {serieSemanal.map((p) => (
              <div key={p.data} className="flex min-w-[44px] flex-1 flex-col items-center">
                <div className="flex h-28 w-full items-end justify-center gap-1">
                  {grupos.map((g, gi) => {
                    const v = p.porGrupo[g]?.livres ?? 0;
                    return (
                      <div
                        key={g}
                        title={`${g}: ${v} livres em ${fmtDia(p.data)}`}
                        className={`w-3.5 rounded-t ${gi === 0 ? "bg-teal-500" : "bg-amber-500"}`}
                        style={{ height: `${(v / maxLivres) * 100}%`, minHeight: v > 0 ? 2 : 0 }}
                      />
                    );
                  })}
                </div>
                <div className="mt-1 text-[10px] tabular-nums text-gray-400">{p.data.slice(8, 10)}/{p.data.slice(5, 7)}</div>
              </div>
            ))}
          </div>
          <div className="mt-1 flex gap-4 text-[11px] text-gray-500">
            {grupos.map((g, gi) => (
              <span key={g} className="flex items-center gap-1.5">
                <span className={`inline-block h-2.5 w-2.5 rounded-sm ${gi === 0 ? "bg-teal-500" : "bg-amber-500"}`} />
                {g} (máx. {maxLivres})
              </span>
            ))}
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
        <h2 className="text-sm font-semibold text-ink">Capacidade x demanda — contratar ou realocar?</h2>
        <p className="mb-3 text-xs text-gray-500">
          Compara as equipes completas (ativas, todas as vagas preenchidas, ninguém ausente) com as equipes pedidas pelas campanhas que estão rodando em cada data.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-[11px] uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-3 py-2 text-left">Grupo</th>
                {balancos.map((b, k) => (
                  <th key={b.dia} className="px-3 py-2 text-right">
                    {k === 0 ? "Hoje" : `+${[0, 30, 60, 90][k]} dias`}
                    <div className="font-normal normal-case text-gray-400">{fmtDia(b.dia)}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {grupos.map((g) => (
                <tr key={g}>
                  <td className="px-3 py-2 font-medium text-ink">{g}</td>
                  {balancos.map((b) => {
                    const l = b.linhas.find((x) => x.grupo === g);
                    if (!l) return <td key={b.dia} />;
                    return (
                      <td key={b.dia} className="px-3 py-2 text-right text-xs tabular-nums">
                        <div className="text-gray-500">
                          demanda {l.demandaEquipes} · completas {l.equipesCompletas}
                        </div>
                        <div className={`font-semibold ${l.saldo < 0 ? "text-red-600" : "text-emerald-600"}`}>
                          {l.saldo < 0 ? `faltam ${-l.saldo} equipe${-l.saldo > 1 ? "s" : ""}` : l.saldo === 0 ? "no limite" : `folga de ${l.saldo}`}
                        </div>
                        {l.vagasAbertas > 0 && <div className="text-amber-700">{l.vagasAbertas} vagas abertas</div>}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {naoAtendidas.length > 0 && (
        <section className="rounded-xl border border-amber-200 bg-amber-50/50 p-4">
          <h2 className="text-sm font-semibold text-amber-900">Campanhas que ainda não têm equipe e a capacidade não cobre</h2>
          <ul className="mt-2 space-y-1.5 text-sm">
            {naoAtendidas.map(({ c, at }) => (
              <li key={c.id} className="flex flex-wrap items-center gap-2">
                <span className="font-medium text-ink">{c.codigo}</span>
                <span className="text-gray-600">
                  {c.projeto} · {c.grupo} · {fmtDia(c.inicio)} a {fmtDia(c.fim)} · pede {c.qtdEquipes} equipe{c.qtdEquipes > 1 ? "s" : ""}
                </span>
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${COR_STATUS_CAMPANHA[c.status]}`}>{c.status}</span>
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${COR_ATENDIMENTO[at.atendimento]}`}>{at.atendimento}</span>
                <span className="text-xs text-gray-500">{at.pessoasLivresNoGrupo} pessoas livres no período</span>
              </li>
            ))}
          </ul>
        </section>
      )}
      {ocultarNomes && <p className="text-center text-[11px] text-gray-400">Modo apresentação: nomes de profissionais ocultos.</p>}
    </div>
  );
}
