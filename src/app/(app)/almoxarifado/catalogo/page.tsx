"use client";

import { useEffect, useMemo, useState } from "react";

type Contrato = { id: string; codigo: string; nome: string | null; percentualContingencia: number };
type Regra = { id: string; funcao: string; categoria: string; descricao: string; contrato: { id: string; codigo: string } };
type Produto = { id: string; nome: string; tipo: "EPI" | "EPC" | "FARDAMENTO"; categoria: string | null; ca: string | null; tamanho: string | null; unidade: string; valorUnitario: number | null; ativo: boolean };

function fmtMoney(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export default function CatalogoPage() {
  const [tab, setTab] = useState<"regras" | "produtos" | "parametros">("produtos");
  const [contratos, setContratos] = useState<Contrato[]>([]);

  useEffect(() => {
    fetch("/api/epi/contratos").then((r) => r.json()).then(setContratos).catch(() => {});
  }, []);

  return (
    <div>
      <div className="mb-4 flex gap-2">
        {[
          { id: "produtos", label: "Catálogo de itens" },
          { id: "regras", label: "Regras por função" },
          { id: "parametros", label: "Parâmetros por contrato" },
        ].map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id as any)}
            className={`rounded-lg px-4 py-2 text-sm font-medium ${
              tab === t.id ? "bg-brand text-white" : "bg-gray-100 text-gray-500 hover:bg-gray-200"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "produtos" && <ProdutosTab />}
      {tab === "regras" && <RegrasTab contratos={contratos} />}
      {tab === "parametros" && <ParametrosTab contratos={contratos} onChanged={() => fetch("/api/epi/contratos").then((r) => r.json()).then(setContratos)} />}
    </div>
  );
}

function ProdutosTab() {
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [busca, setBusca] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editando, setEditando] = useState<string | null>(null);
  const [rascunho, setRascunho] = useState("");

  function reload() {
    fetch("/api/epi/produtos").then((r) => r.json()).then(setProdutos).catch(() => {});
  }
  useEffect(reload, []);

  const filtrados = useMemo(
    () => produtos.filter((p) => p.ativo && (!busca || p.nome.toLowerCase().includes(busca.toLowerCase()))),
    [produtos, busca]
  );

  async function salvarValor(id: string) {
    const valor = rascunho.trim() === "" ? null : parseFloat(rascunho.replace(",", "."));
    await fetch(`/api/epi/produtos/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ valorUnitario: valor !== null && !Number.isNaN(valor) ? valor : null }),
    });
    setEditando(null);
    reload();
  }

  async function excluir(id: string) {
    if (!confirm("Remover este item do catálogo? Se já tiver movimentação registrada, ele só é desativado (não some do histórico).")) return;
    await fetch(`/api/epi/produtos/${id}`, { method: "DELETE" });
    reload();
  }

  return (
    <div>
      <div className="mb-4 flex items-center gap-3">
        <input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar item..."
          className="w-64 rounded-lg border border-gray-300 px-3 py-2 text-sm"
        />
        <span className="text-xs text-gray-400">{filtrados.length} itens ativos</span>
        <button
          onClick={() => setShowForm(true)}
          className="ml-auto rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark"
        >
          + Novo item
        </button>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-gray-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-400">
              <th className="px-4 py-3">Item</th>
              <th className="px-4 py-3">Tipo</th>
              <th className="px-4 py-3">CA</th>
              <th className="px-4 py-3">Tamanho</th>
              <th className="px-4 py-3">Unid.</th>
              <th className="px-4 py-3 text-right">Valor unitário</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {filtrados.map((p) => (
              <tr key={p.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/60">
                <td className="px-4 py-2.5 font-medium text-gray-700">{p.nome}</td>
                <td className="px-4 py-2.5">
                  <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">{p.tipo}</span>
                </td>
                <td className="px-4 py-2.5 text-gray-500">{p.ca ?? "—"}</td>
                <td className="px-4 py-2.5 text-gray-500">{p.tamanho ?? "—"}</td>
                <td className="px-4 py-2.5 text-gray-500">{p.unidade}</td>
                <td className="px-4 py-2.5 text-right">
                  {editando === p.id ? (
                    <input
                      autoFocus
                      value={rascunho}
                      onChange={(e) => setRascunho(e.target.value)}
                      onBlur={() => salvarValor(p.id)}
                      onKeyDown={(e) => e.key === "Enter" && salvarValor(p.id)}
                      placeholder="0,00"
                      className="w-24 rounded border border-brand px-1 py-0.5 text-right text-sm"
                    />
                  ) : (
                    <button
                      onClick={() => {
                        setEditando(p.id);
                        setRascunho(p.valorUnitario !== null ? String(p.valorUnitario) : "");
                      }}
                      className="rounded px-1 text-gray-500 underline decoration-dotted hover:text-brand-dark"
                    >
                      {p.valorUnitario !== null ? fmtMoney(p.valorUnitario) : "definir"}
                    </button>
                  )}
                </td>
                <td className="px-4 py-2.5 text-right">
                  <button onClick={() => excluir(p.id)} className="text-xs text-gray-400 hover:text-rose-600">
                    Remover
                  </button>
                </td>
              </tr>
            ))}
            {filtrados.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-sm text-gray-400">
                  Nenhum item encontrado.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {showForm && (
        <NovoProdutoForm
          onClose={() => setShowForm(false)}
          onSaved={() => {
            setShowForm(false);
            reload();
          }}
        />
      )}
    </div>
  );
}

function NovoProdutoForm({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [nome, setNome] = useState("");
  const [tipo, setTipo] = useState<"EPI" | "EPC" | "FARDAMENTO">("EPI");
  const [categoria, setCategoria] = useState("");
  const [ca, setCa] = useState("");
  const [tamanho, setTamanho] = useState("");
  const [unidade, setUnidade] = useState("UNID");
  const [valorUnitario, setValorUnitario] = useState("");
  const [saving, setSaving] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function salvar() {
    if (!nome.trim()) {
      setErro("Informe o nome do item.");
      return;
    }
    setSaving(true);
    setErro(null);
    const valor = valorUnitario.trim() ? parseFloat(valorUnitario.replace(",", ".")) : null;
    const res = await fetch("/api/epi/produtos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        nome: nome.trim(),
        tipo,
        categoria: categoria.trim() || null,
        ca: ca.trim() || null,
        tamanho: tamanho.trim() || null,
        unidade: unidade.trim() || "UNID",
      }),
    });
    setSaving(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setErro(data.error ? JSON.stringify(data.error) : "Erro ao salvar.");
      return;
    }
    if (valor !== null && !Number.isNaN(valor)) {
      const produto = await res.json();
      await fetch(`/api/epi/produtos/${produto.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ valorUnitario: valor }),
      });
    }
    onSaved();
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-elevated" onClick={(e) => e.stopPropagation()}>
        <h3 className="mb-4 text-lg font-semibold text-ink">Novo item do catálogo</h3>

        <label className="mb-3 block text-sm">
          <span className="mb-1 block text-xs font-medium text-gray-500">Nome</span>
          <input value={nome} onChange={(e) => setNome(e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2" />
        </label>

        <label className="mb-3 block text-sm">
          <span className="mb-1 block text-xs font-medium text-gray-500">Tipo</span>
          <select value={tipo} onChange={(e) => setTipo(e.target.value as any)} className="w-full rounded-lg border border-gray-300 px-3 py-2">
            <option value="EPI">EPI</option>
            <option value="EPC">EPC</option>
            <option value="FARDAMENTO">Fardamento</option>
          </select>
        </label>

        <div className="mb-3 grid grid-cols-2 gap-2">
          <label className="block text-sm">
            <span className="mb-1 block text-xs font-medium text-gray-500">CA (opcional)</span>
            <input value={ca} onChange={(e) => setCa(e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2" />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-xs font-medium text-gray-500">Tamanho (opcional)</span>
            <input value={tamanho} onChange={(e) => setTamanho(e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2" />
          </label>
        </div>

        <div className="mb-4 grid grid-cols-2 gap-2">
          <label className="block text-sm">
            <span className="mb-1 block text-xs font-medium text-gray-500">Unidade</span>
            <input value={unidade} onChange={(e) => setUnidade(e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2" />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-xs font-medium text-gray-500">Valor unitário (opcional)</span>
            <input value={valorUnitario} onChange={(e) => setValorUnitario(e.target.value)} placeholder="0,00" className="w-full rounded-lg border border-gray-300 px-3 py-2" />
          </label>
        </div>

        {erro && <p className="mb-3 text-xs text-rose-600">{erro}</p>}

        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-600">
            Cancelar
          </button>
          <button onClick={salvar} disabled={saving} className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-50">
            {saving ? "Salvando..." : "Adicionar ao catálogo"}
          </button>
        </div>
      </div>
    </div>
  );
}

function RegrasTab({ contratos }: { contratos: Contrato[] }) {
  const [regras, setRegras] = useState<Regra[]>([]);
  const [contratoId, setContratoId] = useState("");
  const [funcaoAberta, setFuncaoAberta] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  function reload() {
    const qs = contratoId ? `?contratoId=${contratoId}` : "";
    fetch(`/api/epi/funcao-regras${qs}`).then((r) => r.json()).then(setRegras).catch(() => {});
  }
  useEffect(reload, [contratoId]);

  async function excluir(id: string) {
    if (!confirm("Remover esta regra?")) return;
    await fetch(`/api/epi/funcao-regras/${id}`, { method: "DELETE" });
    reload();
  }

  const porFuncao = useMemo(() => {
    const map = new Map<string, Regra[]>();
    for (const r of regras) {
      const key = `${r.funcao}__${r.contrato.codigo}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(r);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [regras]);

  return (
    <div>
      <p className="mb-4 text-sm text-gray-500">
        Qual EPI cada função usa, por contrato — vem da matriz oficial, mas pode ser editada ou ampliada aqui.
      </p>

      <div className="mb-4 flex items-center gap-3">
        <select value={contratoId} onChange={(e) => setContratoId(e.target.value)} className="rounded-lg border border-gray-300 px-3 py-2 text-sm">
          <option value="">Todos os contratos</option>
          {contratos.map((c) => (
            <option key={c.id} value={c.id}>
              {c.codigo} {c.nome ? `— ${c.nome}` : ""}
            </option>
          ))}
        </select>
        <button
          onClick={() => setShowForm(true)}
          className="ml-auto rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark"
        >
          + Nova regra
        </button>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        {porFuncao.map(([key, items]) => {
          const [funcao, codigo] = key.split("__");
          const aberto = funcaoAberta === key;
          return (
            <div key={key} className="rounded-2xl border border-gray-200 bg-white shadow-sm">
              <button onClick={() => setFuncaoAberta(aberto ? null : key)} className="flex w-full items-center justify-between px-5 py-3 text-left">
                <div>
                  <p className="text-sm font-semibold text-gray-700">{funcao}</p>
                  <p className="text-xs text-gray-400">Contrato {codigo} · {items.length} categorias de EPI</p>
                </div>
                <span className="text-gray-400">{aberto ? "−" : "+"}</span>
              </button>
              {aberto && (
                <div className="space-y-2 border-t border-gray-100 px-5 py-3">
                  {items.map((r) => (
                    <div key={r.id} className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wide text-brand-dark">{r.categoria}</p>
                        <p className="whitespace-pre-line text-xs text-gray-500">{r.descricao}</p>
                      </div>
                      <button onClick={() => excluir(r.id)} className="shrink-0 text-xs text-gray-400 hover:text-rose-600">
                        Remover
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
        {porFuncao.length === 0 && <p className="text-sm text-gray-400">Nenhuma regra importada ainda.</p>}
      </div>

      {showForm && (
        <NovaRegraForm
          contratos={contratos}
          onClose={() => setShowForm(false)}
          onSaved={() => {
            setShowForm(false);
            reload();
          }}
        />
      )}
    </div>
  );
}

function NovaRegraForm({ contratos, onClose, onSaved }: { contratos: Contrato[]; onClose: () => void; onSaved: () => void }) {
  const [contratoId, setContratoId] = useState("");
  const [funcao, setFuncao] = useState("");
  const [categoria, setCategoria] = useState("");
  const [descricao, setDescricao] = useState("");
  const [saving, setSaving] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function salvar() {
    if (!contratoId || !funcao.trim() || !categoria.trim() || !descricao.trim()) {
      setErro("Preencha contrato, função, categoria e descrição.");
      return;
    }
    setSaving(true);
    setErro(null);
    const res = await fetch("/api/epi/funcao-regras", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contratoId, funcao: funcao.trim(), categoria: categoria.trim(), descricao: descricao.trim() }),
    });
    setSaving(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setErro(data.error ? JSON.stringify(data.error) : "Erro ao salvar.");
      return;
    }
    onSaved();
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-elevated" onClick={(e) => e.stopPropagation()}>
        <h3 className="mb-4 text-lg font-semibold text-ink">Nova regra de EPI por função</h3>

        <label className="mb-3 block text-sm">
          <span className="mb-1 block text-xs font-medium text-gray-500">Contrato</span>
          <select value={contratoId} onChange={(e) => setContratoId(e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2">
            <option value="">Selecione...</option>
            {contratos.map((c) => (
              <option key={c.id} value={c.id}>
                {c.codigo} {c.nome ? `— ${c.nome}` : ""}
              </option>
            ))}
          </select>
        </label>

        <label className="mb-3 block text-sm">
          <span className="mb-1 block text-xs font-medium text-gray-500">Função</span>
          <input value={funcao} onChange={(e) => setFuncao(e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2" />
        </label>

        <label className="mb-3 block text-sm">
          <span className="mb-1 block text-xs font-medium text-gray-500">Categoria (parte do corpo)</span>
          <input value={categoria} onChange={(e) => setCategoria(e.target.value)} placeholder="ex: EPI - MÃOS" className="w-full rounded-lg border border-gray-300 px-3 py-2" />
        </label>

        <label className="mb-4 block text-sm">
          <span className="mb-1 block text-xs font-medium text-gray-500">Descrição (itens, com CA se souber)</span>
          <textarea value={descricao} onChange={(e) => setDescricao(e.target.value)} rows={3} className="w-full rounded-lg border border-gray-300 px-3 py-2" />
        </label>

        {erro && <p className="mb-3 text-xs text-rose-600">{erro}</p>}

        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-600">
            Cancelar
          </button>
          <button onClick={salvar} disabled={saving} className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-50">
            {saving ? "Salvando..." : "Adicionar regra"}
          </button>
        </div>
      </div>
    </div>
  );
}

function ParametrosTab({ contratos, onChanged }: { contratos: Contrato[]; onChanged: () => void }) {
  const [editando, setEditando] = useState<string | null>(null);
  const [rascunho, setRascunho] = useState("");

  async function salvar(id: string) {
    const pct = parseFloat(rascunho.replace(",", ".").replace("%", ""));
    if (Number.isNaN(pct)) {
      setEditando(null);
      return;
    }
    await fetch(`/api/epi/contratos/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ percentualContingencia: pct > 1 ? pct / 100 : pct }),
    });
    setEditando(null);
    onChanged();
  }

  return (
    <div className="rounded-2xl border border-gray-200 bg-white shadow-sm">
      <div className="border-b border-gray-100 px-5 py-3">
        <p className="text-sm font-semibold text-gray-700">% de contingência sugerido, por contrato</p>
        <p className="text-xs text-gray-400">
          Referência pra calcular mínimo a partir do efetivo (ex.: 10% = 10 pessoas → mínimo sugerido de 1). O mínimo que
          realmente vale por item continua editável direto na aba Estoque, item por item.
        </p>
      </div>
      <table className="w-full text-sm">
        <tbody>
          {contratos.map((c) => (
            <tr key={c.id} className="border-b border-gray-50 last:border-0">
              <td className="px-5 py-3 font-medium text-gray-700">
                {c.codigo} {c.nome ? `— ${c.nome}` : ""}
              </td>
              <td className="px-5 py-3 text-right">
                {editando === c.id ? (
                  <input
                    autoFocus
                    value={rascunho}
                    onChange={(e) => setRascunho(e.target.value)}
                    onBlur={() => salvar(c.id)}
                    onKeyDown={(e) => e.key === "Enter" && salvar(c.id)}
                    className="w-20 rounded border border-brand px-1 py-0.5 text-right text-sm"
                  />
                ) : (
                  <button
                    onClick={() => {
                      setEditando(c.id);
                      setRascunho(String(Math.round(c.percentualContingencia * 100)));
                    }}
                    className="rounded px-1 text-gray-500 underline decoration-dotted hover:text-brand-dark"
                  >
                    {Math.round(c.percentualContingencia * 100)}%
                  </button>
                )}
              </td>
            </tr>
          ))}
          {contratos.length === 0 && (
            <tr>
              <td className="px-5 py-6 text-center text-sm text-gray-400">Nenhum contrato importado ainda.</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
