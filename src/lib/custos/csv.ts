// Exportacao simples para CSV (Excel pt-BR): separador ";", numeros com virgula decimal, BOM para acentuar certo.

function celula(v: string | number): string {
  if (typeof v === "number") return Number.isFinite(v) ? v.toFixed(2).replace(".", ",") : "";
  const t = String(v ?? "");
  return /[";\n\r]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
}

export function montarCsv(linhas: ReadonlyArray<ReadonlyArray<string | number>>): string {
  return "﻿" + linhas.map((l) => l.map(celula).join(";")).join("\r\n");
}

export function baixarCsv(nome: string, linhas: ReadonlyArray<ReadonlyArray<string | number>>) {
  const blob = new Blob([montarCsv(linhas)], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nome;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
