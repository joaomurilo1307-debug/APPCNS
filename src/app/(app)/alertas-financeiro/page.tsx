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

function Secao({ titulo, tom, total, children, vazio }: { titulo: string; tom: Tom; total?: number; children: React.ReactNode; vazio: boolean }) {
  return (
    <section className={`mb-4 rounded-xl border p-3.5 shadow-sm ${TOM[tom].caixa}`}>
      <h2 className="mb-2 text-sm font-semibold">
        {titulo} <span className="font-normal text-gray-500">({total ?? 0})</span>
      </h2>
      {vazio ? <p className="text-sm text-gray-400">Nada por aqui.</p> : <div className="overflow-x-auto">{children}</div>}
    </section>
  );
}

export default function AlertasFinanceiroPage() {
  const [a, setA] = useState<Alertas | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);

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

      {a && (
        <>
          <Secao titulo="Notas fiscais vencidas e não lançadas na Senior" tom="vermelho" total={a.notasVencidas.length} vazio={!a.notasVencidas.length}>
            {tabelaNotas(a.notasVencidas, "vermelho", true)}
            {rodape(a.notasVencidas.length)}
          </Secao>
          <Secao titulo="Títulos a pagar vencidos" tom="vermelho" total={a.titulosVencidos.length} vazio={!a.titulosVencidos.length}>
            {tabelaTitulos(a.titulosVencidos, "vermelho")}
            {rodape(a.titulosVencidos.length)}
          </Secao>
          <Secao titulo="Notas fiscais vencendo em até 3 dias (não lançadas na Senior)" tom="ambar" total={a.notasVencendo.length} vazio={!a.notasVencendo.length}>
            {tabelaNotas(a.notasVencendo, "ambar", true)}
          </Secao>
          <Secao titulo="Títulos a pagar vencendo em até 3 dias" tom="ambar" total={a.titulosVencendo.length} vazio={!a.titulosVencendo.length}>
            {tabelaTitulos(a.titulosVencendo, "ambar")}
            {rodape(a.titulosVencendo.length)}
          </Secao>
          <Secao titulo="Notas fiscais recebidas nos últimos 7 dias" tom="azul" total={a.notasNovas.length} vazio={!a.notasNovas.length}>
            {tabelaNotas(a.notasNovas, "azul", false)}
          </Secao>
          <Secao titulo="Notas com vencimento próximo/vencido, mas já lançadas na Senior (sem alerta)" tom="neutro" total={a.notasLancadas.length} vazio={!a.notasLancadas.length}>
            {tabelaNotas(a.notasLancadas, "neutro", true)}
          </Secao>
          <p className="text-[11px] text-gray-400">Calculado em {new Date(a.geradoEm).toLocaleString("pt-BR")}. O vencimento das notas é o informado no XML (só notas já lidas em Notas Fiscais recebidas entram).</p>
        </>
      )}
    </div>
  );
}
