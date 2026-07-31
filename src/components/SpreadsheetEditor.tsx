"use client";

import { useEffect, useRef, useState } from "react";
import * as XLSX from "xlsx";

type Scope = { type: "project" | "team"; id: string };

const BLANK_ROWS = 25;
const BLANK_COLS = 12;

function blankGrid(): string[][] {
  return Array.from({ length: BLANK_ROWS }, () => Array.from({ length: BLANK_COLS }, () => ""));
}

function colLetter(i: number) {
  let n = i;
  let s = "";
  do {
    s = String.fromCharCode(65 + (n % 26)) + s;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return s;
}

export default function SpreadsheetEditor({
  attachment,
  scope,
  folderId,
  onClose,
  onSaved,
}: {
  attachment: { id: string; fileName: string } | null;
  scope: Scope;
  folderId: string | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const basePath = scope.type === "project" ? `/api/projects/${scope.id}` : `/api/teams/${scope.id}`;
  const [loading, setLoading] = useState(!!attachment);
  const [error, setError] = useState<string | null>(null);
  const [grid, setGrid] = useState<string[][]>(blankGrid());
  const [sheetName, setSheetName] = useState("Planilha1");
  const [fileName, setFileName] = useState(attachment?.fileName ?? "Nova planilha.xlsx");
  const [saving, setSaving] = useState(false);
  const [otherSheetCount, setOtherSheetCount] = useState(0);
  const workbookRef = useRef<XLSX.WorkBook | null>(null);

  useEffect(() => {
    if (!attachment) return;
    fetch(`/api/attachments/${attachment.id}`)
      .then((r) => {
        if (!r.ok) throw new Error();
        return r.arrayBuffer();
      })
      .then((buf) => {
        const wb = XLSX.read(buf, { type: "array" });
        workbookRef.current = wb;
        const firstSheetName = wb.SheetNames[0];
        setSheetName(firstSheetName);
        setOtherSheetCount(wb.SheetNames.length - 1);
        const sheet = wb.Sheets[firstSheetName];
        const rows: string[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "", raw: false });
        const maxCols = Math.max(BLANK_COLS, ...rows.map((r) => r.length), 1);
        const padded = rows.map((r) => {
          const row = r.map((c) => (c === null || c === undefined ? "" : String(c)));
          while (row.length < maxCols) row.push("");
          return row;
        });
        while (padded.length < 10) padded.push(Array.from({ length: maxCols }, () => ""));
        setGrid(padded);
        setLoading(false);
      })
      .catch(() => {
        setError("Não foi possível abrir esse arquivo como planilha.");
        setLoading(false);
      });
  }, [attachment]);

  function setCell(r: number, c: number, value: string) {
    setGrid((prev) => {
      const next = prev.map((row) => row.slice());
      next[r][c] = value;
      return next;
    });
  }

  function addRow() {
    setGrid((prev) => [...prev, Array.from({ length: prev[0]?.length ?? BLANK_COLS }, () => "")]);
  }

  function addCol() {
    setGrid((prev) => prev.map((row) => [...row, ""]));
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const wb = workbookRef.current ?? XLSX.utils.book_new();
      const ws = XLSX.utils.aoa_to_sheet(grid);
      if (wb.SheetNames.includes(sheetName)) {
        wb.Sheets[sheetName] = ws;
      } else {
        XLSX.utils.book_append_sheet(wb, ws, sheetName);
      }
      const out = XLSX.write(wb, { bookType: "xlsx", type: "array" });
      const finalName = fileName.toLowerCase().endsWith(".xlsx") ? fileName : `${fileName}.xlsx`;
      const blob = new Blob([out], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      const file = new File([blob], finalName, { type: blob.type });

      if (attachment) {
        const fd = new FormData();
        fd.append("file", file);
        const res = await fetch(`/api/attachments/${attachment.id}`, { method: "PATCH", body: fd });
        if (!res.ok) throw new Error();
      } else {
        const fd = new FormData();
        fd.append("file", file);
        if (folderId) fd.append("folderId", folderId);
        const res = await fetch(`${basePath}/files`, { method: "POST", body: fd });
        if (!res.ok) throw new Error();
      }
      onSaved();
      onClose();
    } catch {
      setError("Não foi possível salvar a planilha.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={onClose}>
      <div
        className="flex h-[85vh] w-full max-w-5xl flex-col overflow-hidden rounded-xl bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-gray-100 p-3">
          <div className="flex items-center gap-2">
            <input
              value={fileName}
              onChange={(e) => setFileName(e.target.value)}
              disabled={!!attachment}
              className="rounded-md border border-gray-300 px-2 py-1 text-sm font-medium disabled:border-transparent disabled:bg-transparent disabled:px-0"
            />
            {otherSheetCount > 0 && (
              <span className="text-xs text-gray-400" title="Só a primeira aba fica editável aqui; as outras são preservadas do jeito que estavam ao salvar">
                +{otherSheetCount} outra(s) aba(s) preservada(s)
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {error && <span className="text-xs text-red-600">{error}</span>}
            <button
              onClick={handleSave}
              disabled={saving || loading}
              className="rounded-md bg-brand px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-dark disabled:opacity-60"
            >
              {saving ? "Salvando..." : "Salvar"}
            </button>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-700">✕</button>
          </div>
        </div>

        {loading ? (
          <div className="flex flex-1 items-center justify-center text-sm text-gray-400">Abrindo planilha...</div>
        ) : (
          <div className="flex-1 overflow-auto">
            <table className="border-collapse text-xs">
              <thead>
                <tr>
                  <th className="sticky left-0 top-0 z-20 w-8 border border-gray-200 bg-gray-50" />
                  {grid[0]?.map((_, c) => (
                    <th key={c} className="sticky top-0 z-10 min-w-[90px] border border-gray-200 bg-gray-50 px-1.5 py-1 font-medium text-gray-500">
                      {colLetter(c)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {grid.map((row, r) => (
                  <tr key={r}>
                    <td className="sticky left-0 z-10 border border-gray-200 bg-gray-50 px-1.5 text-center text-gray-400">{r + 1}</td>
                    {row.map((cell, c) => (
                      <td key={c} className="border border-gray-100 p-0">
                        <input
                          value={cell}
                          onChange={(e) => setCell(r, c, e.target.value)}
                          className="w-full min-w-[90px] border-none bg-transparent px-1.5 py-1 outline-none focus:bg-brand/5"
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="flex items-center gap-2 border-t border-gray-100 p-2">
          <button onClick={addRow} className="rounded-md border border-gray-300 px-2.5 py-1 text-xs hover:bg-gray-50">+ Linha</button>
          <button onClick={addCol} className="rounded-md border border-gray-300 px-2.5 py-1 text-xs hover:bg-gray-50">+ Coluna</button>
          <span className="ml-auto text-xs text-gray-400">
            Edição básica de células (sem recálculo de fórmulas) — abre e salva .xlsx de verdade dentro de Arquivos.
          </span>
        </div>
      </div>
    </div>
  );
}
