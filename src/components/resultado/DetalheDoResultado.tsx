"use client";

// Detalhe de UM centro de custo/contrato: ficha (cliente, numero, objeto, vigencia, valor), prazo e valor contratado x receita acumulada, resultado mes a mes (grafico e tabela)
// e a margem e o resultado acumulado. Usado na gaveta da tela da empresa e, sozinho, na aba "Resultado" do contrato.

import { useMemo } from "react";
import BotaoExcel from "@/components/BotaoExcel";
import { Cartao, Kpi } from "@/components/custos/ui";
import { abaDeLinhas } from "@/lib/exportarExcel";
import { mesCurto, mesLongo, moeda, moedaCompacta, percentual } from "@/lib/custos/formato";
import { curvaDoResultado, indicesDoPeriodo, resumir, ROTULO_AREA, type LinhaDoResultado, type Opcoes } from "@/lib/resultado/calculo";
import { BarrasMensais, COR, LegendaMensal, LinhaSimples, type PontoMensal } from "./graficos";

const dataBr = (iso: string | null) => (iso ? iso.split("-").reverse().join("/") : "–");
const dias = (de: string, ate: string) => Math.round((Date.parse(`${ate}T00:00:00Z`) - Date.parse(`${de}T00:00:00Z`)) / 86400000);

function FichaItem({ rotulo, valor }: { rotulo: string; valor: React.ReactNode }) {
  return <div className="min-w-0"><dt className="text-[11px] font-medium uppercase tracking-wide text-gray-400">{rotulo}</dt><dd className="mt-0.5 break-words text-[14px] text-gray-800">{valor || <span className="text-gray-300">não informado</span>}</dd></div>;
}

export default function DetalheDoResultado({ linha, meses, de, ate, opcoes, mesParcial, hoje }: { linha: LinhaDoResultado; meses: string[]; de: string; ate: string; opcoes: Opcoes; mesParcial: string; hoje: string }) {
  const idx = useMemo(() => indicesDoPeriodo(meses, de, ate), [meses, de, ate]);
  const todos = useMemo(() => meses.map((_, i) => i), [meses]);
  const { meses: mensal, acumulado } = useMemo(() => curvaDoResultado(linha, meses.length, opcoes), [linha, meses.length, opcoes]);
  const r = useMemo(() => resumir([linha], idx, opcoes), [linha, idx, opcoes]);
  const noAno = useMemo(() => resumir([linha], todos, { ...opcoes }), [linha, todos, opcoes]);
  const mesesDoPeriodo = idx.map((i) => meses[i]);
  const pontos: PontoMensal[] = idx.map((i) => ({ mes: meses[i], receita: mensal[i].receitaLiquida + (opcoes.liquida ? 0 : mensal[i].retencoes), custo: mensal[i].custo, pessoal: mensal[i].pessoal, resultado: mensal[i].resultado, margem: mensal[i].margem }));
  const acumPeriodo = (() => { let a = 0; return idx.map((i) => (a = Math.round((a + mensal[i].resultado) * 100) / 100)); })();
  const margens = idx.map((i) => mensal[i].margem);
  const comPessoal = opcoes.comPessoal && !!linha.pessoal;

  // prazo do contrato e quanto do valor contratado ja virou receita (receita bruta acumulada desde jan/26, so' o que o sistema leu)
  const prazo = (() => {
    if (!linha.vigenciaInicio || !linha.vigenciaFim) return null;
    const total = Math.max(1, dias(linha.vigenciaInicio, linha.vigenciaFim)), passado = Math.min(total, Math.max(0, dias(linha.vigenciaInicio, hoje)));
    return { pct: passado / total, restam: dias(hoje, linha.vigenciaFim) };
  })();
  const consumido = linha.valorContrato && linha.valorContrato > 0 ? noAno.receita / linha.valorContrato : null;

  const exportar = () => {
    const linhas: (string | number | null)[][] = [["Mês", "Receita bruta", "Retenções", "Receita líquida", "Custos", "Pessoal", "Resultado", "Margem", "Resultado acumulado"]];
    idx.forEach((i, k) => linhas.push([mesCurto(meses[i]), mensal[i].receita, mensal[i].retencoes, mensal[i].receitaLiquida, mensal[i].custo, mensal[i].pessoal, mensal[i].resultado, mensal[i].margem, acumPeriodo[k]]));
    linhas.push(["TOTAL", r.receita, r.retencoes, r.receitaLiquida, r.custo, r.pessoal, r.resultado, r.margem, acumPeriodo[acumPeriodo.length - 1] ?? 0]);
    return [abaDeLinhas("Resultado mês a mês", linhas, `${linha.nome} · CCU ${linha.codccu} · ${mesLongo(de)} a ${mesLongo(ate)} · resultado ${opcoes.liquida ? "sobre a receita líquida (após retenções)" : "sobre a receita bruta"}${comPessoal ? ", com custo de pessoal" : ", antes do custo de pessoal"}`, true, { Margem: "percentual" })];
  };

  return (
    <div className="space-y-5">
      <Cartao titulo="Ficha do contrato" subtitulo={linha.numero ? `Contrato ${linha.numero}` : undefined} acao={<BotaoExcel arquivo={`resultado-${linha.codccu}`} gerar={exportar} />}>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-4 md:grid-cols-4">
          <FichaItem rotulo="Cliente" valor={linha.cliente} />
          <FichaItem rotulo="Área" valor={ROTULO_AREA[linha.area ?? "SEM"]} />
          <FichaItem rotulo="Vigência" valor={linha.vigenciaInicio || linha.vigenciaFim ? `${dataBr(linha.vigenciaInicio)} a ${dataBr(linha.vigenciaFim)}` : null} />
          <FichaItem rotulo="Valor do contrato (ficha)" valor={linha.valorContrato ? moeda(linha.valorContrato) : null} />
        </dl>
        {linha.objeto && <p className="mt-4 max-w-4xl text-[13px] leading-relaxed text-gray-600"><b className="text-gray-700">Objeto: </b>{linha.objeto}</p>}
        {(prazo || consumido !== null) && (
          <div className="mt-5 grid gap-5 md:grid-cols-2">
            {prazo && (
              <div>
                <p className="mb-1 flex justify-between text-xs text-gray-500"><span>Prazo decorrido</span><b className="text-gray-700">{percentual(prazo.pct, 0)} · {prazo.restam >= 0 ? `faltam ${prazo.restam} dias` : `venceu há ${-prazo.restam} dias`}</b></p>
                <div className="h-2.5 rounded-full bg-gray-100"><div className="h-2.5 rounded-full bg-brand" style={{ width: `${Math.min(100, prazo.pct * 100)}%` }} /></div>
              </div>
            )}
            {consumido !== null && (
              <div>
                <p className="mb-1 flex justify-between text-xs text-gray-500"><span>Receita de {mesCurto(meses[0])} a {mesCurto(meses[meses.length - 1])} sobre o valor do contrato</span><b className="text-gray-700">{percentual(consumido, 0)} · {moedaCompacta(noAno.receita)} de {moedaCompacta(linha.valorContrato!)}</b></p>
                <div className="h-2.5 rounded-full bg-gray-100"><div className="h-2.5 rounded-full" style={{ width: `${Math.min(100, consumido * 100)}%`, background: COR.receita }} /></div>
                <p className="mt-1 text-[11px] text-gray-400">Só a receita lida pelo sistema (a partir de {mesCurto(meses[0])}); a ficha não traz o que foi faturado antes.</p>
              </div>
            )}
          </div>
        )}
      </Cartao>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Kpi rotulo="Resultado no período" valor={<span className={r.resultado < 0 ? "text-red-600" : ""}>{moedaCompacta(r.resultado)}</span>} detalhe={r.margem === null ? "sem receita no período" : `margem ${percentual(r.margem, 1)}`} destaque />
        <Kpi rotulo="Receita bruta" valor={moedaCompacta(r.receita)} detalhe={`líquida ${moedaCompacta(r.receitaLiquida)}`} />
        <Kpi rotulo="Retenções" valor={moedaCompacta(r.retencoes)} detalhe={r.receita ? `${percentual(r.retencoes / r.receita, 1)} da receita bruta` : "–"} />
        <Kpi rotulo="Custos" valor={moedaCompacta(r.custo)} detalhe="Senior, pago no período" />
        <Kpi rotulo="Custo de pessoal" valor={comPessoal ? moedaCompacta(r.pessoal) : "–"} detalhe={comPessoal ? "folha CLT, encargos e provisões" : linha.pessoal ? "desligado nas opções" : "acesso restrito"} />
      </div>

      <Cartao titulo="Mês a mês" subtitulo="Receita, custos e resultado de cada mês · o mês em andamento (*) aparece hachurado" acao={<LegendaMensal comPessoal={comPessoal} />}>
        <BarrasMensais pontos={pontos} mesParcial={mesParcial} />
      </Cartao>

      <div className="grid gap-5 lg:grid-cols-2">
        <Cartao titulo="Margem" subtitulo={opcoes.liquida ? "Resultado sobre a receita líquida" : "Resultado sobre a receita bruta"}>
          <LinhaSimples meses={mesesDoPeriodo} valores={margens} formato={(v) => percentual(v, 1)} eixo="pct" rotulo="Margem mês a mês" mesParcial={mesParcial} referencia={r.margem} />
        </Cartao>
        <Cartao titulo="Resultado acumulado" subtitulo={`Somando mês a mês desde ${mesLongo(de)}`}>
          <LinhaSimples meses={mesesDoPeriodo} valores={acumPeriodo} formato={moedaCompacta} eixo="moeda" cor={COR.tinta} rotulo="Resultado acumulado" mesParcial={mesParcial} />
        </Cartao>
      </div>

      <Cartao titulo="Tabela mês a mês" subtitulo="Os mesmos números do gráfico">
        <div className="overflow-x-auto rounded-xl border border-gray-100">
          <table className="w-full min-w-[820px] text-[13px] tabular-nums">
            <thead className="bg-gray-50 text-[11px] uppercase tracking-wide text-gray-500">
              <tr><th className="px-3 py-2 text-left">Mês</th><th className="px-3 py-2 text-right">Receita bruta</th><th className="px-3 py-2 text-right">Retenções</th><th className="px-3 py-2 text-right">Custos</th>{comPessoal && <th className="px-3 py-2 text-right">Pessoal</th>}<th className="px-3 py-2 text-right">Resultado</th><th className="px-3 py-2 text-right">Margem</th><th className="px-3 py-2 text-right">Acumulado</th></tr>
            </thead>
            <tbody>
              {idx.map((i, k) => {
                const m = mensal[i];
                return (
                  <tr key={meses[i]} className="border-t border-gray-100">
                    <td className="px-3 py-1.5 font-medium text-gray-800">{mesLongo(meses[i])}{meses[i] === mesParcial && <span className="ml-1.5 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800">em andamento</span>}</td>
                    <td className="px-3 py-1.5 text-right">{m.receita ? moeda(m.receita) : "–"}</td>
                    <td className="px-3 py-1.5 text-right text-gray-500">{m.retencoes ? moeda(m.retencoes) : "–"}</td>
                    <td className="px-3 py-1.5 text-right">{m.custo ? moeda(m.custo) : "–"}</td>
                    {comPessoal && <td className="px-3 py-1.5 text-right">{m.pessoal ? moeda(m.pessoal) : "–"}</td>}
                    <td className={`px-3 py-1.5 text-right font-semibold ${m.resultado < 0 ? "text-red-600" : "text-gray-900"}`}>{moeda(m.resultado)}</td>
                    <td className="px-3 py-1.5 text-right text-gray-600">{m.margem === null ? "–" : percentual(m.margem, 1)}</td>
                    <td className={`px-3 py-1.5 text-right ${acumPeriodo[k] < 0 ? "text-red-600" : "text-gray-700"}`}>{moeda(acumPeriodo[k])}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-gray-200 bg-gray-50/80 font-semibold text-gray-900">
                <td className="px-3 py-2">Total do período</td><td className="px-3 py-2 text-right">{moeda(r.receita)}</td><td className="px-3 py-2 text-right">{moeda(r.retencoes)}</td><td className="px-3 py-2 text-right">{moeda(r.custo)}</td>{comPessoal && <td className="px-3 py-2 text-right">{moeda(r.pessoal)}</td>}
                <td className={`px-3 py-2 text-right ${r.resultado < 0 ? "text-red-600" : ""}`}>{moeda(r.resultado)}</td><td className="px-3 py-2 text-right">{r.margem === null ? "–" : percentual(r.margem, 1)}</td><td className="px-3 py-2" />
              </tr>
            </tfoot>
          </table>
        </div>
      </Cartao>
    </div>
  );
}

