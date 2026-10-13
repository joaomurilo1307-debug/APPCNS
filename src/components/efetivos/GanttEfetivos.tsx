"use client";

import { useMemo, useState } from "react";
import { STATUS_CAMPANHA_QUE_LIBERAM, STATUS_QUE_TRABALHAM, ordenarGrupos } from "@/lib/efetivos/disponibilidade";
import { COR_STATUS_CAMPANHA, diferencaDias, fmtDia, hojeBr, segundaDaSemana, somarDias, type DadosTela } from "./comum";

type Barra = { inicio: string; fim: string; rotulo: string; cor: string; dica: string; hachura?: boolean };
type Linha = { id: string; titulo: string; sub?: string; extra?: string; barras: Barra[] };
type Modo = "campanha" | "equipe" | "pessoa";

const CORES = ["bg-teal-500", "bg-sky-500", "bg-violet-500", "bg-amber-500", "bg-rose-500", "bg-lime-600", "bg-fuchsia-500", "bg-orange-500"];
const corDaCampanha = (codigo: string) => CORES[(Number(codigo.replace(/\D/g, "")) || 0) % CORES.length];
const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const LARGURA_ESQUERDA = 270;
const ALTURA_FAIXA = 26;

// Distribui as barras em faixas para que as que se sobrepõem fiquem uma embaixo da outra.
function distribuir(barras: Barra[]): { barra: Barra; faixa: number }[] {
  const ordenadas = [...barras].sort((a, b) => a.inicio.localeCompare(b.inicio) || a.fim.localeCompare(b.fim));
  const fimPorFaixa: string[] = [];
  return ordenadas.map((barra) => {
    let faixa = fimPorFaixa.findIndex((f) => f < barra.inicio);
    if (faixa === -1) faixa = fimPorFaixa.length;
    fimPorFaixa[faixa] = barra.fim;
    return { barra, faixa };
  });
}

export default function GanttEfetivos({ dados, ocultarNomes }: { dados: DadosTela; ocultarNomes: boolean }) {
  const hoje = hojeBr();
  const [modo, setModo] = useState<Modo>("campanha");
  const [inicio, setInicio] = useState(() => segundaDaSemana(somarDias(hoje, -14)));
  const [semanas, setSemanas] = useState(26);
  const [dw, setDw] = useState(10);
  const [grupo, setGrupo] = useState("");
  const [encerradas, setEncerradas] = useState(false);

  const totalDias = semanas * 7;
  const fimJanela = somarDias(inicio, totalDias - 1);
  const largura = totalDias * dw;
  const grupos = ordenarGrupos(dados.equipes.map((e) => e.grupo));

  const nomeDe = (v: { nome: string | null; cargo: string }) => (ocultarNomes ? v.cargo : v.nome ?? "(vaga aberta)");
  const equipePorId = useMemo(() => new Map(dados.equipes.map((e) => [e.id, e])), [dados.equipes]);
  const vagaPorId = useMemo(() => new Map(dados.vagas.map((v) => [v.id, v])), [dados.vagas]);
  const campanhaPorId = useMemo(() => new Map(dados.campanhas.map((c) => [c.id, c])), [dados.campanhas]);

  const linhas: Linha[] = useMemo(() => {
    if (modo === "campanha") {
      return dados.campanhas
        .filter((c) => (encerradas || !STATUS_CAMPANHA_QUE_LIBERAM.includes(c.status)) && (!grupo || c.grupo === grupo))
        .map((c) => {
          const membros = dados.alocacoes
            .filter((a) => a.campanhaId === c.id)
            .map((a) => vagaPorId.get(a.vagaId))
            .filter((v): v is NonNullable<typeof v> => !!v)
            .map(nomeDe);
          const lista = membros.length ? membros.join(", ") : "";
          return {
            id: c.id,
            titulo: `${c.codigo} · ${c.projeto}`,
            sub: `${c.grupo} · ${c.atividade} · ${c.status}${c.qtdEquipes > 1 ? ` · ${c.qtdEquipes} equipes` : ""}`,
            extra: membros.length ? `${membros.length} pessoa${membros.length > 1 ? "s" : ""}: ${lista}` : "Equipe ainda não montada",
            barras: [
              {
                inicio: c.inicio,
                fim: c.fim,
                rotulo: membros.length ? `${c.atividade} · ${membros.length} pessoas` : c.atividade,
                cor: STATUS_CAMPANHA_QUE_LIBERAM.includes(c.status) ? "bg-gray-300" : corDaCampanha(c.codigo),
                dica: `${c.codigo} — ${c.projeto}${c.local ? ` (${c.local})` : ""}\n${fmtDia(c.inicio)} a ${fmtDia(c.fim)} · ${c.status}\n${lista || "Equipe ainda não montada"}`,
                hachura: membros.length === 0,
              },
            ],
          };
        })
        .sort((a, b) => a.barras[0].inicio.localeCompare(b.barras[0].inicio));
    }
    if (modo === "equipe") {
      return dados.equipes
        .filter((e) => !grupo || e.grupo === grupo)
        .map((e) => {
          const vagasDaEquipe = dados.vagas.filter((v) => v.equipeId === e.id);
          const ids = new Set(vagasDaEquipe.map((v) => v.id));
          const porCampanha = new Map<string, { inicio: string; fim: string; n: number }>();
          for (const a of dados.alocacoes) {
            if (!ids.has(a.vagaId)) continue;
            const c = campanhaPorId.get(a.campanhaId);
            if (!c || STATUS_CAMPANHA_QUE_LIBERAM.includes(c.status)) continue;
            const x = porCampanha.get(c.id) ?? { inicio: a.inicio, fim: a.fim, n: 0 };
            porCampanha.set(c.id, { inicio: a.inicio < x.inicio ? a.inicio : x.inicio, fim: a.fim > x.fim ? a.fim : x.fim, n: x.n + 1 });
          }
          return {
            id: e.id,
            titulo: `${e.codigo} · ${e.nome}`,
            sub: `${e.projeto} · ${e.grupo}${e.status !== "Ativa" ? ` · ${e.status}` : ""}`,
            extra: `${vagasDaEquipe.filter((v) => v.nome).length}/${vagasDaEquipe.length} vagas preenchidas`,
            barras: [...porCampanha.entries()].map(([id, x]) => {
              const c = campanhaPorId.get(id)!;
              return {
                inicio: x.inicio,
                fim: x.fim,
                rotulo: `${c.codigo} (${x.n}/${vagasDaEquipe.length})`,
                cor: corDaCampanha(c.codigo),
                dica: `${c.codigo} — ${c.projeto}\n${fmtDia(x.inicio)} a ${fmtDia(x.fim)}\n${x.n} de ${vagasDaEquipe.length} pessoas da equipe`,
              };
            }),
          };
        });
    }
    return dados.vagas
      .filter((v) => v.nome && (!grupo || equipePorId.get(v.equipeId)?.grupo === grupo))
      .map((v) => {
        const eq = equipePorId.get(v.equipeId);
        const barras: Barra[] = [];
        for (const a of dados.alocacoes.filter((x) => x.vagaId === v.id)) {
          const c = campanhaPorId.get(a.campanhaId);
          if (!c || STATUS_CAMPANHA_QUE_LIBERAM.includes(c.status)) continue;
          barras.push({ inicio: a.inicio, fim: a.fim, rotulo: c.codigo, cor: corDaCampanha(c.codigo), dica: `${c.codigo} — ${c.projeto}\n${fmtDia(a.inicio)} a ${fmtDia(a.fim)}` });
        }
        for (const x of dados.ausencias.filter((a) => a.vagaId === v.id)) {
          barras.push({ inicio: x.inicio, fim: x.fim, rotulo: x.tipo, cor: "bg-gray-300 text-gray-700", dica: `${x.tipo}\n${fmtDia(x.inicio)} a ${fmtDia(x.fim)}`, hachura: true });
        }
        if (!STATUS_QUE_TRABALHAM.includes(v.status)) {
          barras.push({ inicio: inicio, fim: fimJanela, rotulo: v.status, cor: "bg-red-200 text-red-800", dica: `Indisponível: ${v.status}`, hachura: true });
        }
        return { id: v.id, titulo: nomeDe(v), sub: `${eq?.codigo ?? ""} · ${v.cargo}`, barras };
      })
      .sort((a, b) => (a.sub ?? "").localeCompare(b.sub ?? "") || a.titulo.localeCompare(b.titulo));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modo, dados, grupo, encerradas, inicio, fimJanela, ocultarNomes]);

  // cabeçalho: meses e semanas
  const cabecalhoMeses = useMemo(() => {
    const blocos: { rotulo: string; dias: number }[] = [];
    for (let i = 0; i < totalDias; i++) {
      const d = somarDias(inicio, i);
      const rotulo = `${MESES[Number(d.slice(5, 7)) - 1]}/${d.slice(2, 4)}`;
      if (blocos.length && blocos[blocos.length - 1].rotulo === rotulo) blocos[blocos.length - 1].dias++;
      else blocos.push({ rotulo, dias: 1 });
    }
    return blocos;
  }, [inicio, totalDias]);

  const posHoje = diferencaDias(inicio, hoje);
  const grade = {
    backgroundImage: `repeating-linear-gradient(to right, #eef2f3 0, #eef2f3 1px, transparent 1px, transparent ${7 * dw}px)`,
  } as const;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-gray-100 bg-white p-3.5 shadow-sm">
        <div>
          <div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-gray-400">Visão</div>
          <div className="flex overflow-hidden rounded-lg border border-gray-200 text-sm">
            {([
              ["campanha", "Por campanha"],
              ["equipe", "Por equipe"],
              ["pessoa", "Por pessoa"],
            ] as [Modo, string][]).map(([m, r]) => (
              <button key={m} onClick={() => setModo(m)} className={`px-3 py-1.5 ${modo === m ? "bg-brand text-white" : "bg-white text-gray-600 hover:bg-gray-50"}`}>
                {r}
              </button>
            ))}
          </div>
        </div>
        <label className="text-xs text-gray-500">
          Grupo
          <select value={grupo} onChange={(e) => setGrupo(e.target.value)} className="mt-1 block rounded-lg border border-gray-200 px-2.5 py-1.5 text-sm text-ink">
            <option value="">Todos</option>
            {grupos.map((g) => (
              <option key={g}>{g}</option>
            ))}
          </select>
        </label>
        <label className="text-xs text-gray-500">
          Início da linha do tempo
          <input type="date" value={inicio} onChange={(e) => e.target.value && setInicio(segundaDaSemana(e.target.value))} className="mt-1 block rounded-lg border border-gray-200 px-2.5 py-1.5 text-sm text-ink" />
        </label>
        <label className="text-xs text-gray-500">
          Período
          <select value={semanas} onChange={(e) => setSemanas(Number(e.target.value))} className="mt-1 block rounded-lg border border-gray-200 px-2.5 py-1.5 text-sm text-ink">
            <option value={12}>12 semanas</option>
            <option value={26}>26 semanas</option>
            <option value={52}>52 semanas</option>
          </select>
        </label>
        <label className="text-xs text-gray-500">
          Zoom
          <select value={dw} onChange={(e) => setDw(Number(e.target.value))} className="mt-1 block rounded-lg border border-gray-200 px-2.5 py-1.5 text-sm text-ink">
            <option value={22}>Detalhado</option>
            <option value={10}>Normal</option>
            <option value={5}>Compacto</option>
          </select>
        </label>
        <button onClick={() => setInicio(segundaDaSemana(somarDias(hoje, -14)))} className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50">
          Ir para hoje
        </button>
        {modo === "campanha" && (
          <label className="flex items-center gap-1.5 pb-1.5 text-xs text-gray-600">
            <input type="checkbox" checked={encerradas} onChange={(e) => setEncerradas(e.target.checked)} /> mostrar concluídas e canceladas
          </label>
        )}
      </div>

      <div className="overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm">
        <div className="overflow-auto" style={{ maxHeight: "70vh" }}>
          <div style={{ minWidth: LARGURA_ESQUERDA + largura }}>
            <div className="sticky top-0 z-20 flex border-b border-gray-200 bg-gray-50 text-[10px] uppercase tracking-wide text-gray-500">
              <div className="sticky left-0 z-30 shrink-0 border-r border-gray-200 bg-gray-50 px-3 py-2" style={{ width: LARGURA_ESQUERDA }}>
                {modo === "campanha" ? "Campanha e equipe escalada" : modo === "equipe" ? "Equipe-base" : "Profissional"}
              </div>
              <div style={{ width: largura }}>
                <div className="flex">
                  {cabecalhoMeses.map((m, i) => (
                    <div key={i} className="overflow-hidden whitespace-nowrap border-r border-gray-200 px-1.5 py-0.5 font-semibold" style={{ width: m.dias * dw }}>
                      {m.rotulo}
                    </div>
                  ))}
                </div>
                <div className="flex">
                  {Array.from({ length: semanas }, (_, k) => {
                    const d = somarDias(inicio, k * 7);
                    return (
                      <div key={k} className="overflow-hidden whitespace-nowrap border-r border-gray-100 px-1 py-0.5 text-[9px] text-gray-400" style={{ width: 7 * dw }}>
                        {dw >= 10 ? `${d.slice(8, 10)}/${d.slice(5, 7)}` : ""}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {linhas.map((l) => {
              const dist = distribuir(l.barras.filter((b) => b.fim >= inicio && b.inicio <= fimJanela));
              const faixas = Math.max(1, ...dist.map((d) => d.faixa + 1));
              return (
                <div key={l.id} className="flex border-b border-gray-50 hover:bg-gray-50/40">
                  <div className="sticky left-0 z-10 shrink-0 border-r border-gray-100 bg-white px-3 py-1.5" style={{ width: LARGURA_ESQUERDA }}>
                    <div className="truncate text-[13px] font-medium text-ink" title={l.titulo}>{l.titulo}</div>
                    {l.sub && <div className="truncate text-[11px] text-gray-500" title={l.sub}>{l.sub}</div>}
                    {l.extra && <div className="mt-0.5 line-clamp-2 text-[11px] text-gray-400" title={l.extra}>{l.extra}</div>}
                  </div>
                  <div className="relative" style={{ width: largura, height: Math.max(faixas * ALTURA_FAIXA + 8, 44), ...grade }}>
                    {posHoje >= 0 && posHoje < totalDias && <div className="absolute inset-y-0 z-[5] w-px bg-red-500" style={{ left: posHoje * dw + dw / 2 }} title={`Hoje (${fmtDia(hoje)})`} />}
                    {dist.map(({ barra, faixa }, i) => {
                      const ini = barra.inicio < inicio ? inicio : barra.inicio;
                      const fim = barra.fim > fimJanela ? fimJanela : barra.fim;
                      const esq = diferencaDias(inicio, ini) * dw;
                      const larg = (diferencaDias(ini, fim) + 1) * dw;
                      return (
                        <div
                          key={i}
                          title={barra.dica}
                          className={`absolute z-[6] flex items-center overflow-hidden whitespace-nowrap rounded px-1.5 text-[11px] font-medium shadow-sm ${barra.cor.includes("text-") ? barra.cor : `${barra.cor} text-white`}`}
                          style={{
                            left: esq,
                            width: Math.max(larg, 4),
                            top: 4 + faixa * ALTURA_FAIXA,
                            height: ALTURA_FAIXA - 4,
                            ...(barra.hachura ? { backgroundImage: "repeating-linear-gradient(45deg, rgba(255,255,255,.45) 0 4px, transparent 4px 8px)" } : {}),
                          }}
                        >
                          {larg > 40 ? barra.rotulo : ""}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
            {linhas.length === 0 && <div className="px-4 py-10 text-center text-sm text-gray-400">Nada para mostrar nesta visão e neste período.</div>}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-gray-500">
        <span className="flex items-center gap-1.5"><span className="inline-block h-3 w-px bg-red-500" /> hoje</span>
        <span className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-4 rounded bg-gray-300" /> ausência / indisponível</span>
        <span className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-4 rounded bg-teal-500" style={{ backgroundImage: "repeating-linear-gradient(45deg, rgba(255,255,255,.45) 0 4px, transparent 4px 8px)" }} /> campanha sem equipe montada (listrada)</span>
        {modo === "campanha" && Object.entries(COR_STATUS_CAMPANHA).slice(0, 5).map(([s, c]) => (
          <span key={s} className={`rounded-full px-2 py-0.5 ${c}`}>{s}</span>
        ))}
        <span className="ml-auto">Janela: {fmtDia(inicio)} a {fmtDia(fimJanela)}</span>
      </div>
    </div>
  );
}
