"use client";

import { useEffect, useMemo, useState } from "react";
import { selecaoDoCookie, filtrarTitulosPorSelecao } from "@/lib/areas";

// Pagamentos realizados: titulos pagos (E501TCP, valorAberto = 0) com a OC e a NF ligadas.
// Le a mesma lista (ja em cache) da Programacao de Pagamento e filtra os pagos no navegador.
// Falta a coluna do campo customizado do E501TCP: entra quando o campo for criado no Senior e entrar no sincronismo.

type Pago = {
  id: string;
  numTit: string;
  codFil: string;
  fornecedorNome: string;
  tipo: string;
  dataPagamento: string | null;
  valorOriginal: number;
  ccuNome: string | null;
  codccu?: string | null;
  numNfc: string | null;
  ocRelacionada: { numOcp: string; situacaoLabel: string } | null;
  ocCodFil?: string | null;
  formaPagamento?: string | null;
  pago: boolean;
  valorAberto: number;
};

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const dia = (d: string | null) => (d ? d.slice(0, 10).split("-").reverse().join("/") : "—");
const LIMITE = 500; // linhas desenhadas por vez; o filtro/soma sempre olham a lista inteira

export default function PagamentosRealizadosPage() {
  const [lista, setLista] = useState<Pago[] | null>(null);
  const [erro, setErro] = useState("");
  const [busca, setBusca] = useState("");
  const [de, setDe] = useState("");
  const [ate, setAte] = useState("");
  const [semOc, setSemOc] = useState(false);

  useEffect(() => {
    fetch("/api/titulos-pagar")
      .then(async (r) => {
        if (!r.ok) throw new Error((await r.json().catch(() => null))?.error || `Erro ${r.status}`);
        return r.json();
      })
      .then((data) => {
        const f = filtrarTitulosPorSelecao<Pago>(data.titulos, selecaoDoCookie());
        setLista(f.titulos.filter((t) => t.pago));
      })
      .catch((e) => setErro(e.message));
  }, []);

  const filtrada = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return (lista ?? [])
      .filter((t) => {
        const dp = t.dataPagamento?.slice(0, 10) ?? "";
        if (de && dp < de) return false;
        if (ate && dp > ate) return false;
        if (semOc && t.ocRelacionada) return false;
        if (!q) return true;
        return [t.numTit, t.fornecedorNome, t.numNfc, t.ocRelacionada?.numOcp, t.ccuNome].some((v) => v?.toLowerCase().includes(q));
      })
      .sort((a, b) => (b.dataPagamento ?? "").localeCompare(a.dataPagamento ?? ""));
  }, [lista, busca, de, ate, semOc]);

  const total = useMemo(() => filtrada.reduce((s, t) => s + t.valorOriginal, 0), [filtrada]);

  if (erro) return <div className="p-6 text-red-600">{erro}</div>;
  if (!lista) return <div className="p-6 text-gray-500">Carregando…</div>;

  return (
    <div className="p-6 space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Pagamentos realizados</h1>
        <p className="text-sm text-gray-500">Títulos pagos com a OC e a nota fiscal ligadas.</p>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar título, fornecedor, NF, OC, centro…" className="border rounded px-3 py-2 text-sm w-80" />
        <label className="text-xs text-gray-500">Pago de<input type="date" value={de} onChange={(e) => setDe(e.target.value)} className="block border rounded px-2 py-1.5 text-sm text-gray-900" /></label>
        <label className="text-xs text-gray-500">até<input type="date" value={ate} onChange={(e) => setAte(e.target.value)} className="block border rounded px-2 py-1.5 text-sm text-gray-900" /></label>
        <label className="text-sm flex items-center gap-2 pb-2"><input type="checkbox" checked={semOc} onChange={(e) => setSemOc(e.target.checked)} />Só sem OC</label>
        <div className="ml-auto text-sm text-right">
          <div className="text-gray-500">{filtrada.length} pagamentos</div>
          <div className="font-semibold">{brl(total)}</div>
        </div>
      </div>

      <div className="overflow-x-auto border rounded">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500">
            <tr>
              <th className="px-3 py-2">Pago em</th>
              <th className="px-3 py-2">Fornecedor</th>
              <th className="px-3 py-2">Título</th>
              <th className="px-3 py-2">OC</th>
              <th className="px-3 py-2">Nota fiscal</th>
              <th className="px-3 py-2">Centro de custo</th>
              <th className="px-3 py-2">Forma</th>
              <th className="px-3 py-2 text-right">Valor</th>
            </tr>
          </thead>
          <tbody>
            {filtrada.slice(0, LIMITE).map((t) => (
              <tr key={t.id} className="border-t">
                <td className="px-3 py-2 whitespace-nowrap">{dia(t.dataPagamento)}</td>
                <td className="px-3 py-2">{t.fornecedorNome}</td>
                <td className="px-3 py-2 whitespace-nowrap">{t.numTit} <span className="text-gray-400">{t.tipo} · fil {t.codFil}</span></td>
                <td className="px-3 py-2 whitespace-nowrap">{t.ocRelacionada ? <>{t.ocRelacionada.numOcp} <span className="text-gray-400">{t.ocRelacionada.situacaoLabel}</span></> : "—"}</td>
                <td className="px-3 py-2 whitespace-nowrap">{t.numNfc ?? "—"}</td>
                <td className="px-3 py-2">{t.ccuNome ?? "—"}</td>
                <td className="px-3 py-2">{t.formaPagamento ?? "—"}</td>
                <td className="px-3 py-2 text-right whitespace-nowrap">{brl(t.valorOriginal)}</td>
              </tr>
            ))}
            {filtrada.length === 0 && <tr><td colSpan={8} className="px-3 py-6 text-center text-gray-500">Nenhum pagamento encontrado.</td></tr>}
          </tbody>
        </table>
      </div>
      {filtrada.length > LIMITE && <p className="text-xs text-gray-500">Mostrando os {LIMITE} mais recentes de {filtrada.length}. Use a busca ou as datas para afinar.</p>}
    </div>
  );
}
