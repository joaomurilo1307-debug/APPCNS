"use client";

import { useEffect, useState } from "react";

type FolderT = { id: string; name: string; parentId: string | null };
type FileT = {
  id: string;
  fileName: string;
  fileSize: number;
  folderId: string | null;
  uploadedAt: string;
  uploader: { id: string; name: string };
};

function fmtSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

type Scope = { type: "project" | "team"; id: string };

export default function FilesPanel({ scope, canManage }: { scope: Scope; canManage?: boolean }) {
  const basePath = scope.type === "project" ? `/api/projects/${scope.id}` : `/api/teams/${scope.id}`;
  const [folders, setFolders] = useState<FolderT[]>([]);
  const [files, setFiles] = useState<FileT[]>([]);
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");

  async function load() {
    const [fRes, filesRes] = await Promise.all([
      fetch(`${basePath}/folders`),
      fetch(`${basePath}/files`),
    ]);
    if (fRes.ok) setFolders(await fRes.json());
    if (filesRes.ok) setFiles(await filesRes.json());
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope.type, scope.id]);

  const childFolders = folders.filter((f) => f.parentId === currentFolderId);
  const childFiles = files.filter((f) => f.folderId === currentFolderId);

  function breadcrumb() {
    const chain: FolderT[] = [];
    let cur = currentFolderId;
    while (cur) {
      const f = folders.find((x) => x.id === cur);
      if (!f) break;
      chain.unshift(f);
      cur = f.parentId;
    }
    return chain;
  }

  async function handleCreateFolder(e: React.FormEvent) {
    e.preventDefault();
    if (!newFolderName.trim()) return;
    await fetch(`${basePath}/folders`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newFolderName, parentId: currentFolderId }),
    });
    setNewFolderName("");
    setShowNewFolder(false);
    load();
  }

  async function handleDeleteFolder(id: string) {
    if (!confirm("Excluir esta pasta e tudo dentro dela (subpastas e arquivos)? Isso não pode ser desfeito.")) return;
    await fetch(`/api/folders/${id}`, { method: "DELETE" });
    if (currentFolderId === id) setCurrentFolderId(null);
    load();
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const fd = new FormData();
    fd.append("file", file);
    if (currentFolderId) fd.append("folderId", currentFolderId);
    const res = await fetch(`${basePath}/files`, { method: "POST", body: fd });
    setUploading(false);
    e.target.value = "";
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      alert(data?.error ?? "Não foi possível enviar o arquivo.");
      return;
    }
    load();
  }

  async function handleDeleteFile(id: string) {
    if (!confirm("Excluir este arquivo? Isso não pode ser desfeito.")) return;
    await fetch(`/api/attachments/${id}`, { method: "DELETE" });
    load();
  }

  if (loading) return <p className="text-sm text-gray-400">Carregando...</p>;

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1 text-sm text-gray-500">
          <button
            onClick={() => setCurrentFolderId(null)}
            className={`rounded-md px-2 py-1 ${currentFolderId === null ? "font-semibold text-gray-800" : "hover:bg-gray-100"}`}
          >
            📁 Arquivos
          </button>
          {breadcrumb().map((f) => (
            <span key={f.id} className="flex items-center gap-1">
              <span className="text-gray-300">/</span>
              <button
                onClick={() => setCurrentFolderId(f.id)}
                className={`rounded-md px-2 py-1 ${currentFolderId === f.id ? "font-semibold text-gray-800" : "hover:bg-gray-100"}`}
              >
                {f.name}
              </button>
            </span>
          ))}
        </div>
        {canManage && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowNewFolder((v) => !v)}
              className="rounded-md border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50"
            >
              + Nova pasta
            </button>
            <label className={`cursor-pointer rounded-md bg-brand px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-dark ${uploading ? "opacity-60" : ""}`}>
              {uploading ? "Enviando..." : "+ Enviar arquivo"}
              <input type="file" className="hidden" onChange={handleUpload} disabled={uploading} />
            </label>
          </div>
        )}
      </div>

      {showNewFolder && (
        <form onSubmit={handleCreateFolder} className="mb-3 flex items-center gap-2">
          <input
            autoFocus
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
            placeholder="Nome da pasta"
            className="rounded-md border border-gray-300 px-3 py-1.5 text-sm"
          />
          <button className="rounded-md bg-brand px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-dark">Criar</button>
          <button type="button" onClick={() => setShowNewFolder(false)} className="text-sm text-gray-400 hover:text-gray-600">
            Cancelar
          </button>
        </form>
      )}

      {childFolders.length === 0 && childFiles.length === 0 ? (
        <p className="rounded-xl border border-dashed border-gray-200 bg-gray-50/50 py-10 text-center text-sm text-gray-400">
          Pasta vazia.
        </p>
      ) : (
        <div className="divide-y divide-gray-100 rounded-xl border border-gray-200 bg-white">
          {childFolders.map((f) => (
            <div key={f.id} className="group flex items-center justify-between px-4 py-2.5 hover:bg-gray-50/70">
              <button onClick={() => setCurrentFolderId(f.id)} className="flex items-center gap-2 text-sm hover:text-brand-dark hover:underline">
                📁 {f.name}
              </button>
              {canManage && (
                <button onClick={() => handleDeleteFolder(f.id)} className="hidden text-xs text-gray-300 hover:text-red-500 group-hover:inline">
                  Excluir
                </button>
              )}
            </div>
          ))}
          {childFiles.map((f) => (
            <div key={f.id} className="group flex items-center justify-between px-4 py-2.5 hover:bg-gray-50/70">
              <a href={`/api/attachments/${f.id}`} className="flex min-w-0 items-center gap-2 truncate text-sm hover:text-brand-dark hover:underline">
                📄 {f.fileName}
              </a>
              <div className="flex shrink-0 items-center gap-3 text-xs text-gray-400">
                <span>{fmtSize(f.fileSize)}</span>
                <span>{f.uploader.name}</span>
                {canManage && (
                  <button onClick={() => handleDeleteFile(f.id)} className="hidden text-gray-300 hover:text-red-500 group-hover:inline">
                    Excluir
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
