"use client";

// Tipo de custo x mes: em cada celula, a DIFERENCA entre o realizado do Senior e o previsto no P0 (vermelho = gastou mais que o P0, verde = gastou
// menos, roxo = realizado sem previsao no P0). Clicar num mes leva o comparativo conta a conta para aquele mes. So' meses que ja' tem realizado.
// Reembolsaveis aparecem num grupo so' (conta antiga + contas R do realizado contra as contas R do P0), qualquer que seja o criterio do mes.

import { useMemo } from "react";
import type { ContaDoContrato } from "@/lib/custos/agregacao";
import { mesCurto, mesLongo, moeda, moedaCompacta, percentual } from "@/lib/custos/formato";
import { compararMes, TOLERANCIA } from "@/lib/p0/comparar";
import type { P0Custos } from "@/lib/p0/montar";
import { Cartao } from "@/components/custos/ui";

type Celula = { previsto: number; realizado: number };

function fundo(c: Celula): { background?: string; color?: string } {
  const delta = c.realizado - c.previsto;
  if (Math.abs(c.previsto) < TOLERANCIA && Math.abs(c.realizado) < TOLERANCIA) return {};
  if (Math.abs(c.previsto) < TOLERANCIA) return { background: "rgba(124,58,237,0.16)", color: "#4c1d95" };
  const forca = Math.min(1, Math.abs(delta) / Math.abs(c.previsto));
  const a = 0.1 + forca * 0.5;
  if (delta > 0.005) return { background: `rgba(229,103,95,${a})`, color: forca > 0.55 ? "#7f1d1d" : "#991b1b" };
  if (delta < -0.005) return { background: `rgba(14,159,148,${a})`, color: forca > 0.55 ? "#064e3b" : "#065f46" };
  return { background: "rgba(148,163,184,0.18)", color: "#475569" };
}

export default function TiposDeCustoPorMes({
  p0,
  realizado,
  meses,
  mesCorrente,
  mesSelecionado,
  onMes,
}: {
  p0: P0Custos;
  realizado: ContaDoContrato[];
  /** meses (aaaa-mm) que ja' tem realizado, dentro do P0 */
  meses: string[];
  mesCorrente: string;
  mesSelecionado?: string;
  onMes: (mes: string) => void;
}) {
  const { linhas, totais } = useMemo(() => {
    const periodo = { mesIni: p0.mesIni, mesFim: p0.mesFim };
    const porGrupo = new Map<string, { nome: string; celulas: Celula[] }>();
    const tot: Celula[] = meses.map(() => ({ previsto: 0, realizado: 0 }));
    meses.forEach((mes, i) => {
      const c = compararMes({ p0: p0.contas, realizado, mes, periodo, filtros: { tipo: "todos", grupo: "todos" } });
      for (const g of c.grupos) {
        const reemb = g.grupoCodigo.startsWith("reemb");
        const chave = reemb ? "reemb" : g.grupoCodigo;
        const e = porGrupo.get(chave) ?? { nome: reemb ? "Reembolsáveis" : g.grupoNome, celulas: meses.map(() => ({ previsto: 0, realizado: 0 })) };
        e.celulas[i].previsto += g.previsto;
        e.celulas[i].realizado += g.realizado;
        porGrupo.set(chave, e);
      }
      tot[i] = { previsto: c.previsto, realizado: c.realizado };
    });
    const linhas = Array.from(porGrupo.entries())
      .map(([chave, g]) => ({ chave, ...g, soma: g.celulas.reduce((s, c) => s + c.previsto + c.realizado, 0) }))
      .sort((a, b) => b.soma - a.soma);
    return { linhas, totais: tot };
  }, [p0, realizado, meses]);

  if (meses.length === 0) return null;
  const fechados = (cs: Celula[]) => cs.reduce((acc, c, i) => (meses[i] === mesCorrente ? acc : { previsto: acc.previsto + c.previsto, realizado: acc.realizado + c.realizado }), { previsto: 0, realizado: 0 });

  const texto = (c: Celula) => {
    const d = c.realizado - c.previsto;
    if (Math.abs(c.previsto) < TOLERANCIA && Math.abs(c.realizado) < TOLERANCIA) return "–";
    return `${d > 0.005 ? "+" : d < -0.005 ? "−" : ""}${moedaCompacta(Math.abs(d)).replace("R$ ", "")}`;
  };
  const dica = (nome: string, mes: string, c: Celula) => {
    const d = c.realizado - c.previsto;
    return `${nome} · ${mesLongo(mes)}${mes === mesCorrente ? " (em andamento: só o já pago)" : ""}\nPrevisto no P0: ${moeda(c.previsto)}\nRealizado: ${moeda(c.realizado)}\nDiferença: ${d > 0.005 ? "+" : d < -0.005 ? "−" : ""}${moeda(Math.abs(d))}${Math.abs(c.previsto) >= TOLERANCIA ? ` (${d > 0 ? "+" : d < 0 ? "−" : ""}${percentual(Math.abs(d / c.previsto), 0)})` : " (sem previsão no P0)"}`;
  };

  return (
    <Cartao
      titulo="Tipo de custo × mês: realizado contra o P0"
      subtitulo="Cada célula é o realizado do Senior menos o previsto no P0 · vermelho = gastou mais que o P0, verde = gastou menos, roxo = realizado sem previsão no P0 · clique no mês para ver as contas"
    >
      <div className="-mx-5 overflow-x-auto px-5">
        <table className="w-full min-w-[560px] border-separate border-spacing-y-1 text-[14px]">
          <thead>
            <tr className="text-[12px] uppercase tracking-wide text-gray-500">
              <th className="min-w-[10rem] pb-1 text-left font-semibold">Tipo de custo</th>
              {meses.map((mes) => (
                <th key={mes} className="px-1 pb-1 text-center font-semibold">
                  <button type="button" onClick={() => onMes(mes)} className={`rounded-md px-2 py-1 uppercase tracking-wide transition hover:bg-gray-100 ${mes === mesSelecionado ? "bg-brand/10 text-brand-dark" : ""}`} title={`Ver as contas de ${mesLongo(mes)}`}>
                    {mesCurto(mes)}
                    {mes === mesCorrente ? "*" : ""}
                  </button>
                </th>
              ))}
              <th className="pb-1 pl-2 text-right font-semibold">Meses fechados</th>
            </tr>
          </thead>
          <tbody>
            {linhas.map((l) => {
              const f = fechados(l.celulas);
              return (
                <tr key={l.chave}>
                  <td className="pr-3 font-medium text-gray-800">{l.nome}</td>
                  {l.celulas.map((c, i) => (
                    <td key={meses[i]} className="px-1">
                      <div className="rounded-lg px-2 py-1.5 text-center text-[13px] font-semibold tabular-nums" style={{ ...fundo(c), opacity: meses[i] === mesCorrente ? 0.7 : 1 }} title={dica(l.nome, meses[i], c)}>
                        {texto(c)}
                      </div>
                    </td>
                  ))}
                  <td className="pl-2 text-right">
                    <div className="inline-block min-w-[5.5rem] rounded-lg px-2 py-1.5 text-center text-[13px] font-bold tabular-nums" style={fundo(f)} title={`${l.nome} · meses fechados\nPrevisto no P0: ${moeda(f.previsto)}\nRealizado: ${moeda(f.realizado)}`}>
                      {texto(f)}
                    </div>
                  </td>
                </tr>
              );
            })}
            <tr>
              <td className="pr-3 pt-1 font-bold text-gray-900">Total do contrato</td>
              {totais.map((c, i) => (
                <td key={meses[i]} className="px-1 pt-1">
                  <div className="rounded-lg border border-gray-200 px-2 py-1.5 text-center text-[13px] font-bold tabular-nums" style={{ ...fundo(c), opacity: meses[i] === mesCorrente ? 0.7 : 1 }} title={dica("Total do contrato", meses[i], c)}>
                    {texto(c)}
                  </div>
                </td>
              ))}
              <td className="pl-2 pt-1 text-right">
                {(() => {
                  const f = fechados(totais);
                  return (
                    <div className="inline-block min-w-[5.5rem] rounded-lg border border-gray-200 px-2 py-1.5 text-center text-[13px] font-bold tabular-nums" style={fundo(f)} title={`Total · meses fechados\nPrevisto no P0: ${moeda(f.previsto)}\nRealizado: ${moeda(f.realizado)}`}>
                      {texto(f)}
                    </div>
                  );
                })()}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-gray-500">{mesCorrente && meses.includes(mesCorrente) ? "* Mês em andamento: o realizado é só o que já foi pago, então a diferença ainda vai mudar. " : ""}O mês em andamento não entra na coluna "Meses fechados".</p>
    </Cartao>
  );
}
