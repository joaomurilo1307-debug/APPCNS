"use client";

import { useEffect, useState } from "react";

// Detalhe completo de uma OC pendente do usuario: dados do web service (itens, quantidades, valores, rateios, observacao) +
// niveis de aprovacao e vencimento lidos ao vivo na Senior (/api/aprovacoes-oc/detalhe).
type Rateio = { codigoCentroCustos: string; abreviatura: string; percentual: number; valor: number };
export type ItemOc = { descricao: string; observacao: string; quantidade: number; unidade: string; valorUnitario: number; valorBruto: number; desconto: number; valorLiquido: number; rateio: Rateio[] };
export type OcDetalhe = {
  codigoFilial: number; numero: number; dataEmissao: string; fornecedor: string; solicitante: string; valor: number;
  observacao: string; observacaoMotivo: string; rateio: Rateio[]; itens: ItemOc[];
};
type Nivel = { nivel: number; rotulo: string; status: "aprovado" | "pendente"; aprovadoPor: string | null; aprovadoEm: string | null; podemAprovar: string[] };
type Aprovacao = { vencimento: string | null; niveis: Nivel[]; niveisInformados: boolean; reprovada: boolean };

const moeda = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const qtd = (v: number) => v.toLocaleString("pt-BR", { maximumFractionDigits: 4 });
const dataBr = (iso: string | null) => (iso && /^\d{4}-\d{2}-\d{2}/.test(iso) ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : "—");

export default function DetalheOcModal({ oc, aoFechar, aoDecidir }: { oc: OcDetalhe; aoFechar: () => void; aoDecidir: (acao: "aprovar" | "reprovar") => void }) {
  const [ap, setAp] = useState<Aprovacao | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    fetch(`/api/aprovacoes-oc/detalhe?filial=${oc.codigoFilial}&numero=${oc.numero}`, { cache: "no-store" })
      .then(async (r) => {
        if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? `Erro ${r.status}`);
        return r.json();
      })
      .then((d) => vivo && setAp(d))
      .catch((e) => vivo && setErro(e.message));
    return () => { vivo = false; };
  }, [oc.codigoFilial, oc.numero]);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4" onClick={aoFechar}>
      <div className="my-6 w-full max-w-4xl rounded-xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">OC {oc.numero} · Filial {oc.codigoFilial}</h2>
            <p className="text-sm text-gray-500">{oc.fornecedor}</p>
          </div>
          <button onClick={aoFechar} className="rounded-lg border border-gray-200 px-3 py-1 text-sm text-gray-600 hover:bg-gray-50">Fechar</button>
        </div>

        <dl className="mb-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          <div><dt className="text-xs text-gray-500">Emissão</dt><dd>{oc.dataEmissao || "—"}</dd></div>
          <div><dt className="text-xs text-gray-500">Vencimento</dt><dd>{ap ? dataBr(ap.vencimento) : erro ? "—" : "carregando..."}</dd></div>
          <div><dt className="text-xs text-gray-500">Solicitante</dt><dd>{oc.solicitante || "—"}</dd></div>
          <div><dt className="text-xs text-gray-500">Valor da OC</dt><dd className="font-semibold">{moeda(oc.valor)}</dd></div>
        </dl>

        <section className="mb-4">
          <h3 className="mb-1 text-sm font-semibold text-gray-700">Níveis de aprovação pedidos</h3>
          {erro && <p className="text-xs text-amber-700">Não foi possível ler os níveis: {erro}</p>}
          {!ap && !erro && <p className="text-xs text-gray-400">Lendo na Senior...</p>}
          {ap && !ap.niveisInformados && <p className="text-xs text-gray-500">A Senior não informou os níveis exigidos para esta OC.</p>}
          {ap && ap.niveisInformados && (
            <ul className="space-y-1 text-sm">
              {ap.niveis.map((n) => (
                <li key={n.nivel} className="flex flex-wrap items-center gap-2">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${n.status === "aprovado" ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-800"}`}>
                    {n.status === "aprovado" ? "Aprovado" : "Pendente"}
                  </span>
                  <span className="font-medium">Nível {n.rotulo}</span>
                  <span className="text-xs text-gray-500">
                    {n.status === "aprovado" ? `por ${n.aprovadoPor ?? "—"}${n.aprovadoEm ? ` em ${dataBr(n.aprovadoEm)}` : ""}` : n.podemAprovar.length ? `pode aprovar: ${n.podemAprovar.join(", ")}` : ""}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {ap?.reprovada && <p className="mt-1 text-xs font-medium text-red-600">Há reprovação registrada nesta OC.</p>}
        </section>

        {(oc.observacao || oc.observacaoMotivo) && (
          <section className="mb-4">
            <h3 className="mb-1 text-sm font-semibold text-gray-700">Observação</h3>
            {oc.observacao && <p className="whitespace-pre-wrap text-sm text-gray-700">{oc.observacao}</p>}
            {oc.observacaoMotivo && <p className="mt-1 whitespace-pre-wrap text-xs text-gray-500">Motivo: {oc.observacaoMotivo}</p>}
          </section>
        )}

        <section className="mb-4">
          <h3 className="mb-1 text-sm font-semibold text-gray-700">Rateio por centro de custo</h3>
          {oc.rateio.length === 0 ? <p className="text-xs text-gray-400">Sem rateio informado.</p> : (
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-gray-500"><tr><th>Centro de custo</th><th className="text-right">%</th><th className="text-right">Valor</th></tr></thead>
              <tbody>{oc.rateio.map((r, i) => (
                <tr key={i} className="border-t border-gray-100"><td className="py-1">{r.codigoCentroCustos}{r.abreviatura ? ` · ${r.abreviatura}` : ""}</td><td className="text-right tabular-nums">{r.percentual}%</td><td className="text-right tabular-nums">{moeda(r.valor)}</td></tr>
              ))}</tbody>
            </table>
          )}
        </section>

        <section className="mb-4">
          <h3 className="mb-1 text-sm font-semibold text-gray-700">Itens ({oc.itens.length})</h3>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="text-left text-xs text-gray-500"><tr><th>Descrição</th><th className="text-right">Qtd. pedida</th><th>Un.</th><th className="text-right">Valor unit.</th><th className="text-right">Desconto</th><th className="text-right">Valor do item</th></tr></thead>
              <tbody>{oc.itens.map((it, i) => (
                <tr key={i} className="border-t border-gray-100 align-top">
                  <td className="py-1.5 pr-2">
                    {it.descricao || "—"}
                    {it.observacao && <p className="text-xs text-gray-500">{it.observacao}</p>}
                    {it.rateio.length > 0 && <p className="text-xs text-gray-400">Rateio: {it.rateio.map((r) => `${r.abreviatura || r.codigoCentroCustos} ${r.percentual}%`).join(" · ")}</p>}
                  </td>
                  <td className="text-right tabular-nums">{qtd(it.quantidade)}</td>
                  <td>{it.unidade}</td>
                  <td className="text-right tabular-nums">{moeda(it.valorUnitario)}</td>
                  <td className="text-right tabular-nums">{it.desconto ? moeda(it.desconto) : "—"}</td>
                  <td className="text-right font-medium tabular-nums">{moeda(it.valorLiquido)}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </section>

        <div className="flex justify-end gap-2">
          <button onClick={() => aoDecidir("reprovar")} className="rounded-lg border border-red-300 px-4 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50">Reprovar</button>
          <button onClick={() => aoDecidir("aprovar")} className="rounded-lg bg-green-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-green-700">Aprovar</button>
        </div>
      </div>
    </div>
  );
}
