"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import Avatar from "./Avatar";
import PersonPanel, { Person } from "./PersonPanel";
import { MANUAL_STATUSES, ManualStatus, resolveStatus, statusLabel } from "@/lib/presenceStatus";

type Me = { id: string; name: string; avatarColor: string; avatarUrl: string | null; cargo: string | null; statusManual: string | null };

export default function TopBar() {
  const [me, setMe] = useState<Me | null>(null);
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const [people, setPeople] = useState<Person[]>([]);
  const [search, setSearch] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [openPersonId, setOpenPersonId] = useState<string | null>(null);
  const searchRef = useRef<HTMLDivElement>(null);

  function load() {
    fetch("/api/users/me")
      .then((r) => (r.ok ? r.json() : null))
      .then(setMe)
      .catch(() => {});
  }

  useEffect(() => {
    load();
    fetch("/api/organograma").then((r) => r.json()).then(setPeople).catch(() => {});
  }, []);

  useEffect(() => {
    if (!open) return;
    function onClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open]);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) setSearchOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  async function setStatus(status: ManualStatus | null) {
    setOpen(false);
    setMe((prev) => (prev ? { ...prev, statusManual: status } : prev));
    await fetch("/api/users/me", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ statusManual: status }),
    });
  }

  const q = search.trim().toLowerCase();
  const searchResults = q ? people.filter((p) => p.name.toLowerCase().includes(q)).slice(0, 8) : [];

  if (!me) return <div className="h-14 shrink-0 border-b border-gray-100 bg-white" />;

  const status = resolveStatus(true, me.statusManual);

  return (
    <div className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-gray-100 bg-white px-6">
      <div className="relative w-72" ref={searchRef}>
        <input
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setSearchOpen(true);
          }}
          onFocus={() => setSearchOpen(true)}
          placeholder="🔍 Buscar pessoa..."
          className="w-full rounded-md border border-gray-200 px-3 py-1.5 text-sm"
        />
        {searchOpen && q && (
          <div className="absolute left-0 top-9 z-50 max-h-80 w-full overflow-y-auto rounded-lg border border-gray-200 bg-white p-1 shadow-lg">
            {searchResults.map((p) => (
              <button
                key={p.id}
                onClick={() => {
                  setOpenPersonId(p.id);
                  setSearchOpen(false);
                  setSearch("");
                }}
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-gray-50"
              >
                <Avatar name={p.name} color={p.avatarColor} photoUrl={p.avatarUrl} size={24} />
                <span className="min-w-0 flex-1 truncate">{p.name}</span>
                {p.nucleo && <span className="shrink-0 text-xs text-gray-400">{p.nucleo.name}</span>}
              </button>
            ))}
            {searchResults.length === 0 && <p className="p-2 text-xs text-gray-400">Ninguém encontrado.</p>}
          </div>
        )}
      </div>

      <div className="flex items-center gap-2">
        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setOpen((v) => !v)}
            title="Definir status"
            className="flex items-center gap-1.5 rounded-full border border-gray-200 px-2.5 py-1 text-xs text-gray-600 hover:bg-gray-50"
          >
            <span className={`h-2.5 w-2.5 rounded-full ${status.color}`} />
            {status.label}
          </button>
          {open && (
            <div className="absolute right-0 top-9 z-50 w-44 rounded-lg border border-gray-200 bg-white p-1 shadow-lg">
              {MANUAL_STATUSES.map((s) => (
                <button
                  key={s}
                  onClick={() => setStatus(s)}
                  className={`flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-xs hover:bg-gray-50 ${
                    me.statusManual === s ? "bg-brand/10 text-brand-dark" : ""
                  }`}
                >
                  <span className={`h-2.5 w-2.5 rounded-full ${resolveStatus(true, s).color}`} />
                  {statusLabel[s]}
                </button>
              ))}
              <div className="my-1 border-t border-gray-100" />
              <button
                onClick={() => setStatus(null)}
                className={`flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-xs hover:bg-gray-50 ${
                  !me.statusManual ? "bg-brand/10 text-brand-dark" : ""
                }`}
              >
                <span className="h-2.5 w-2.5 rounded-full bg-green-500" />
                Automático (online/offline)
              </button>
            </div>
          )}
        </div>
        <Link href="/minha-conta" className="flex items-center gap-2 rounded-full px-2 py-1 hover:bg-gray-50">
          <div className="text-right">
            <p className="text-sm font-medium leading-tight">{me.name}</p>
            {me.cargo && <p className="text-xs leading-tight text-gray-400">{me.cargo}</p>}
          </div>
          <Avatar name={me.name} color={me.avatarColor} photoUrl={me.avatarUrl} size={34} />
        </Link>
      </div>

      {openPersonId && (
        <PersonPanel personId={openPersonId} onNavigate={setOpenPersonId} onClose={() => setOpenPersonId(null)} />
      )}
    </div>
  );
}
