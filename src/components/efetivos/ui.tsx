"use client";

// Peças visuais compartilhadas pelas telas do controle de efetivos.

export const campo = "mt-1 block w-full rounded-lg border border-gray-200 px-2.5 py-1.5 text-sm text-ink";

export function Modal({ titulo, onFechar, children, largo }: { titulo: string; onFechar: () => void; children: React.ReactNode; largo?: boolean }) {
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4" onMouseDown={(e) => e.target === e.currentTarget && onFechar()}>
      <div className={`my-6 w-full rounded-2xl bg-white shadow-xl ${largo ? "max-w-5xl" : "max-w-xl"}`}>
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-3">
          <h3 className="text-base font-semibold text-ink">{titulo}</h3>
          <button onClick={onFechar} className="rounded-lg px-2 py-1 text-gray-400 hover:bg-gray-100" aria-label="Fechar">✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Aviso({ tipo, children }: { tipo: "erro" | "ok" | "atencao"; children: React.ReactNode }) {
  const cls = tipo === "erro" ? "border-red-200 bg-red-50 text-red-700" : tipo === "ok" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-amber-200 bg-amber-50 text-amber-900";
  return <div className={`rounded-lg border px-3 py-2 text-sm ${cls}`}>{children}</div>;
}
