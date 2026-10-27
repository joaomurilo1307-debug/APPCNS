"use client";

// Matriz de REPRESENTATIVIDADE: quanto cada tipo de custo (e cada conta) pesa, em %, no custo de cada mes. Cada coluna soma 100%: mostra como a
// composicao do custo muda de um mes para o outro. Clicar no tipo abre as contas dele. So' dado do Senior, ja agregado pela tela.

import { Fragment, useState } from "react";
import type { LinhaGrupo } from "@/lib/custos/agregacao";
import { COR_DEMAIS } from "@/lib/custos/agregacao";
import { mesCurto, moeda, moedaCompacta, percentual } from "@/lib/custos/formato";
import { Cartao } from "./ui";

const fundo = (parte: number) => {
  const a = Math.min(0.88, parte * 1.25 + (parte > 0 ? 0.06 : 0));
  return { background: parte > 0 ? `rgba(14,159,148,${a})` : undefined, color: a > 0.5 ? "#fff" : "#1f2937" };
};
const pct = (v: number) => (v < 0.005 ? "<1%" : percentual(v, v < 0.1 ? 1 : 0));

export default function MatrizRepresentatividade({ grupos, meses, totaisMes, totalP, cores, mesCorrente, rotuloTotal = "Custo do mês" }: { grupos: LinhaGrupo[]; meses: string[]; totaisMes: number[]; totalP: number; cores: Map<string, string>; mesCorrente: string; rotuloTotal?: string }) {
  const [abertos, setAbertos] = useState<Set<string>>(new Set(grupos.slice(0, 1).map((g) => g.grupoCodigo)));
  const alternar = (c: string) =>
    setAbertos((a) => {
      const n = new Set(a);
      if (n.has(c)) n.delete(c);
      else n.add(c);
      return n;
    });

  return (
    <Cartao titulo="Representatividade de cada custo" subtitulo="Quanto cada tipo de custo e cada conta pesa, em %, no custo de cada mês (cada coluna soma 100%). Clique no tipo para abrir as contas; passe o mouse para ver o valor em reais.">
      <div className="-mx-5 overflow-x-auto px-5">
        <table className="w-full border-separate border-spacing-0 text-[14px]">
          <thead>
            <tr className="text-left text-[12px] uppercase tracking-wide text-gray-500">
              <th className="sticky left-0 z-10 min-w-[16rem] border-b border-gray-200 bg-white py-2 pr-3 font-semibold">Tipo de custo / conta</th>
              {meses.map((m) => (
                <th key={m} className="border-b border-gray-200 px-0.5 py-2 text-center font-semibold">
                  {mesCurto(m)}
                  {m === mesCorrente ? "*" : ""}
                </th>
              ))}
              <th className="border-b border-gray-200 px-2 py-2 text-center font-semibold">Período</th>
            </tr>
          </thead>
          <tbody>
            {grupos.map((g) => {
              const aberto = abertos.has(g.grupoCodigo);
              const cor = cores.get(g.grupoCodigo) ?? COR_DEMAIS;
              return (
                <Fragment key={g.grupoCodigo}>
                  <tr className="cursor-pointer" onClick={() => alternar(g.grupoCodigo)}>
                    <td className="sticky left-0 z-10 border-b border-gray-100 bg-white py-1.5 pr-3 font-semibold text-gray-800">
                      <span className="mr-1.5 text-xs text-gray-400">{aberto ? "▼" : "▶"}</span>
                      <span className="mr-1.5 inline-block h-2.5 w-2.5 rounded-[3px] align-middle" style={{ background: cor }} />
                      {g.grupoNome}
                    </td>
                    {g.serie.map((v, i) => {
                      const p = totaisMes[i] ? v / totaisMes[i] : 0;
                      return (
                        <td key={i} className="border-b border-gray-100 p-0.5" title={`${g.grupoNome} · ${mesCurto(meses[i])}: ${moeda(v)} (${percentual(p, 1)} do mês)`}>
                          <div className="rounded-md px-1 py-1.5 text-center text-[13px] font-semibold tabular-nums" style={fundo(p)}>
                            {v ? pct(p) : <span className="font-normal text-gray-300">–</span>}
                          </div>
                        </td>
                      );
                    })}
                    <td className="border-b border-gray-100 p-0.5" title={`${moeda(g.total)} no período`}>
                      <div className="rounded-md px-1 py-1.5 text-center text-[13px] font-bold tabular-nums" style={fundo(totalP ? g.total / totalP : 0)}>
                        {pct(totalP ? g.total / totalP : 0)}
                      </div>
                    </td>
                  </tr>
                  {aberto &&
                    g.linhas.slice(0, 12).map((l) => (
                      <tr key={l.conta.contaFinanceira}>
                        <td className="sticky left-0 z-10 border-b border-gray-50 bg-white py-1 pl-8 pr-3 text-gray-600">
                          <span className="block max-w-[15rem] truncate" title={l.conta.contaFinanceira}>
                            {l.conta.contaFinanceira}
                          </span>
                        </td>
                        {l.serie.map((v, i) => {
                          const p = totaisMes[i] ? v / totaisMes[i] : 0;
                          return (
                            <td key={i} className="border-b border-gray-50 p-0.5" title={`${l.conta.contaFinanceira} · ${mesCurto(meses[i])}: ${moeda(v)} (${percentual(p, 1)} do mês)`}>
                              <div className="rounded-md px-1 py-1 text-center text-[12px] tabular-nums" style={fundo(p * 1.6)}>
                                {v ? pct(p) : <span className="text-gray-300">–</span>}
                              </div>
                            </td>
                          );
                        })}
                        <td className="border-b border-gray-50 p-0.5" title={`${moeda(l.total)} no período`}>
                          <div className="rounded-md px-1 py-1 text-center text-[12px] font-semibold tabular-nums" style={fundo((totalP ? l.total / totalP : 0) * 1.6)}>
                            {pct(totalP ? l.total / totalP : 0)}
                          </div>
                        </td>
                      </tr>
                    ))}
                  {aberto && g.linhas.length > 12 && (
                    <tr>
                      <td colSpan={meses.length + 2} className="py-1 pl-8 text-xs text-gray-400">
                        + {g.linhas.length - 12} {g.linhas.length - 12 === 1 ? "conta menor" : "contas menores"} neste tipo
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="font-semibold">
              <td className="sticky left-0 z-10 bg-gray-100 py-2 pr-3 text-gray-800">{rotuloTotal}</td>
              {totaisMes.map((v, i) => (
                <td key={i} className="bg-gray-100 px-0.5 py-2 text-center text-[12px] tabular-nums text-gray-800">
                  {v ? moedaCompacta(v).replace("R$ ", "") : "–"}
                </td>
              ))}
              <td className="bg-gray-100 px-2 py-2 text-center text-[12px] tabular-nums">{moedaCompacta(totalP).replace("R$ ", "")}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </Cartao>
  );
}
