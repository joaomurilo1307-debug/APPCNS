"use client";

import { useEffect, useState } from "react";

type Nota = { chave: string; numero: string; serie: string; emitente: string; valor: number; emissao: string | null; vencimento?: string; dias?: number };
type Titulo = { id: string; numTit: string; fornecedorNome: string; valorAberto: number; vencimento: string; dias: number };
type Alertas = {
  geradoEm: string;
  notasNovas: Nota[];
  notasVencidas: Nota[];
  notasVencendo: Nota[];
  notasLancadas: Nota[];
  titulosVencidos: Titulo[];
  titulosVencendo: Titulo[];
  avisos: string[];
};

const moeda = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const data = (iso: string | null | undefined) => (iso ? iso.slice(0, 10).split("-").reverse().join("/") : "—");
const MAX_LINHAS = 300;

function prazo(dias: number) {
  if (dias < 0) return `vencida há ${-dias} dia(s)`;
  return dias === 0 ? "vence hoje" : `vence em ${dias} dia(s)`;
}

type Tom = "vermelho" | "ambar" | "neutro" | "azul";
const TOM: Record<Tom, { caixa: string; linha: string }> = {
  vermelho: { caixa: "border-red-200 bg-red-50", linha: "bg-red-50 text-red-800" },
  ambar: { caixa: "border-amber-200 bg-amber-50", linha: "bg-amber-50/60 text-amber-900" },
  neutro: { caixa: "border-gray-200 bg-white", linha: "text-gray-600" },
  azul: { caixa: "border-sky-200 bg-sky-50", linha: "text-sky-900" },
};

export default function AlertasFinanceiroPage() {
  const [a, setA] = useState<Alertas | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [aba, setAba] = useState("nf-vencidas");

  function carregar(atualizar = false) {
    setCarregando(true);
    setErro(null);
    fetch(`/api/financeiro/alertas${atualizar ? "?atualizar=1" : ""}`)
      .then(async (r) => {
        const d = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(d.error || "Erro ao carregar");
        return d;
      })
      .then(setA)
      .catch((e) => setErro(e.message))
      .finally(() => setCarregando(false));
  }
  useEffect(() => carregar(), []);

  const tabelaNotas = (lista: Nota[], tom: Tom, comPrazo: boolean) => (
    <table className="w-full text-left text-sm">
      <tbody>
        {lista.slice(0, MAX_LINHAS).map((n) => (
          <tr key={n.chave} className={TOM[tom].linha}>
            <td className="px-2 py-1 font-medium">NF {n.numero}</td>
            <td className="max-w-[320px] truncate px-2 py-1" title={n.emitente}>{n.emitente}</td>
            <td className="px-2 py-1 tabular-nums">emitida {data(n.emissao)}</td>
            {comPrazo && <td className="px-2 py-1 tabular-nums">venc. {data(n.vencimento)} · {prazo(n.dias ?? 0)}</td>}
            <td className="px-2 py-1 text-right tabular-nums">{moeda(n.valor)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
  const tabelaTitulos = (lista: Titulo[], tom: Tom) => (
    <table className="w-full text-left text-sm">
      <tbody>
        {lista.slice(0, MAX_LINHAS).map((t) => (
          <tr key={t.id} className={TOM[tom].linha}>
            <td className="px-2 py-1 font-medium">Título {t.numTit}</td>
            <td className="max-w-[320px] truncate px-2 py-1" title={t.fornecedorNome}>{t.fornecedorNome}</td>
            <td className="px-2 py-1 tabular-nums">venc. {data(t.vencimento)} · {prazo(t.dias)}</td>
            <td className="px-2 py-1 text-right tabular-nums">{moeda(t.valorAberto)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
  const rodape = (n: number) => n > MAX_LINHAS && <p className="mt-2 text-[11px] text-gray-500">Mostrando {MAX_LINHAS} de {n}. Os demais estão na Programação de Pagamento.</p>;

  return (
    <div className="p-6">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Alertas do Financeiro</h1>
          <p className="mt-0.5 text-sm text-gray-500">
            Notas fiscais novas, notas e títulos vencidos (vermelho) ou vencendo em até 3 dias. Nota com vencimento só aparece como
            pendente se ainda <strong>não estiver lançada na Senior</strong>. ADMIN e DIRETOR também recebem no sino.
          </p>
        </div>
        <button onClick={() => carregar(true)} disabled={carregando} className="rounded-lg border border-brand px-3 py-1.5 text-sm font-medium text-brand disabled:opacity-50">
          {carregando ? "Conferindo…" : "↻ Atualizar"}
        </button>
      </div>

      {erro && <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{erro}</p>}
      {a?.avisos.map((v) => <p key={v} className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">{v}</p>)}
      {carregando && !a && <p className="py-8 text-center text-sm text-gray-400">Conferindo notas e títulos (inclui consulta à Senior)…</p>}

      {a && (() => {
        const abas: { id: string; rotulo: string; tom: Tom; total: number; corpo: React.ReactNode }[] = [
          { id: "nf-vencidas", rotulo: "NF vencidas", tom: "vermelho", total: a.notasVencidas.length, corpo: <>{tabelaNotas(a.notasVencidas, "vermelho", true)}{rodape(a.notasVencidas.length)}</> },
          { id: "tit-vencidos", rotulo: "Títulos vencidos", tom: "vermelho", total: a.titulosVencidos.length, corpo: <>{tabelaTitulos(a.titulosVencidos, "vermelho")}{rodape(a.titulosVencidos.length)}</> },
          { id: "nf-vencendo", rotulo: "NF vencendo", tom: "ambar", total: a.notasVencendo.length, corpo: tabelaNotas(a.notasVencendo, "ambar", true) },
          { id: "tit-vencendo", rotulo: "Títulos vencendo", tom: "ambar", total: a.titulosVencendo.length, corpo: <>{tabelaTitulos(a.titulosVencendo, "ambar")}{rodape(a.titulosVencendo.length)}</> },
          { id: "nf-novas", rotulo: "NF novas (7 dias)", tom: "azul", total: a.notasNovas.length, corpo: tabelaNotas(a.notasNovas, "azul", false) },
          { id: "nf-lancadas", rotulo: "Já lançadas na Senior", tom: "neutro", total: a.notasLancadas.length, corpo: tabelaNotas(a.notasLancadas, "neutro", true) },
        ];
        const ativa = abas.find((x) => x.id === aba) ?? abas[0];
        const COR_ABA: Record<Tom, string> = { vermelho: "text-red-700", ambar: "text-amber-700", azul: "text-sky-700", neutro: "text-gray-600" };
        return (
          <>
            <div className="mb-3 flex flex-wrap gap-1 border-b border-gray-200">
              {abas.map((x) => (
                <button
                  key={x.id}
                  onClick={() => setAba(x.id)}
                  className={`-mb-px rounded-t-lg border border-b-0 px-3 py-2 text-sm font-medium ${
                    ativa.id === x.id ? `border-gray-200 bg-white ${COR_ABA[x.tom]}` : "border-transparent text-gray-500 hover:bg-gray-50"
                  }`}
                >
                  {x.rotulo}{" "}
                  <span className={`ml-1 rounded-full px-2 py-0.5 text-[11px] ${x.total && x.tom === "vermelho" ? "bg-red-100 text-red-700" : x.total && x.tom === "ambar" ? "bg-amber-100 text-amber-800" : "bg-gray-100 text-gray-500"}`}>{x.total}</span>
                </button>
              ))}
            </div>
            <section className={`rounded-xl border p-3.5 shadow-sm ${TOM[ativa.tom].caixa}`}>
              {ativa.total ? <div className="overflow-x-auto">{ativa.corpo}</div> : <p className="text-sm text-gray-400">Nada por aqui.</p>}
            </section>
            <p className="mt-3 text-[11px] text-gray-400">Calculado em {new Date(a.geradoEm).toLocaleString("pt-BR")}. O vencimento das notas é o informado no XML da nota.</p>
          </>
        );
      })()}
    </div>
  );
}
