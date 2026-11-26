"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

// OCs pendentes de aprovacao DO USUARIO LOGADO, ao vivo na Senior (web service nativo, com o login ERP da propria pessoa).
type Rateio = { codigoCentroCustos: string; abreviatura: string; percentual: number; valor: number };
type Oc = { codigoEmpresa: number; codigoFilial: number; numero: number; dataEmissao: string; fornecedor: string; solicitante: string; valor: number; observacao: string; rateio: Rateio[]; itens: string[] };

const moeda = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const chaveDe = (o: Oc) => `${o.codigoEmpresa}-${o.codigoFilial}-${o.numero}`;
async function lerErro(r: Response) {
  return (await r.json().catch(() => ({}))).error ?? `Erro ${r.status}`;
}

export default function AprovacoesOcPage() {
  const [ocs, setOcs] = useState<Oc[]>([]);
  const [semCredencial, setSemCredencial] = useState(false);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [aberta, setAberta] = useState<string | null>(null);
  const [confirmando, setConfirmando] = useState<{ oc: Oc; acao: "aprovar" | "reprovar" } | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [editando, setEditando] = useState(false);
  const [usuario, setUsuario] = useState("");
  const [senha, setSenha] = useState("");
  const [temSenha, setTemSenha] = useState(false);

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro(null);
    try {
      const r = await fetch("/api/aprovacoes-oc/pendentes", { cache: "no-store" });
      if (!r.ok) throw new Error(await lerErro(r));
      const d = await r.json();
      setSemCredencial(!!d.semCredencial);
      setOcs(d.ocs ?? []);
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    fetch("/api/aprovacoes-oc/credencial", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d) { setUsuario(d.usuario); setTemSenha(d.temSenha); } })
      .catch(() => {});
    carregar();
  }, [carregar]);

  async function salvarCredencial() {
    setErro(null);
    const r = await fetch("/api/aprovacoes-oc/credencial", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ usuario, senha: senha || undefined }) });
    if (!r.ok) return setErro(await lerErro(r));
    setSenha("");
    setTemSenha(true);
    setEditando(false);
    carregar();
  }

  async function decidir() {
    if (!confirmando) return;
    setEnviando(true);
    setErro(null);
    const { oc, acao } = confirmando;
    try {
      const r = await fetch("/api/aprovacoes-oc/decidir", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ acao, codigoEmpresa: oc.codigoEmpresa, codigoFilial: oc.codigoFilial, numero: oc.numero }),
      });
      if (!r.ok) throw new Error(await lerErro(r));
      setAviso(`OC ${oc.numero} ${acao === "aprovar" ? "aprovada" : "reprovada"} na Senior.`);
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setEnviando(false);
      setConfirmando(null);
      carregar();
    }
  }

  const total = ocs.reduce((s, o) => s + o.valor, 0);
  const formulario = semCredencial || editando;

  return (
    <div className="p-6">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="mb-1 text-xl font-semibold">Aprovações de OC — pendentes para você</h1>
          <p className="max-w-3xl text-sm text-gray-500">
            Lidas ao vivo na Senior com o seu usuário do ERP (empresa 1, filiais 1 e 2). Aprovar ou reprovar aqui grava direto na Senior, em seu nome.
          </p>
        </div>
        <div className="flex gap-2 text-xs">
          <button onClick={carregar} disabled={carregando || semCredencial} className="rounded-lg border border-gray-200 px-3 py-1.5 font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50">↻ Atualizar</button>
          <button onClick={() => setEditando((v) => !v)} className="rounded-lg border border-gray-200 px-3 py-1.5 font-medium text-gray-600 hover:bg-gray-50">Meu acesso ao ERP</button>
          <Link href="/aprovacoes/senior" className="rounded-lg border border-gray-200 px-3 py-1.5 font-medium text-gray-600 hover:bg-gray-50">Painel geral das OCs</Link>
        </div>
      </div>

      {formulario && (
        <div className="mb-5 max-w-md rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
          <p className="mb-2 text-sm font-semibold text-gray-700">Seu acesso ao ERP (Senior)</p>
          <p className="mb-3 text-xs text-gray-500">Fica guardado cifrado e só é usado para listar e decidir as suas OCs. Só você cadastra a sua.</p>
          <label className="mb-2 block text-xs text-gray-500">Usuário do ERP
            <input value={usuario} onChange={(e) => setUsuario(e.target.value)} autoComplete="off" className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-800" />
          </label>
          <label className="mb-3 block text-xs text-gray-500">Senha do ERP {temSenha && "(deixe em branco para manter a atual)"}
            <input type="password" value={senha} onChange={(e) => setSenha(e.target.value)} autoComplete="new-password" className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-800" />
          </label>
          <button onClick={salvarCredencial} disabled={!usuario.trim() || (!senha && !temSenha)} className="rounded-lg bg-brand px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50">Salvar</button>
        </div>
      )}

      {erro && <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{erro}</p>}
      {aviso && <p className="mb-3 rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">{aviso}</p>}

      {!semCredencial && (
        <>
          <p className="mb-2 text-xs text-gray-500">{carregando ? "Buscando na Senior..." : `${ocs.length} OC(s) aguardando você · ${moeda(total)}`}</p>
          <div className="overflow-x-auto rounded-xl border border-gray-100 bg-white shadow-sm">
            <table className="w-full min-w-[820px] border-collapse text-sm">
              <thead className="bg-gray-50 text-left text-xs font-semibold text-gray-500">
                <tr className="[&>th]:px-4 [&>th]:py-3"><th>OC</th><th>Filial</th><th>Emissão</th><th>Fornecedor</th><th>Solicitante</th><th className="text-right">Valor</th><th /></tr>
              </thead>
              <tbody>
                {ocs.map((o) => (
                  <>
                    <tr key={chaveDe(o)} className="cursor-pointer border-t border-gray-100 hover:bg-brand/[0.04] [&>td]:px-4 [&>td]:py-3" onClick={() => setAberta(aberta === chaveDe(o) ? null : chaveDe(o))}>
                      <td className="font-medium">{o.numero}</td>
                      <td>{o.codigoFilial}</td>
                      <td className="whitespace-nowrap">{o.dataEmissao}</td>
                      <td className="max-w-[260px] truncate" title={o.fornecedor}>{o.fornecedor}</td>
                      <td>{o.solicitante}</td>
                      <td className="whitespace-nowrap text-right font-medium tabular-nums">{moeda(o.valor)}</td>
                      <td className="whitespace-nowrap text-right" onClick={(e) => e.stopPropagation()}>
                        <button onClick={() => setConfirmando({ oc: o, acao: "aprovar" })} className="mr-2 rounded-lg bg-green-600 px-3 py-1 text-xs font-medium text-white hover:bg-green-700">Aprovar</button>
                        <button onClick={() => setConfirmando({ oc: o, acao: "reprovar" })} className="rounded-lg border border-red-300 px-3 py-1 text-xs font-medium text-red-700 hover:bg-red-50">Reprovar</button>
                      </td>
                    </tr>
                    {aberta === chaveDe(o) && (
                      <tr key={`${chaveDe(o)}-d`} className="bg-gray-50 text-xs text-gray-600">
                        <td colSpan={7} className="px-4 py-3">
                          {o.observacao && <p className="mb-2 whitespace-pre-wrap"><b>Observação:</b> {o.observacao}</p>}
                          {o.rateio.length > 0 && <p className="mb-1"><b>Rateio:</b> {o.rateio.map((r) => `${r.abreviatura || r.codigoCentroCustos} ${r.percentual}% (${moeda(r.valor)})`).join(" · ")}</p>}
                          {o.itens.length > 0 && <p><b>Itens:</b> {o.itens.join(" · ")}</p>}
                        </td>
                      </tr>
                    )}
                  </>
                ))}
                {!carregando && ocs.length === 0 && !erro && (
                  <tr><td colSpan={7} className="px-4 py-6 text-center text-gray-400">Nenhuma OC aguardando a sua aprovação.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      {confirmando && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-xl bg-white p-5 shadow-xl">
            <p className="mb-1 text-sm font-semibold">{confirmando.acao === "aprovar" ? "Aprovar" : "Reprovar"} a OC {confirmando.oc.numero}?</p>
            <p className="mb-4 text-xs text-gray-500">{confirmando.oc.fornecedor} · {moeda(confirmando.oc.valor)}. Isso grava na Senior em seu nome e não dá para desfazer por aqui.</p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setConfirmando(null)} disabled={enviando} className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm">Cancelar</button>
              <button onClick={decidir} disabled={enviando} className={`rounded-lg px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50 ${confirmando.acao === "aprovar" ? "bg-green-600" : "bg-red-600"}`}>
                {enviando ? "Enviando..." : confirmando.acao === "aprovar" ? "Aprovar" : "Reprovar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
