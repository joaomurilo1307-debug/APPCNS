"use client";

import { useEffect, useRef, useState } from "react";
import Avatar, { AVATAR_PALETTE } from "@/components/Avatar";

type Me = {
  id: string;
  name: string;
  email: string;
  role: string;
  avatarColor: string;
  avatarUrl: string | null;
  cargo: string | null;
  setor: string | null;
  diretoria: string | null;
  gestorImediato: { id: string; name: string; avatarColor: string; avatarUrl: string | null; cargo: string | null } | null;
};

const roleLabel: Record<string, string> = {
  ADMIN: "Admin",
  DIRETOR: "Diretor",
  GESTOR_PROJETO: "Gestor de Projeto",
  APROVADOR: "Aprovador",
  COLABORADOR: "Colaborador",
  CLIENTE: "Cliente",
  VISUALIZADOR: "Visualizador",
};

function resizeImageToDataUrl(file: File, maxSize = 320, quality = 0.85): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
        const w = Math.round(img.width * scale);
        const h = Math.round(img.height * scale);
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) return reject(new Error("Canvas indisponível"));
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.onerror = reject;
      img.src = reader.result as string;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function MinhaContaPage() {
  const [me, setMe] = useState<Me | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState(false);

  async function load() {
    const res = await fetch("/api/users/me");
    if (res.ok) setMe(await res.json());
  }

  useEffect(() => {
    load();
  }, []);

  async function patchMe(data: { avatarColor?: string; avatarUrl?: string | null }) {
    setSaving(true);
    setError(null);
    const res = await fetch("/api/users/me", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    setSaving(false);
    if (!res.ok) {
      setError("Não foi possível salvar. Tente novamente.");
      return;
    }
    load();
  }

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    setPasswordError(null);
    setPasswordSuccess(false);
    if (newPassword.length < 8) {
      setPasswordError("A nova senha precisa ter pelo menos 8 caracteres.");
      return;
    }
    setSaving(true);
    const res = await fetch("/api/users/me", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ currentPassword, newPassword }),
    });
    setSaving(false);
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      setPasswordError(typeof data?.error === "string" ? data.error : "Não foi possível trocar a senha.");
      return;
    }
    setCurrentPassword("");
    setNewPassword("");
    setPasswordSuccess(true);
  }

  async function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Escolha um arquivo de imagem (jpg, png, etc).");
      return;
    }
    try {
      const dataUrl = await resizeImageToDataUrl(file);
      await patchMe({ avatarUrl: dataUrl });
    } catch {
      setError("Não foi possível processar essa imagem. Tente outra.");
    }
  }

  if (!me) return <p className="text-sm text-gray-400">Carregando...</p>;

  return (
    <div className="max-w-xl">
      <h1 className="mb-1 text-2xl font-semibold">Minha conta</h1>
      <p className="mb-8 text-gray-500">Sua foto de perfil e informações de acesso.</p>

      <div className="mb-6 rounded-xl border border-gray-200 bg-white p-6">
        <div className="mb-4 flex items-center gap-4">
          <Avatar name={me.name} color={me.avatarColor} photoUrl={me.avatarUrl} size={72} />
          <div className="flex flex-col gap-2">
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={saving}
                className="rounded-md bg-brand px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-dark disabled:opacity-50"
              >
                {me.avatarUrl ? "Trocar foto" : "Enviar foto"}
              </button>
              {me.avatarUrl && (
                <button
                  type="button"
                  onClick={() => patchMe({ avatarUrl: null })}
                  disabled={saving}
                  className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-500 hover:bg-gray-50 disabled:opacity-50"
                >
                  Remover
                </button>
              )}
            </div>
            <input ref={fileInputRef} type="file" accept="image/*" onChange={handlePhotoChange} className="hidden" />
            <p className="text-xs text-gray-400">JPG ou PNG. A foto é redimensionada automaticamente.</p>
          </div>
        </div>

        {!me.avatarUrl && (
          <div className="mb-2">
            <p className="mb-2 text-xs text-gray-500">Ou escolha uma cor para suas iniciais:</p>
            <div className="flex items-center gap-1.5">
              {AVATAR_PALETTE.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => patchMe({ avatarColor: c })}
                  className={`h-6 w-6 rounded-full ${me.avatarColor === c ? "ring-2 ring-offset-1 ring-gray-500" : ""}`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>
        )}

        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-6">
        <h2 className="mb-4 text-sm font-semibold">Informações de acesso</h2>
        <dl className="grid grid-cols-2 gap-y-3 text-sm">
          <dt className="text-gray-400">Nome</dt>
          <dd>{me.name}</dd>
          <dt className="text-gray-400">E-mail</dt>
          <dd>{me.email}</dd>
          <dt className="text-gray-400">Papel</dt>
          <dd>{roleLabel[me.role] ?? me.role}</dd>
          <dt className="text-gray-400">Cargo</dt>
          <dd>{me.cargo ?? "—"}</dd>
          <dt className="text-gray-400">Setor</dt>
          <dd>{me.setor ?? "—"}</dd>
          <dt className="text-gray-400">Diretoria</dt>
          <dd>{me.diretoria ?? "—"}</dd>
          <dt className="text-gray-400">Gestor imediato</dt>
          <dd>
            {me.gestorImediato ? (
              <span className="flex items-center gap-2">
                <Avatar name={me.gestorImediato.name} color={me.gestorImediato.avatarColor} photoUrl={me.gestorImediato.avatarUrl} size={20} />
                {me.gestorImediato.name}
              </span>
            ) : (
              "—"
            )}
          </dd>
        </dl>
        <p className="mt-4 text-xs text-gray-400">
          Esses dados são cadastrados pelo administrador. Se algo estiver errado, peça para corrigir em Usuários.
        </p>
      </div>

      <div className="mt-6 rounded-xl border border-gray-200 bg-white p-6">
        <h2 className="mb-4 text-sm font-semibold">Trocar senha</h2>
        <form onSubmit={handleChangePassword} className="flex flex-col gap-3">
          <label className="flex flex-col gap-1 text-xs text-gray-500">
            Senha atual
            <input
              type="password"
              required
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className="w-full max-w-xs rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-gray-500">
            Nova senha (mín. 8 caracteres)
            <input
              type="password"
              required
              minLength={8}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="w-full max-w-xs rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
          </label>
          <div>
            <button
              disabled={saving}
              className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark disabled:opacity-50"
            >
              Salvar nova senha
            </button>
          </div>
          {passwordError && <p className="text-sm text-red-600">{passwordError}</p>}
          {passwordSuccess && <p className="text-sm text-green-600">Senha alterada com sucesso.</p>}
        </form>
      </div>
    </div>
  );
}
