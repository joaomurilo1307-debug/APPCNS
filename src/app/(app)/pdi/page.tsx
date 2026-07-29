"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import Avatar from "@/components/Avatar";

type Item = {
  id: string;
  title: string;
  description: string | null;
  status: string;
  dueDate: string | null;
};

type Pdi = {
  id: string;
  period: string | null;
  notes: string | null;
  user: { id: string; name: string; avatarColor: string; avatarUrl: string | null; cargo: string | null };
  gestor: { id: string; name: string };
  items: Item[];
};

type Liderado = { id: string; name: string; avatarColor: string; avatarUrl: string | null; cargo: string | null };

const statusLabel: Record<string, string> = {
  A_FAZER: "A fazer",
  FAZENDO: "Em andamento",
  BLOQUEADO: "Bloqueado",
  FEITO: "Concluído",
};

export default function PdiPage() {
  const { data: session } = useSession();
  const myId = (session?.user as any)?.id;
  const role = (session?.user as any)?.role;
  const isAdminOrDiretor = role === "ADMIN" || role === "DIRETOR";

  const [pdis, setPdis] = useState<Pdi[]>([]);
  const [subordinados, setSubordinados] = useState<Liderado[]>([]);
  const [allPeople, setAllPeople] = useState<Liderado[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [newItemTitle, setNewItemTitle] = useState("");
  const [creatingFor, setCreatingFor] = useState<string | null>(null);
  const [newPeriod, setNewPeriod] = useState("");

  const [showAnyoneForm, setShowAnyoneForm] = useState(false);
  const [anyoneSearch, setAnyoneSearch] = useState("");
  const [anyonePeriod, setAnyonePeriod] = useState("");

  const [editingPeriodId, setEditingPeriodId] = useState<string | null>(null);
  const [editPeriodValue, setEditPeriodValue] = useState("");
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editItemTitle, setEditItemTitle] = useState("");
  const [editItemDescription, setEditItemDescription] = useState("");

  async function load() {
    const res = await fetch("/api/pdi");
    if (res.ok) setPdis(await res.json());
  }

  async function loadSubordinados() {
    const res = await fetch("/api/pdi/manageable");
    if (res.ok) setSubordinados(await res.json());
  }

  async function loadAllPeople() {
    const res = await fetch("/api/organograma");
    if (res.ok) setAllPeople(await res.json());
  }

  useEffect(() => {
    load();
    loadSubordinados();
    if (isAdminOrDiretor) loadAllPeople();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myId]);

  const liderosIds = new Set(subordinados.map((s) => s.id));
  const pdisQueGerencio = pdis.filter((p) => p.gestor.id === myId);
  const meuProprioPdi = pdis.filter((p) => p.user.id === myId);

  // pessoas que tenho PDI como gestor mas que não estão na lista "gerenciável" padrão
  // (ex: admin criando um PDI fora da linha de hierarquia direta)
  const extraPersonIds = Array.from(new Set(pdisQueGerencio.filter((p) => !liderosIds.has(p.user.id)).map((p) => p.user.id)));
  const extraPeople: Liderado[] = extraPersonIds.map((id) => {
    const anyPdi = pdisQueGerencio.find((p) => p.user.id === id)!;
    return { id, name: anyPdi.user.name, avatarColor: anyPdi.user.avatarColor, avatarUrl: anyPdi.user.avatarUrl, cargo: anyPdi.user.cargo };
  });
  const pessoasGerenciadas = [...subordinados, ...extraPeople];

  const anyoneQuery = anyoneSearch.trim().toLowerCase();
  const anyoneResults = anyoneQuery
    ? allPeople.filter((p) => p.id !== myId && p.name.toLowerCase().includes(anyoneQuery)).slice(0, 6)
    : [];

  async function handleCreatePdi(userId: string, period?: string) {
    const res = await fetch("/api/pdi", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, period: period || undefined }),
    });
    if (res.ok) {
      setNewPeriod("");
      setCreatingFor(null);
      load();
    }
    return res.ok;
  }

  async function handleCreatePdiForAnyone(userId: string) {
    const ok = await handleCreatePdi(userId, anyonePeriod);
    if (ok) {
      setAnyoneSearch("");
      setAnyonePeriod("");
      setShowAnyoneForm(false);
    }
  }

  async function handleAddItem(pdiId: string) {
    if (!newItemTitle.trim()) return;
    await fetch(`/api/pdi/${pdiId}/items`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: newItemTitle }),
    });
    setNewItemTitle("");
    load();
  }

  async function handleItemStatus(itemId: string, status: string) {
    await fetch(`/api/pdi-items/${itemId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    load();
  }

  async function handleSavePeriod(pdiId: string) {
    await fetch(`/api/pdi/${pdiId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ period: editPeriodValue || null }),
    });
    setEditingPeriodId(null);
    load();
  }

  function startEditItem(it: Item) {
    setEditingItemId(it.id);
    setEditItemTitle(it.title);
    setEditItemDescription(it.description ?? "");
  }

  async function handleSaveItem(itemId: string) {
    await fetch(`/api/pdi-items/${itemId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: editItemTitle, description: editItemDescription || null }),
    });
    setEditingItemId(null);
    load();
  }

  async function handleDeleteItem(itemId: string) {
    if (!confirm("Excluir esta ação do PDI?")) return;
    await fetch(`/api/pdi-items/${itemId}`, { method: "DELETE" });
    load();
  }

  function PdiCard({ pdi, isGestorView }: { pdi: Pdi; isGestorView: boolean }) {
    const open = openId === pdi.id;
    const done = pdi.items.filter((i) => i.status === "FEITO").length;
    const pct = pdi.items.length ? Math.round((done / pdi.items.length) * 100) : 0;
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-4">
        <button onClick={() => setOpenId(open ? null : pdi.id)} className="flex w-full items-center justify-between text-left">
          <div className="flex items-center gap-2">
            <Avatar name={pdi.user.name} color={pdi.user.avatarColor} photoUrl={pdi.user.avatarUrl} size={28} />
            <div>
              <p className="font-medium">{pdi.user.name}</p>
              <p className="text-xs text-gray-400">{pdi.period || "Sem período definido"} · {pdi.items.length} ação(ões) · {pct}% concluído</p>
            </div>
          </div>
          <span className="text-gray-400">{open ? "▾" : "▸"}</span>
        </button>
        {open && (
          <div className="mt-3 flex flex-col gap-2 border-t border-gray-100 pt-3">
            {isGestorView && (
              <div className="mb-1 flex items-center gap-2 text-xs">
                {editingPeriodId === pdi.id ? (
                  <>
                    <input
                      autoFocus
                      value={editPeriodValue}
                      onChange={(e) => setEditPeriodValue(e.target.value)}
                      placeholder="Período (ex: 2026-S2)"
                      className="w-36 rounded-md border border-gray-300 px-2 py-1"
                    />
                    <button onClick={() => handleSavePeriod(pdi.id)} className="text-brand-dark hover:underline">Salvar</button>
                    <button onClick={() => setEditingPeriodId(null)} className="text-gray-400">Cancelar</button>
                  </>
                ) : (
                  <button
                    onClick={() => {
                      setEditingPeriodId(pdi.id);
                      setEditPeriodValue(pdi.period ?? "");
                    }}
                    className="text-gray-400 hover:text-brand-dark hover:underline"
                  >
                    ✏️ Editar período
                  </button>
                )}
              </div>
            )}
            {pdi.items.map((it) => (
              <div key={it.id} className="rounded-lg bg-gray-50 px-3 py-2 text-sm">
                {editingItemId === it.id ? (
                  <div className="flex flex-col gap-1.5">
                    <input
                      autoFocus
                      value={editItemTitle}
                      onChange={(e) => setEditItemTitle(e.target.value)}
                      className="rounded-md border border-gray-300 px-2 py-1 text-sm"
                    />
                    <textarea
                      value={editItemDescription}
                      onChange={(e) => setEditItemDescription(e.target.value)}
                      placeholder="Descrição (opcional)"
                      className="rounded-md border border-gray-300 px-2 py-1 text-xs"
                      rows={2}
                    />
                    <div className="flex gap-2">
                      <button onClick={() => handleSaveItem(it.id)} className="rounded-md bg-brand px-2 py-1 text-xs text-white hover:bg-brand-dark">
                        Salvar
                      </button>
                      <button onClick={() => setEditingItemId(null)} className="rounded-md border border-gray-300 px-2 py-1 text-xs text-gray-500">
                        Cancelar
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate">{it.title}</p>
                      {it.description && <p className="truncate text-xs text-gray-400">{it.description}</p>}
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <select
                        value={it.status}
                        onChange={(e) => handleItemStatus(it.id, e.target.value)}
                        className="rounded-md border border-gray-300 px-2 py-1 text-xs"
                      >
                        {Object.entries(statusLabel).map(([v, l]) => (
                          <option key={v} value={v}>{l}</option>
                        ))}
                      </select>
                      {isGestorView && (
                        <>
                          <button onClick={() => startEditItem(it)} className="text-gray-400 hover:text-brand-dark" title="Editar">
                            ✏️
                          </button>
                          <button onClick={() => handleDeleteItem(it.id)} className="text-gray-300 hover:text-red-500" title="Excluir">
                            ✕
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))}
            {pdi.items.length === 0 && <p className="text-xs text-gray-400">Nenhuma ação cadastrada ainda.</p>}
            {isGestorView && (
              <div className="mt-1 flex gap-2">
                <input
                  placeholder="Nova ação de desenvolvimento..."
                  value={newItemTitle}
                  onChange={(e) => setNewItemTitle(e.target.value)}
                  className="flex-1 rounded-md border border-gray-300 px-2 py-1 text-sm"
                />
                <button
                  onClick={() => handleAddItem(pdi.id)}
                  className="rounded-md bg-brand px-3 py-1 text-sm text-white hover:bg-brand-dark"
                >
                  Adicionar
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div>
      <h1 className="mb-1 text-2xl font-semibold">PDI — Plano de Desenvolvimento Individual</h1>
      <p className="mb-6 text-sm text-gray-500">Ações de desenvolvimento acordadas entre você e seu gestor.</p>

      {(pessoasGerenciadas.length > 0 || isAdminOrDiretor) && (
        <>
          <h2 className="mb-3 text-sm font-semibold text-gray-600">Seus liderados</h2>

          {isAdminOrDiretor && (
            <div className="mb-4 rounded-xl border border-dashed border-gray-300 bg-white p-4">
              {showAnyoneForm ? (
                <div className="flex flex-col gap-2">
                  <p className="text-xs font-semibold text-gray-500">Criar PDI para qualquer pessoa da empresa</p>
                  <div className="relative">
                    <input
                      autoFocus
                      placeholder="Buscar pessoa por nome..."
                      value={anyoneSearch}
                      onChange={(e) => setAnyoneSearch(e.target.value)}
                      className="w-full rounded-md border border-gray-300 px-2.5 py-1.5 text-sm"
                    />
                    {anyoneResults.length > 0 && (
                      <div className="shadow-elevated absolute left-0 top-9 z-10 w-full rounded-lg border border-gray-100 bg-white p-1">
                        {anyoneResults.map((p) => (
                          <button
                            key={p.id}
                            onClick={() => handleCreatePdiForAnyone(p.id)}
                            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-gray-50"
                          >
                            <Avatar name={p.name} color={p.avatarColor} photoUrl={p.avatarUrl} size={22} />
                            {p.name}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <input
                    placeholder="Período (ex: 2026-S2, opcional)"
                    value={anyonePeriod}
                    onChange={(e) => setAnyonePeriod(e.target.value)}
                    className="w-48 rounded-md border border-gray-300 px-2.5 py-1.5 text-xs"
                  />
                  <button
                    onClick={() => {
                      setShowAnyoneForm(false);
                      setAnyoneSearch("");
                      setAnyonePeriod("");
                    }}
                    className="self-start text-xs text-gray-400 hover:underline"
                  >
                    Cancelar
                  </button>
                </div>
              ) : (
                <button onClick={() => setShowAnyoneForm(true)} className="text-xs font-medium text-brand hover:underline">
                  + Criar PDI para qualquer pessoa
                </button>
              )}
            </div>
          )}

          <div className="mb-8 flex flex-col gap-4">
            {pessoasGerenciadas.map((s) => {
              const pdisDele = pdisQueGerencio.filter((p) => p.user.id === s.id);
              return (
                <div key={s.id} className="flex flex-col gap-2">
                  {pdisDele.map((p) => (
                    <PdiCard key={p.id} pdi={p} isGestorView />
                  ))}
                  {pdisDele.length === 0 && (
                    <div className="flex items-center gap-2 rounded-xl border border-dashed border-gray-300 bg-white p-4 text-sm text-gray-500">
                      <span>{s.name}</span>
                      <span className="text-xs text-gray-400">ainda sem PDI</span>
                    </div>
                  )}
                  {creatingFor === s.id ? (
                    <div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white p-2">
                      <input
                        placeholder="Período (ex: 2026-S2)"
                        value={newPeriod}
                        onChange={(e) => setNewPeriod(e.target.value)}
                        className="w-36 rounded-md border border-gray-300 px-2 py-1 text-xs"
                        autoFocus
                      />
                      <button
                        onClick={() => handleCreatePdi(s.id)}
                        className="rounded-md bg-brand px-3 py-1 text-xs text-white hover:bg-brand-dark"
                      >
                        Criar
                      </button>
                      <button
                        onClick={() => {
                          setCreatingFor(null);
                          setNewPeriod("");
                        }}
                        className="text-xs text-gray-400"
                      >
                        Cancelar
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setCreatingFor(s.id)}
                      className="self-start text-xs font-medium text-brand hover:underline"
                    >
                      + Novo PDI para {s.name}{pdisDele.length > 0 ? " (novo período)" : ""}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}

      <h2 className="mb-3 text-sm font-semibold text-gray-600">Seu PDI</h2>
      <div className="flex flex-col gap-3">
        {meuProprioPdi.map((p) => (
          <PdiCard key={p.id} pdi={p} isGestorView={false} />
        ))}
        {meuProprioPdi.length === 0 && <p className="text-sm text-gray-400">Seu gestor ainda não criou um PDI pra você.</p>}
      </div>
    </div>
  );
}
