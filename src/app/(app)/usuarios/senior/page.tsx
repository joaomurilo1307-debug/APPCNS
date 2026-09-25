"use client";

import { useEffect, useMemo, useState } from "react";

type Conta = { id: string; name: string; email: string };
type Linha = {
  codigo: string;
  nome: string;
  userId: string | null;
  user: Conta | null;
  atualizadoEm: string;
  aprovaEm?: string[];
};

export default function UsuariosSeniorPage() {
  const [linhas, setLinhas] = useState<Linha[]>([]);
  const [usuarios, setUsuarios] = useState<Conta[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [texto, setTexto] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [busca, setBusca] = useState("");

  async function carregar() {
    const res = await fetch("/api/senior/usuarios");
    if (!res.ok) {
      setErro((await res.json().catch(() => ({}))).error || "Erro ao carregar");
      return;
    }
    const d = await res.json();
    setLinhas(d.linhas);
    setUsuarios(d.usuarios);
  }

  useEffect(() => {
    carregar().finally(() => setLoading(false));
  }, []);

  async function colar() {
    setSalvando(true);
    setMsg(null);
    const res = await fetch("/api/senior/usuarios", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ texto }),
    });
    const d = await res.json().catch(() => ({}));
    setSalvando(false);
    if (!res.ok) {
      setMsg(d.error || "Não foi possível importar.");
      return;
    }
    setMsg(`${d.reconhecidos} usuários importados · ${d.casadosAutomaticamente} casados automaticamente por nome.`);
    setTexto("");
    await carregar();
  }

  async function ajustar(codigo: string, userId: string | null) {
    setLinhas((cur) =>
      cur.map((l) => (l.codigo === codigo ? { ...l, userId, user: usuarios.find((u) => u.id === userId) ?? null } : l))
    );
    await fetch("/api/senior/usuarios", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ codigo, userId }),
    });
  }

  async function remover(codigo: string) {
    if (!confirm(`Remover o código ${codigo} do de-para?`)) return;
    setLinhas((cur) => cur.filter((l) => l.codigo !== codigo));
    await fetch(`/api/senior/usuarios?codigo=${encodeURIComponent(codigo)}`, { method: "DELETE" });
  }

  const filtradas = useMemo(() => {
    const t = busca.trim().toLowerCase();
    if (!t) return linhas;
    return linhas.filter((l) => l.nome.toLowerCase().includes(t) || l.codigo.includes(t));
  }, [linhas, busca]);

  const semConta = linhas.filter((l) => !l.userId).length;

  if (loading) return <div className="p-6 text-sm text-gray-500">Carregando...</div>;
  if (erro) return <div className="p-6 text-sm text-red-600">{erro}</div>;

  return (
    <div className="p-6">
      <h1 className="mb-1 text-xl font-semibold">Usuários do Senior (de-para)</h1>
      <p className="mb-6 max-w-3xl text-sm text-gray-500">
        O Senior identifica quem aprova cada OC só por um código numérico. Cole aqui a lista de usuários do Senior
        (tela Cadastros → Usuários — uma linha por usuário, começando pelo código, ex: <code>177 Fulano da Silva</code>).
        O sistema casa cada um com a conta do consominas-gestao pelo nome; o que não casar, você ajusta na tabela.
        Depois disso, as aprovações de OC passam a mostrar o nome de quem falta aprovar e caem na página pessoal
        dessa pessoa.
      </p>

      <div className="mb-6 rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
        <label className="mb-1 block text-xs font-medium text-gray-500">
          Colar lista do Senior (código + nome por linha)
        </label>
        <textarea
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          rows={6}
          placeholder={"177\tMARIA DAS DORES\n26\tJOAO CARLOS PEREIRA\n109\t..."}
          className="w-full rounded-md border border-gray-300 px-3 py-2 font-mono text-xs focus:border-brand focus:outline-none"
        />
        <div className="mt-2 flex items-center gap-3">
          <button
            onClick={colar}
            disabled={salvando || !texto.trim()}
            className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark disabled:opacity-60"
          >
            {salvando ? "Importando..." : "Importar"}
          </button>
          {msg && <span className="text-sm text-gray-600">{msg}</span>}
        </div>
      </div>

      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-700">
          {linhas.length} usuários · {semConta} sem conta vinculada
        </h2>
        <input
          type="text"
          placeholder="Buscar código ou nome..."
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          className="w-56 rounded-lg border border-gray-200 px-3 py-1.5 text-sm focus:border-brand focus:outline-none"
        />
      </div>

      <datalist id="contas-consominas">
        {usuarios.map((u) => (
          <option key={u.id} value={`${u.name} (${u.email})`} />
        ))}
      </datalist>
      <div className="overflow-x-auto rounded-xl border border-gray-100 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
            <tr>
              <th className="px-4 py-2.5">Código Senior</th>
              <th className="px-4 py-2.5">Nome no Senior</th>
              <th className="px-4 py-2.5">Conta no consominas-gestao</th>
              <th className="px-4 py-2.5"></th>
            </tr>
          </thead>
          <tbody>
            {filtradas.map((l) => (
              <tr key={l.codigo} className="border-t border-gray-50">
                <td className="px-4 py-2 align-top font-mono text-xs">{l.codigo}</td>
                <td className="px-4 py-2 align-top">
                  <div>{l.nome}</div>
                  {l.aprovaEm && l.aprovaEm.length > 0 && (
                    <div className="mt-0.5 text-[11px] text-gray-400">
                      aprova: {l.aprovaEm.join(" · ")}
                    </div>
                  )}
                </td>
                <td className="px-4 py-2 align-top">
                  <input
                    key={`${l.codigo}-${l.userId ?? ""}`}
                    list="contas-consominas"
                    defaultValue={l.user ? `${l.user.name} (${l.user.email})` : ""}
                    placeholder="digite o nome..."
                    onBlur={(e) => {
                      const v = e.target.value.trim();
                      if (!v) return ajustar(l.codigo, null);
                      const achou = usuarios.find((u) => `${u.name} (${u.email})` === v);
                      if (achou && achou.id !== l.userId) ajustar(l.codigo, achou.id);
                      else if (!achou) e.target.value = l.user ? `${l.user.name} (${l.user.email})` : "";
                    }}
                    className={`w-full max-w-xs rounded-md border px-2 py-1 text-sm focus:outline-none ${
                      l.userId ? "border-gray-200" : "border-amber-300 bg-amber-50"
                    }`}
                  />
                </td>
                <td className="px-4 py-2 text-right align-top">
                  <button
                    onClick={() => remover(l.codigo)}
                    className="text-xs text-gray-400 hover:text-rose-600"
                  >
                    remover
                  </button>
                </td>
              </tr>
            ))}
            {filtradas.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-gray-400">
                  {linhas.length === 0 ? "Nenhum usuário importado ainda." : "Nada encontrado."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
