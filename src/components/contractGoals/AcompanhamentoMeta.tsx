import type { MetaContrato, PeriodoMeta } from "@/lib/contractGoals/tipos";

const valor = (n: number | null, unidade: string | null) => n === null ? "Sem dado" : unidade === "R$" ? n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : `${n.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}${unidade === "%" ? "%" : unidade ? ` ${unidade}` : ""}`;
const frequencias = { MENSAL: "mensal", TRIMESTRAL: "trimestral", SEMESTRAL: "semestral", ANUAL: "anual" } as const;
const mes = (m?: string | null) => m ? `${m.slice(5, 7)}/${m.slice(0, 4)}` : "o fim do período";
const corNeutra = "bg-gray-50 text-gray-500";

function resultadoDoPeriodo(meta: MetaContrato, p: PeriodoMeta) {
  if (p.state === "FUTURO") return { texto: "Planejado", cor: corNeutra };
  if (p.partial) return { texto: "Intervalo incompleto", cor: corNeutra };
  if (p.state === "ABERTO") return { texto: p.value === null ? "Prévia · aguardando dado" : p.progress === null ? "Prévia em andamento" : `Prévia: ${Math.round(p.progress * 100)}% até o alvo`, cor: "bg-amber-50 text-amber-800" };
  if (p.value === null || p.progress === null) return { texto: "Aguardando avaliação", cor: corNeutra };
  if (p.progress === 1) return { texto: "Alvo alcançado", cor: "bg-emerald-50 text-emerald-800" };
  if (p.progress > 0) return { texto: `Melhorando · ${Math.round(p.progress * 100)}% até o alvo`, cor: "bg-emerald-50 text-emerald-800" };
  if (meta.direction === "MANTER") return { texto: "Fora da faixa", cor: "bg-rose-50 text-rose-800" };
  const base = meta.baselineValue, alvo = meta.targetValue;
  const piorou = base !== null && (meta.direction === "REDUZIR" ? p.value > base : meta.direction === "AUMENTAR" ? p.value < base : meta.direction === "ATINGIR" && alvo !== null ? Math.abs(p.value - alvo) > Math.abs(base - alvo) : false);
  return { texto: piorou ? "Piorou em relação à referência" : "Sem avanço em relação à referência", cor: piorou ? "bg-rose-50 text-rose-800" : "bg-amber-50 text-amber-800" };
}

export default function AcompanhamentoMeta({ meta }: { meta: MetaContrato }) {
  const periodos = meta.evaluation?.periods ?? [];
  if (meta.kind !== "INDICADOR" || meta.evaluationMode !== "PERIODICO") return null;
  const ultimo = periodos[periodos.length - 1];
  const prazoEncerrado = ultimo?.state === "FECHADO" && !ultimo.partial;
  const finalComDado = prazoEncerrado && ultimo.value !== null && ultimo.progress !== null;
  const metaAtingida = finalComDado && ultimo.progress === 1;
  return <section className="space-y-3 rounded-xl border border-gray-100 p-4" aria-label={`Acompanhamento periódico da meta ${meta.title}`}>
    <div className="flex flex-wrap items-center justify-between gap-2"><div><h4 className="text-sm font-semibold text-gray-900">Resultado por período</h4><p className="mt-1 text-xs text-gray-500">Análise {frequencias[meta.frequency as keyof typeof frequencias] ?? "periódica"} · resultado do indicador separado da execução e da aprovação do plano</p></div>{meta.baselinePeriodStart && <span className="rounded-md bg-slate-50 px-2 py-1 text-xs text-gray-500">Referência: {mes(meta.baselinePeriodStart)}{meta.baselinePeriodEnd !== meta.baselinePeriodStart ? ` a ${mes(meta.baselinePeriodEnd)}` : ""}</span>}</div>
    <div className={`rounded-lg border p-3 ${prazoEncerrado ? metaAtingida ? "border-emerald-100 bg-emerald-50/60 text-emerald-900" : "border-amber-100 bg-amber-50/60 text-amber-900" : "border-sky-100 bg-sky-50/40 text-sky-900"}`} aria-label="Avaliação ao final do prazo">
      <p className="text-sm font-medium">{prazoEncerrado ? !finalComDado ? "Avaliação final aguardando medição" : metaAtingida ? "Meta atingida na avaliação final" : "Prazo encerrado · meta não atingida" : `Em acompanhamento até ${mes(meta.periodEnd)}`}</p>
      <p className="mt-1 text-xs leading-relaxed">{prazoEncerrado ? finalComDado ? `Resultado final de ${mes(ultimo.start)}${ultimo.end !== ultimo.start ? ` a ${mes(ultimo.end)}` : ""}: ${valor(ultimo.value, meta.unit)}. Alvo: ${valor(ultimo.target, meta.unit)}.` : "O prazo terminou, mas o último período ainda não possui um resultado disponível para concluir a avaliação." : "O resultado final será avaliado quando o último período estiver encerrado e tiver dados. As melhorias mensais ficam verdes; períodos abertos mostram apenas uma prévia."}</p>
    </div>
    {periodos.length ? <div className="overflow-x-auto"><table className="w-full min-w-[620px] text-left text-sm"><thead><tr className="border-b text-xs text-gray-500"><th className="px-2 py-2 font-medium">Período</th><th className="px-2 py-2 font-medium">Realizado</th><th className="px-2 py-2 font-medium">Alvo</th><th className="px-2 py-2 font-medium">Variação da base</th><th className="px-2 py-2 font-medium">Resultado</th></tr></thead><tbody>{periodos.map((p) => {
      const resultado = resultadoDoPeriodo(meta, p);
      return <tr key={p.period} className="border-b border-gray-50 align-top last:border-0"><td className="px-2 py-3"><span className="font-medium text-gray-800">{p.start === p.end ? p.start : `${p.start} a ${p.end}`}</span><span className={`mt-1 block text-[11px] ${p.state === "ABERTO" ? "text-amber-700" : "text-gray-400"}`}>{p.state === "ABERTO" ? "Em andamento · parcial" : p.state === "FUTURO" ? "Ainda não iniciado" : "Período encerrado"}</span></td><td className="px-2 py-3 tabular-nums text-gray-800">{p.state === "FUTURO" ? "—" : valor(p.value, meta.unit)}{p.error && <p className="mt-1 max-w-64 text-xs text-amber-800">{p.error}</p>}{p.updatedAt && <p className="mt-1 text-[11px] text-gray-400">Fonte: {p.updatedAt.slice(0, 10).split("-").reverse().join("/")}</p>}</td><td className="px-2 py-3 tabular-nums text-gray-600">{valor(p.target, meta.unit)}{meta.direction === "MANTER" && meta.tolerance !== null && meta.tolerance !== undefined && <span className="mt-1 block text-[11px] text-gray-400">± {meta.tolerance}</span>}</td><td className="px-2 py-3 tabular-nums text-gray-600">{p.changePercent === null || p.changePercent === undefined || p.state === "FUTURO" ? "—" : `${p.changePercent > 0 ? "+" : ""}${p.changePercent.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`}</td><td className="px-2 py-3"><span className={`inline-block rounded-md px-2 py-1 text-xs ${resultado.cor}`}>{resultado.texto}</span></td></tr>;
    })}</tbody></table></div> : <p className="rounded-lg bg-gray-50 p-3 text-sm text-gray-500">O acompanhamento aparecerá conforme os períodos configurados e os dados disponíveis.</p>}
  </section>;
}
