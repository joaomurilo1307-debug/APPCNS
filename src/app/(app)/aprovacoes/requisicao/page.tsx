"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

// Requisicoes de estoque pendentes de aprovacao DO USUARIO LOGADO (aprovador do centro de custo, lido na Senior). So' aprova: a Senior nao
// tem porta nativa de reprovar requisicao.
type Req = {
  codigoEmpresa: number; numero: number; sequencia: number; dataEmissao: string; produto: string; descricao: string; complemento: string; unidade: string;
  quantidade: number; preco: number; solicitante: string; centroCusto: string; centroCustoDescricao: string; observacao: string;
};

const moeda = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const qtd = (v: number) => v.toLocaleString("pt-BR", { maximumFractionDigits: 4 });
const chaveDe = (r: Req) => `${r.codigoEmpresa}-${r.numero}-${r.sequencia}`;
async function lerErro(r: Response) {
  return (await r.json().catch(() => ({}))).error ?? `Erro ${r.status}`;
}

export default function AprovacoesRequisicaoPage() {
  const [itens, setItens] = useState<Req[]>([]);
  const [semVinculo, setSemVinculo] = useState(false);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [confirmando, setConfirmando] = useState<Req | null>(null);
  const [enviando, setEnviando] = useState(false);

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro(null);
    try {
      const r = await fetch("/api/aprovacoes-requisicao/pendentes", { cache: "no-store" });
      if (!r.ok) throw new Error(await lerErro(r));
      const d = await r.json();
      setSemVinculo(!!d.semVinculo);
      setItens(d.requisicoes ?? []);
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  async function aprovar() {
    if (!confirmando) return;
    setEnviando(true);
    setErro(null);
    const r = confirmando;
    try {
      const res = await fetch("/api/aprovacoes-requisicao/decidir", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ codigoEmpresa: r.codigoEmpresa, numero: r.numero, sequencia: r.sequencia }),
      });
      if (!res.ok) throw new Error(await lerErro(res));
      setAviso(`Requisição ${r.numero} (item ${r.sequencia}) aprovada na Senior.`);
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setEnviando(false);
      setConfirmando(null);
      carregar();
    }
  }

  return (
    <div className="p-6">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="mb-1 text-xl font-semibold">Aprovações de requisição — pendentes para você</h1>
          <p className="max-w-3xl text-sm text-gray-500">
            Requisições de estoque dos centros de custo em que você é aprovador na Senior (empresa 1). Aprovar grava direto na Senior, em seu nome, com a quantidade pedida.
            Reprovar ainda não está disponível aqui.
          </p>
        </div>
        <div className="flex gap-2 text-xs">
          <button onClick={carregar} disabled={carregando} className="rounded-lg border border-gray-200 px-3 py-1.5 font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50">↻ Atualizar</button>
          <Link href="/aprovacoes/oc" className="rounded-lg border border-gray-200 px-3 py-1.5 font-medium text-gray-600 hover:bg-gray-50">Meu acesso ao ERP (na tela de OCs)</Link>
        </div>
      </div>

      {erro && <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{erro}</p>}
      {aviso && <p className="mb-3 rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">{aviso}</p>}
      {semVinculo && <p className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">Sua conta ainda não está vinculada a um usuário da Senior. Peça a um administrador (Usuários → Acesso).</p>}

      {!semVinculo && (
        <>
          <p className="mb-2 text-xs text-gray-500">{carregando ? "Buscando na Senior..." : `${itens.length} item(ns) aguardando você`}</p>
          <div className="overflow-x-auto rounded-xl border border-gray-100 bg-white shadow-sm">
            <table className="w-full min-w-[900px] border-collapse text-sm">
              <thead className="bg-gray-50 text-left text-xs font-semibold text-gray-500">
                <tr className="[&>th]:px-4 [&>th]:py-3"><th>Req.</th><th>Item</th><th>Emissão</th><th>Produto</th><th className="text-right">Qtd.</th><th className="text-right">Preço</th><th>Solicitante</th><th>Centro de custo</th><th /></tr>
              </thead>
              <tbody>
                {itens.map((r) => (
                  <tr key={chaveDe(r)} className="border-t border-gray-100 align-top [&>td]:px-4 [&>td]:py-3">
                    <td className="font-medium">{r.numero}</td>
                    <td>{r.sequencia}</td>
                    <td className="whitespace-nowrap">{r.dataEmissao}</td>
                    <td className="max-w-[300px]">
                      <span className="font-medium">{r.descricao || r.produto}</span>
                      {r.descricao && r.descricao !== r.produto && <span className="ml-1 text-xs text-gray-400">({r.produto})</span>}
                      {r.complemento && <p className="whitespace-pre-wrap text-xs text-gray-600">{r.complemento}</p>}
                      {r.observacao && <p className="whitespace-pre-wrap text-xs text-gray-500">Obs.: {r.observacao}</p>}
                    </td>
                    <td className="whitespace-nowrap text-right tabular-nums">{qtd(r.quantidade)} {r.unidade}</td>
                    <td className="whitespace-nowrap text-right tabular-nums">{moeda(r.preco)}</td>
                    <td>{r.solicitante}</td>
                    <td className="whitespace-nowrap">{r.centroCusto}{r.centroCustoDescricao ? ` · ${r.centroCustoDescricao}` : ""}</td>
                    <td className="whitespace-nowrap text-right">
                      <button onClick={() => setConfirmando(r)} className="rounded-lg bg-green-600 px-3 py-1 text-xs font-medium text-white hover:bg-green-700">Aprovar</button>
                    </td>
                  </tr>
                ))}
                {!carregando && itens.length === 0 && !erro && (
                  <tr><td colSpan={9} className="px-4 py-6 text-center text-gray-400">Nenhuma requisição aguardando a sua aprovação.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      {confirmando && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-xl bg-white p-5 shadow-xl">
            <p className="mb-1 text-sm font-semibold">Aprovar a requisição {confirmando.numero} (item {confirmando.sequencia})?</p>
            <p className="mb-4 text-xs text-gray-500">{confirmando.descricao || confirmando.produto} · {qtd(confirmando.quantidade)} {confirmando.unidade}. Isso grava na Senior em seu nome e não dá para desfazer por aqui.</p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setConfirmando(null)} disabled={enviando} className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm">Cancelar</button>
              <button onClick={aprovar} disabled={enviando} className="rounded-lg bg-green-600 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50">{enviando ? "Enviando..." : "Aprovar"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
