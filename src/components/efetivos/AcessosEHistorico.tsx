"use client";

import { useCallback, useEffect, useState } from "react";
import { chamar } from "./comum";
import { Aviso } from "./ui";

type UsuarioAcesso = { id: string; name: string; email: string; role: string; cargo: string | null; nivel: "ADMIN" | "EDITOR" | "DASHBOARD" | null };

export function Acessos() {
  const [lista, setLista] = useState<UsuarioAcesso[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [busca, setBusca] = useState("");
  const [soComAcesso, setSoComAcesso] = useState(true);

  const carregar = useCallback(async () => {
    const r = await chamar<{ usuarios: UsuarioAcesso[] }>("GET", "/api/efetivos/acessos");
    if (!r.ok) return setErro(r.dados.error ?? "Não foi possível carregar os acessos");
    setLista(r.dados.usuarios);
  }, []);
  useEffect(() => {
    carregar();
  }, [carregar]);

  async function mudar(u: UsuarioAcesso, nivel: string) {
    setErro(null);
    const r = await chamar("PUT", "/api/efetivos/acessos", { userId: u.id, nivel: nivel || null });
    if (!r.ok) return setErro(r.dados.error ?? "Não foi possível alterar");
    await carregar();
  }

  const t = busca.trim().toLowerCase();
  const visiveis = (lista ?? []).filter((u) => (!soComAcesso || u.nivel) && (!t || `${u.name} ${u.email}`.toLowerCase().includes(t)));

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
        <h2 className="text-sm font-semibold text-ink">Quem acessa o controle de efetivos</h2>
        <ul className="mt-1 space-y-0.5 text-xs text-gray-500">
          <li><strong className="text-gray-700">Editor</strong> — monta equipes, lança ausências, importa planilha e movimenta veículos (hoje, só o Samuel).</li>
          <li><strong className="text-gray-700">Dashboard</strong> — só consulta painel, campanhas, Gantt e veículos; não vê motivo de ausência.</li>
          <li>Administradores têm acesso total.</li>
        </ul>
      </div>
      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-gray-100 bg-white p-3.5 shadow-sm">
        <label className="text-xs text-gray-500">
          Buscar usuário
          <input value={busca} onChange={(e) => setBusca(e.target.value)} className="mt-1 block rounded-lg border border-gray-200 px-2.5 py-1.5 text-sm text-ink" />
        </label>
        <label className="flex items-center gap-1.5 pb-1.5 text-xs text-gray-600">
          <input type="checkbox" checked={soComAcesso} onChange={(e) => setSoComAcesso(e.target.checked)} /> mostrar só quem já tem acesso
        </label>
        <span className="pb-1.5 text-xs text-gray-400">Para liberar alguém novo, desmarque o filtro e escolha o nível.</span>
      </div>
      {erro && <Aviso tipo="erro">{erro}</Aviso>}
      <div className="overflow-x-auto rounded-xl border border-gray-100 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-[11px] uppercase tracking-wide text-gray-500">
            <tr>
              <th className="px-3 py-2 text-left">Usuário</th>
              <th className="px-3 py-2 text-left">E-mail</th>
              <th className="px-3 py-2 text-left">Nível no controle de efetivos</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {visiveis.map((u) => (
              <tr key={u.id}>
                <td className="px-3 py-2 font-medium text-ink">
                  {u.name}
                  {u.cargo && <div className="text-[11px] font-normal text-gray-400">{u.cargo}</div>}
                </td>
                <td className="px-3 py-2 text-gray-600">{u.email}</td>
                <td className="px-3 py-2">
                  {u.nivel === "ADMIN" ? (
                    <span className="text-xs text-gray-500">Administrador (acesso total)</span>
                  ) : (
                    <select value={u.nivel ?? ""} onChange={(e) => mudar(u, e.target.value)} className="rounded-lg border border-gray-200 px-2 py-1 text-sm text-ink">
                      <option value="">Sem acesso</option>
                      <option value="DASHBOARD">Dashboard (só consulta)</option>
                      <option value="EDITOR">Editor (monta e movimenta)</option>
                    </select>
                  )}
                </td>
              </tr>
            ))}
            {lista && visiveis.length === 0 && (
              <tr>
                <td colSpan={3} className="px-3 py-8 text-center text-gray-400">Ninguém neste filtro.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

type Registro = { id: string; em: string; por: string; acao: string; resumo: string };

export function Historico() {
  const [lista, setLista] = useState<Registro[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [busca, setBusca] = useState("");
  useEffect(() => {
    chamar<{ historico: Registro[] }>("GET", "/api/efetivos/historico").then((r) => {
      if (!r.ok) return setErro(r.dados.error ?? "Não foi possível carregar o histórico");
      setLista(r.dados.historico);
    });
  }, []);
  const t = busca.trim().toLowerCase();
  const visiveis = (lista ?? []).filter((x) => !t || `${x.resumo} ${x.por} ${x.acao}`.toLowerCase().includes(t));
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-gray-100 bg-white p-3.5 shadow-sm">
        <label className="text-xs text-gray-500">
          Buscar no histórico
          <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="campanha, nome, veículo…" className="mt-1 block rounded-lg border border-gray-200 px-2.5 py-1.5 text-sm text-ink" />
        </label>
        <span className="pb-1.5 text-xs text-gray-400">Últimas 300 alterações: quem escalou, moveu, lançou ausência ou importou.</span>
      </div>
      {erro && <Aviso tipo="erro">{erro}</Aviso>}
      <div className="overflow-x-auto rounded-xl border border-gray-100 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-[11px] uppercase tracking-wide text-gray-500">
            <tr>
              <th className="px-3 py-2 text-left">Quando</th>
              <th className="px-3 py-2 text-left">Quem</th>
              <th className="px-3 py-2 text-left">O quê</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {visiveis.map((x) => (
              <tr key={x.id} className="align-top">
                <td className="whitespace-nowrap px-3 py-2 text-gray-500">{new Date(x.em).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}</td>
                <td className="whitespace-nowrap px-3 py-2 text-gray-700">{x.por}</td>
                <td className="px-3 py-2 text-ink">{x.resumo}</td>
              </tr>
            ))}
            {lista && visiveis.length === 0 && (
              <tr>
                <td colSpan={3} className="px-3 py-8 text-center text-gray-400">Nenhum registro.</td>
              </tr>
            )}
            {!lista && !erro && (
              <tr>
                <td colSpan={3} className="px-3 py-8 text-center text-gray-400">Carregando…</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
