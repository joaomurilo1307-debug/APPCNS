"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type Nota = {
  chave: string; numero: string; serie: string; emitente: string; cnpj: string; valor: number; emissao: string | null;
  lido: boolean; vencimentos: string[]; formasPag: string[]; indPag: string | null;
};

// Codigos tPag da NF-e (Nota Tecnica 2020.006).
const FORMA: Record<string, string> = {
  "01": "Dinheiro", "02": "Cheque", "03": "Cartão de crédito", "04": "Cartão de débito", "05": "Crédito loja",
  "10": "Vale alimentação", "11": "Vale refeição", "12": "Vale presente", "13": "Vale combustível",
  "15": "Boleto bancário", "16": "Depósito bancário", "17": "PIX", "18": "Transferência", "19": "Programa de fidelidade",
  "20": "PIX estático", "90": "Sem pagamento", "99": "Outros",
};

const moeda = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const data = (iso: string | null | undefined) => (iso ? iso.slice(0, 10).split("-").reverse().join("/") : "—");

export default function NotasFiscaisPage() {
  const [notas, setNotas] = useState<Nota[]>([]);
  const [pendentes, setPendentes] = useState(0);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [busca, setBusca] = useState("");
  const [de, setDe] = useState("");
  const [ate, setAte] = useState("");
  const anterior = useRef<number | null>(null);

  function carregar(atualizar = false) {
    setCarregando(true);
    setErro(null);
    fetch(`/api/notas-fiscais${atualizar ? "?atualizar=1" : ""}`)
      .then(async (r) => {
        const d = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(d.error || "Erro ao carregar");
        return d;
      })
      .then((d) => { setNotas(d.notas); setPendentes(d.pendentes); })
      .catch((e) => setErro(e.message))
      .finally(() => setCarregando(false));
  }
  useEffect(() => carregar(), []);

  // Notas cujo XML ainda não foi lido: continua lendo enquanto houver progresso (evita laço se alguma nota falhar sempre).
  useEffect(() => {
    if (carregando || erro || pendentes === 0) { anterior.current = null; return; }
    if (anterior.current !== null && pendentes >= anterior.current) return;
    anterior.current = pendentes;
    carregar();
  }, [pendentes, carregando, erro]);

  const filtradas = useMemo(() => {
    const t = busca.trim().toLowerCase();
    const dig = t.replace(/\D/g, "");
    return notas.filter(
      (n) =>
        (!t || n.numero.includes(t) || n.emitente.toLowerCase().includes(t) || (!!dig && n.cnpj.includes(dig))) &&
        (!de || (n.emissao ?? "") >= de) &&
        (!ate || (n.emissao ?? "") <= ate)
    );
  }, [notas, busca, de, ate]);
  const total = filtradas.reduce((s, n) => s + n.valor, 0);

  function formaTexto(n: Nota) {
    if (!n.lido) return "lendo…";
    const f = [...new Set(n.formasPag)].map((c) => FORMA[c] ?? `Código ${c}`);
    return f.length ? f.join(", ") : "—";
  }
  function vencTexto(n: Nota) {
    if (!n.lido) return "lendo…";
    if (n.vencimentos.length) return n.vencimentos.map(data).join(", ");
    return n.indPag === "0" ? "À vista" : "—";
  }

  return (
    <div className="p-6">
      <div className="mb-5">
        <h1 className="text-xl font-semibold">Notas Fiscais recebidas</h1>
        <p className="mt-0.5 text-sm text-gray-500">
          NF-e emitidas contra a Consominas (eDocs X da Senior). Vencimento e forma de pagamento são os informados no XML da nota
          pelo fornecedor; &quot;—&quot; significa que a nota não informa.
        </p>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-gray-100 bg-white p-3.5 shadow-sm">
        <input type="text" placeholder="Nº da nota, fornecedor ou CNPJ…" value={busca} onChange={(e) => setBusca(e.target.value)} className="w-64 rounded-lg border border-gray-200 px-3 py-1.5 text-sm" />
        <span className="text-[11px] font-medium uppercase tracking-wide text-gray-400">Emissão</span>
        <input type="date" value={de} onChange={(e) => setDe(e.target.value)} className="rounded-lg border border-gray-200 px-2 py-1.5 text-sm" />
        <span className="text-sm text-gray-500">até</span>
        <input type="date" value={ate} onChange={(e) => setAte(e.target.value)} className="rounded-lg border border-gray-200 px-2 py-1.5 text-sm" />
        <button onClick={() => { anterior.current = null; carregar(true); }} disabled={carregando} className="ml-auto rounded-lg border border-brand px-3 py-1.5 text-sm font-medium text-brand disabled:opacity-50">
          {carregando ? "Consultando…" : "↻ Atualizar do eDocs"}
        </button>
      </div>

      {erro && <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{erro}</p>}
      {pendentes > 0 && <p className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">Lendo o XML de {pendentes} nota(s) para obter vencimento e forma de pagamento…</p>}

      <div className="overflow-x-auto rounded-xl border border-gray-100 bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="bg-gray-50 text-[11px] uppercase tracking-wide text-gray-400">
            <tr>
              <th className="px-3 py-2">Nº da nota</th>
              <th className="px-3 py-2">Fornecedor</th>
              <th className="px-3 py-2">Emissão</th>
              <th className="px-3 py-2">Vencimento</th>
              <th className="px-3 py-2">Forma de pagamento</th>
              <th className="px-3 py-2 text-right">Valor</th>
            </tr>
          </thead>
          <tbody>
            {filtradas.map((n, i) => (
              <tr key={n.chave} className={i % 2 === 1 ? "bg-gray-50/60" : undefined}>
                <td className="px-3 py-1.5 font-medium text-gray-800" title={`Chave: ${n.chave}`}>
                  {n.numero}
                  {n.serie && <span className="ml-1 text-[10px] text-gray-400">série {n.serie}</span>}
                </td>
                <td className="max-w-[320px] truncate px-3 py-1.5" title={`${n.emitente} — CNPJ ${n.cnpj}`}>{n.emitente}</td>
                <td className="px-3 py-1.5 tabular-nums text-gray-500">{data(n.emissao)}</td>
                <td className="px-3 py-1.5 tabular-nums text-gray-500">{vencTexto(n)}</td>
                <td className="px-3 py-1.5 text-gray-500">{formaTexto(n)}</td>
                <td className="px-3 py-1.5 text-right tabular-nums">{moeda(n.valor)}</td>
              </tr>
            ))}
            {!carregando && filtradas.length === 0 && (
              <tr><td colSpan={6} className="px-3 py-6 text-center text-gray-400">Nenhuma nota encontrada.</td></tr>
            )}
          </tbody>
          {filtradas.length > 0 && (
            <tfoot>
              <tr className="border-t border-gray-100 text-sm font-semibold">
                <td className="px-3 py-2" colSpan={5}>{filtradas.length} nota(s)</td>
                <td className="px-3 py-2 text-right tabular-nums">{moeda(total)}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}
