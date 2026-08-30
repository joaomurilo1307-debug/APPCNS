"use client";

import { useRef, useState } from "react";
import * as XLSX from "xlsx";

function normalizar(s: string) {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .trim();
}

function achaColuna(row: Record<string, any>, ...candidatos: string[]) {
  const keys = Object.keys(row);
  for (const cand of candidatos) {
    const alvo = normalizar(cand);
    const key = keys.find((k) => normalizar(k) === alvo || normalizar(k).includes(alvo));
    if (key !== undefined && row[key] !== "" && row[key] !== undefined) return row[key];
  }
  return null;
}

function achaSheet(wb: XLSX.WorkBook, ...candidatos: string[]) {
  const nomes = wb.SheetNames;
  for (const cand of candidatos) {
    const alvo = normalizar(cand);
    const nome = nomes.find((n) => normalizar(n).includes(alvo));
    if (nome) return wb.Sheets[nome];
  }
  return null;
}

function excelDateToISO(v: any): string | null {
  if (v === null || v === undefined || v === "") return null;
  if (v instanceof Date) return v.toISOString();
  if (typeof v === "number") {
    const d = XLSX.SSF.parse_date_code(v);
    if (!d) return null;
    return new Date(Date.UTC(d.y, d.m - 1, d.d)).toISOString();
  }
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export default function ImportarPage() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<"idle" | "lendo" | "enviando" | "ok" | "erro">("idle");
  const [resumo, setResumo] = useState<{ colaboradoresImportados: number; regrasImportadas: number; estoqueImportado: number } | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ colaboradores: number; regras: number; estoque: number } | null>(null);
  const [payloadPronto, setPayloadPronto] = useState<any>(null);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setStatus("lendo");
    setErro(null);
    setResumo(null);
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array", cellDates: true });

      // ---- Colaboradores ("Informações Gerais") ----
      const shColab = achaSheet(wb, "informacoes gerais", "informações gerais");
      const colaboradores: any[] = [];
      if (shColab) {
        const rows: Record<string, any>[] = XLSX.utils.sheet_to_json(shColab, { defval: "" });
        for (const row of rows) {
          const nome = achaColuna(row, "NOME COMPLETO", "NOME");
          const contrato = achaColuna(row, "CONTRATO");
          if (!nome || !contrato) continue;
          colaboradores.push({
            nomeCompleto: String(nome).trim(),
            contrato: String(contrato).trim(),
            funcao: String(achaColuna(row, "FUNCAO", "FUNÇÃO") ?? "NÃO INFORMADA").trim(),
            situacao: String(achaColuna(row, "SITUACAO", "SITUAÇÃO") ?? "ATIVO").trim(),
            admissao: excelDateToISO(achaColuna(row, "ADMISSAO", "ADMISSÃO")),
            bota: achaColuna(row, "BOTA"),
            camisa: achaColuna(row, "CAMISA"),
            calca: achaColuna(row, "CALCA", "CALÇA"),
            cpf: achaColuna(row, "CPF"),
            rg: achaColuna(row, "RG") ? String(achaColuna(row, "RG")) : null,
            nascimento: excelDateToISO(achaColuna(row, "NASCIMENTO")),
            moradia: achaColuna(row, "MORADIA"),
            endereco: achaColuna(row, "ENDERECO", "ENDEREÇO"),
            numero: achaColuna(row, "NUMERO", "NÚMERO") ? String(achaColuna(row, "NUMERO", "NÚMERO")) : null,
          });
        }
      }

      // ---- Regras de EPI por função ("EPIs por Função") ----
      const shFuncao = achaSheet(wb, "epis por funcao", "epis por função");
      const funcaoRegras: any[] = [];
      if (shFuncao) {
        const rows: Record<string, any>[] = XLSX.utils.sheet_to_json(shFuncao, { defval: "" });
        const categorias = [
          "EPI - CABEÇA",
          "EPI - OLHOS/FACE",
          "EPI - AUDIÇÃO",
          "EPI - RESPIRATORIO",
          "EPI - TRONCO",
          "EPI - BRAÇOS",
          "EPI - MÃOS",
          "EPI - PERNAS",
          "EPI - PÉS",
        ];
        for (const row of rows) {
          const funcao = achaColuna(row, "FUNCAO", "FUNÇÃO");
          const contrato = achaColuna(row, "CONTRATO");
          if (!funcao || !contrato) continue;
          for (const cat of categorias) {
            const descricao = achaColuna(row, cat);
            if (!descricao) continue;
            funcaoRegras.push({
              funcao: String(funcao).trim(),
              contrato: String(contrato).trim(),
              categoria: cat,
              descricao: String(descricao).trim(),
            });
          }
        }
      }

      // ---- Estoque ("Estoque do ECC") ----
      const shEstoque = achaSheet(wb, "estoque do ecc", "estoque ecc");
      const estoque: any[] = [];
      if (shEstoque) {
        const rows: Record<string, any>[] = XLSX.utils.sheet_to_json(shEstoque, { defval: "" });
        for (const row of rows) {
          const produto = achaColuna(row, "PRODUTO");
          if (!produto) continue;
          const inicial = Number(achaColuna(row, "ESTOQUE INICIAL")) || 0;
          const minimo = Number(achaColuna(row, "EST. MIN", "ESTOQUE MINIMO", "EST MIN")) || 0;
          estoque.push({
            produto: String(produto).trim(),
            contrato: null,
            estoqueInicial: inicial,
            estoqueMinimo: minimo,
            medida: achaColuna(row, "MEDIDA"),
          });
        }
      }

      setPreview({ colaboradores: colaboradores.length, regras: funcaoRegras.length, estoque: estoque.length });
      setPayloadPronto({ colaboradores, funcaoRegras, estoque });
      setStatus("idle");
    } catch (err: any) {
      setErro(err?.message ?? "Erro ao ler o arquivo.");
      setStatus("erro");
    }
  }

  async function confirmarImportacao() {
    if (!payloadPronto) return;
    setStatus("enviando");
    setErro(null);
    const res = await fetch("/api/epi/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payloadPronto),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setErro(data.error ? JSON.stringify(data.error) : "Erro ao importar.");
      setStatus("erro");
      return;
    }
    const data = await res.json();
    setResumo(data);
    setStatus("ok");
    setPreview(null);
    setPayloadPronto(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  return (
    <div className="max-w-2xl">
      <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="mb-2 text-sm font-semibold text-gray-700">Importar planilha padrão (ex: "Informações Gerais - MRN")</h2>
        <p className="mb-4 text-xs text-gray-500">
          A planilha deve ter as abas <strong>Informações Gerais</strong> (colaboradores), <strong>EPIs por Função</strong> (regra de
          EPI por função/contrato) e <strong>Estoque do ECC</strong> (estoque inicial e mínimo já calculado). Reimportar atualiza os
          dados existentes (mesmo nome+contrato), não duplica.
        </p>

        <input
          ref={fileRef}
          type="file"
          accept=".xlsx,.xls"
          onChange={handleFile}
          className="mb-4 block w-full text-sm text-gray-600 file:mr-3 file:rounded-lg file:border-0 file:bg-brand file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white hover:file:bg-brand-dark"
        />

        {status === "lendo" && <p className="text-sm text-gray-400">Lendo planilha...</p>}

        {preview && (
          <div className="mb-4 rounded-xl bg-gray-50 p-4 text-sm">
            <p className="mb-2 font-medium text-gray-700">Encontrado na planilha:</p>
            <ul className="space-y-1 text-gray-500">
              <li>👤 {preview.colaboradores} colaboradores</li>
              <li>🦺 {preview.regras} regras de EPI por função</li>
              <li>📦 {preview.estoque} itens de estoque</li>
            </ul>
            <button
              onClick={confirmarImportacao}
              disabled={status === "enviando"}
              className="mt-4 rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-50"
            >
              {status === "enviando" ? "Importando..." : "Confirmar importação"}
            </button>
          </div>
        )}

        {erro && <p className="mb-3 text-sm text-rose-600">{erro}</p>}

        {resumo && (
          <div className="rounded-xl bg-brand-light p-4 text-sm text-brand-dark">
            ✅ Importado: {resumo.colaboradoresImportados} colaboradores, {resumo.regrasImportadas} regras de EPI e{" "}
            {resumo.estoqueImportado} itens de estoque.
          </div>
        )}
      </div>
    </div>
  );
}
