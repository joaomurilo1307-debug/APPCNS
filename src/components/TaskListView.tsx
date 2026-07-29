"use client";

import { useEffect, useRef, useState } from "react";
import * as XLSX from "xlsx";

type Member = { id: string; name: string };

type CustomField = {
  id: string;
  name: string;
  type: "TEXTO" | "NUMERO" | "MOEDA" | "DATA" | "LISTA" | "CHECKBOX" | "PESSOA" | "FORMULA";
  options: string | null;
  order: number;
};

const operationLabel: Record<string, string> = {
  soma: "+",
  subtracao: "-",
  multiplicacao: "×",
  divisao: "÷",
};

function computeFormula(op: string, a: number, b: number) {
  if (op === "soma") return a + b;
  if (op === "subtracao") return a - b;
  if (op === "multiplicacao") return a * b;
  if (op === "divisao") return b === 0 ? null : a / b;
  return null;
}

type CustomFieldValue = { customFieldId: string; value: string | null };

type ListTask = {
  id: string;
  title: string;
  status: string;
  priority: string;
  startDate: string | null;
  dueDate: string | null;
  assigneeId: string | null;
  assignee: { id: string; name: string } | null;
  customFieldValues: CustomFieldValue[];
  parentTaskId: string | null;
  _count?: { subtasks: number };
};

function buildHierarchy(tasks: ListTask[], collapsed: Set<string>) {
  const byParent = new Map<string | null, ListTask[]>();
  for (const t of tasks) {
    const key = t.parentTaskId && tasks.some((x) => x.id === t.parentTaskId) ? t.parentTaskId : null;
    if (!byParent.has(key)) byParent.set(key, []);
    byParent.get(key)!.push(t);
  }
  const result: { task: ListTask; depth: number }[] = [];
  function walk(parentId: string | null, depth: number) {
    for (const t of byParent.get(parentId) ?? []) {
      result.push({ task: t, depth });
      if (!collapsed.has(t.id)) walk(t.id, depth + 1);
    }
  }
  walk(null, 0);
  return result;
}

const statusOptions = [
  { v: "A_FAZER", l: "A fazer" },
  { v: "FAZENDO", l: "Fazendo" },
  { v: "BLOQUEADO", l: "Bloqueado" },
  { v: "FEITO", l: "Feito" },
];

const priorityOptions = [
  { v: "BAIXA", l: "Baixa" },
  { v: "MEDIA", l: "Média" },
  { v: "ALTA", l: "Alta" },
  { v: "URGENTE", l: "Urgente" },
];

const fieldTypeOptions: { v: CustomField["type"]; l: string }[] = [
  { v: "TEXTO", l: "Texto" },
  { v: "NUMERO", l: "Número" },
  { v: "MOEDA", l: "Moeda (R$)" },
  { v: "DATA", l: "Data" },
  { v: "LISTA", l: "Lista suspensa" },
  { v: "CHECKBOX", l: "Caixa de seleção" },
  { v: "PESSOA", l: "Pessoa" },
  { v: "FORMULA", l: "Cálculo (entre 2 colunas)" },
];

const importableFieldTypeOptions = fieldTypeOptions.filter((o) => o.v !== "FORMULA");

const BUILTIN_TARGETS = [
  { v: "title", l: "Título" },
  { v: "description", l: "Descrição" },
  { v: "status", l: "Status" },
  { v: "priority", l: "Prioridade" },
  { v: "assignee", l: "Responsável" },
  { v: "startDate", l: "Início" },
  { v: "dueDate", l: "Prazo" },
];

type ColumnMapping = {
  column: string;
  targetType: "ignore" | "builtin" | "existingField" | "newField";
  builtinKey?: string;
  fieldId?: string;
  newFieldName?: string;
  newFieldType?: CustomField["type"];
};

export default function TaskListView({
  projectId,
  projectName,
  team,
  canManage,
}: {
  projectId: string;
  projectName: string;
  team: { members: { user: Member }[] };
  canManage: boolean;
}) {
  const [tasks, setTasks] = useState<ListTask[]>([]);
  const [fields, setFields] = useState<CustomField[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  function toggleCollapsed(id: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [showAddField, setShowAddField] = useState(false);
  const [newFieldName, setNewFieldName] = useState("");
  const [newFieldType, setNewFieldType] = useState<CustomField["type"]>("TEXTO");
  const [newFieldOptions, setNewFieldOptions] = useState("");
  const [newFormulaOp, setNewFormulaOp] = useState("soma");
  const [newFormulaField1, setNewFormulaField1] = useState("");
  const [newFormulaField2, setNewFormulaField2] = useState("");

  const [importRows, setImportRows] = useState<Record<string, any>[] | null>(null);
  const [importMappings, setImportMappings] = useState<ColumnMapping[]>([]);
  const [importing, setImporting] = useState(false);
  const [showImportHelp, setShowImportHelp] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function loadAll() {
    const [t, f] = await Promise.all([
      fetch(`/api/tasks?projectId=${projectId}`).then((r) => r.json()),
      fetch(`/api/projects/${projectId}/fields`).then((r) => r.json()),
    ]);
    setTasks(t);
    setFields(f);
    setLoaded(true);
  }

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  async function patchTask(taskId: string, data: any) {
    setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, ...data } : t)));
    await fetch(`/api/tasks/${taskId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
  }

  async function patchCustomField(taskId: string, fieldId: string, value: string) {
    setTasks((prev) =>
      prev.map((t) => {
        if (t.id !== taskId) return t;
        const existing = t.customFieldValues.find((v) => v.customFieldId === fieldId);
        const next = existing
          ? t.customFieldValues.map((v) => (v.customFieldId === fieldId ? { ...v, value } : v))
          : [...t.customFieldValues, { customFieldId: fieldId, value }];
        return { ...t, customFieldValues: next };
      })
    );
    await fetch(`/api/tasks/${taskId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ customFieldValues: { [fieldId]: value } }),
    });
  }

  async function handleAddTask() {
    if (!newTaskTitle.trim()) return;
    await fetch("/api/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: newTaskTitle, projectId }),
    });
    setNewTaskTitle("");
    loadAll();
  }

  async function handleDeleteTask(taskId: string) {
    if (!confirm("Excluir esta tarefa?")) return;
    await fetch(`/api/tasks/${taskId}`, { method: "DELETE" });
    loadAll();
  }

  async function handleAddField(e: React.FormEvent) {
    e.preventDefault();
    if (!newFieldName.trim()) return;
    if (newFieldType === "FORMULA" && (!newFormulaField1 || !newFormulaField2)) {
      alert("Escolha as duas colunas do cálculo.");
      return;
    }
    await fetch(`/api/projects/${projectId}/fields`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: newFieldName,
        type: newFieldType,
        options: newFieldType === "LISTA" ? newFieldOptions.split(",").map((s) => s.trim()).filter(Boolean) : undefined,
        formula:
          newFieldType === "FORMULA"
            ? { operation: newFormulaOp, fieldIds: [newFormulaField1, newFormulaField2] }
            : undefined,
      }),
    });
    setNewFieldName("");
    setNewFieldType("TEXTO");
    setNewFieldOptions("");
    setNewFormulaOp("soma");
    setNewFormulaField1("");
    setNewFormulaField2("");
    setShowAddField(false);
    loadAll();
  }

  async function handleAddResourcePackage() {
    if (fields.some((f) => f.name === "Horas estimadas" || f.name === "Custo estimado")) {
      alert("As colunas de recursos já existem nesta lista.");
      return;
    }
    const createField = async (name: string, type: CustomField["type"]) => {
      const res = await fetch(`/api/projects/${projectId}/fields`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, type }),
      });
      return res.json();
    };
    const horas = await createField("Horas estimadas", "NUMERO");
    const valorHora = await createField("Valor hora (R$)", "MOEDA");
    await fetch(`/api/projects/${projectId}/fields`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Custo estimado",
        type: "FORMULA",
        formula: { operation: "multiplicacao", fieldIds: [horas.id, valorHora.id] },
      }),
    });
    loadAll();
  }

  async function handleDeleteField(fieldId: string) {
    if (!confirm("Excluir esta coluna? Os valores preenchidos nela serão perdidos.")) return;
    await fetch(`/api/fields/${fieldId}`, { method: "DELETE" });
    loadAll();
  }

  function handleFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const data = new Uint8Array(ev.target?.result as ArrayBuffer);
      const wb = XLSX.read(data, { type: "array", cellDates: true });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const rows: Record<string, any>[] = XLSX.utils.sheet_to_json(sheet, { defval: "", raw: false, dateNF: "yyyy-mm-dd" });
      if (rows.length === 0) {
        alert("Planilha vazia ou sem cabeçalho reconhecível.");
        return;
      }
      const headers = Object.keys(rows[0]);
      setImportMappings(
        headers.map((h) => {
          const lower = h.toLowerCase();
          const builtinGuess = BUILTIN_TARGETS.find((b) => b.l.toLowerCase() === lower || b.v === lower);
          return builtinGuess
            ? { column: h, targetType: "builtin" as const, builtinKey: builtinGuess.v }
            : { column: h, targetType: "ignore" as const };
        })
      );
      setImportRows(rows);
    };
    reader.readAsArrayBuffer(file);
    e.target.value = "";
  }

  function updateMapping(column: string, patch: Partial<ColumnMapping>) {
    setImportMappings((prev) => prev.map((m) => (m.column === column ? { ...m, ...patch } : m)));
  }

  async function handleConfirmImport() {
    if (!importRows) return;
    const hasTitle = importMappings.some((m) => m.targetType === "builtin" && m.builtinKey === "title");
    if (!hasTitle) {
      alert("Mapeie ao menos uma coluna para o Título antes de importar.");
      return;
    }
    setImporting(true);
    const res = await fetch(`/api/projects/${projectId}/tasks/import`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ columnMappings: importMappings, rows: importRows }),
    });
    setImporting(false);
    if (res.ok) {
      const data = await res.json();
      alert(`${data.created} tarefa(s) importada(s).`);
      setImportRows(null);
      setImportMappings([]);
      loadAll();
    } else {
      const err = await res.json();
      alert(err.error ?? "Falha ao importar.");
    }
  }

  function handleExport() {
    const data = tasks.map((t) => {
      const row: Record<string, any> = {
        Título: t.title,
        Status: statusOptions.find((s) => s.v === t.status)?.l ?? t.status,
        Prioridade: priorityOptions.find((p) => p.v === t.priority)?.l ?? t.priority,
        Responsável: t.assignee?.name ?? "",
        Início: t.startDate?.slice(0, 10) ?? "",
        Prazo: t.dueDate?.slice(0, 10) ?? "",
      };
      for (const f of fields) {
        row[f.name] = f.type === "FORMULA" ? getFormulaValue(f, t) ?? "" : t.customFieldValues.find((v) => v.customFieldId === f.id)?.value ?? "";
      }
      return row;
    });
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Backlog");
    XLSX.writeFile(wb, `${projectName.replace(/[^\w\-]+/g, "_")}-backlog.xlsx`);
  }

  function exampleForField(f: CustomField, alt: boolean): string {
    switch (f.type) {
      case "LISTA": {
        const opts = JSON.parse(f.options || "[]") as string[];
        return (alt ? opts[1] : opts[0]) ?? opts[0] ?? "";
      }
      case "NUMERO":
        return alt ? "8" : "3";
      case "MOEDA":
        return alt ? "1250.00" : "480.50";
      case "DATA":
        return alt ? "2026-08-14" : "2026-08-05";
      case "CHECKBOX":
        return alt ? "Não" : "Sim";
      case "PESSOA":
        return (alt ? team.members[1]?.user.name : team.members[0]?.user.name) ?? "Nome exato de alguém da equipe";
      default:
        return alt ? "Outro exemplo de texto" : "Exemplo de texto";
    }
  }

  function buildTemplateExample() {
    const importableFields = fields.filter((f) => f.type !== "FORMULA");
    const headers = ["Título", "Descrição", "Status", "Prioridade", "Responsável", "Início", "Prazo", ...importableFields.map((f) => f.name)];
    const row1: Record<string, string> = {
      Título: "Revisar contrato XPTO",
      Descrição: "Detalhes da tarefa (opcional)",
      Status: "A fazer",
      Prioridade: "Média",
      Responsável: team.members[0]?.user.name ?? "Nome exato de um membro da equipe",
      Início: "2026-08-01",
      Prazo: "2026-08-10",
    };
    const row2: Record<string, string> = {
      Título: "Enviar proposta ao cliente",
      Descrição: "",
      Status: "Fazendo",
      Prioridade: "Alta",
      Responsável: team.members[1]?.user.name ?? team.members[0]?.user.name ?? "",
      Início: "2026-08-03",
      Prazo: "2026-08-07",
    };
    for (const f of importableFields) {
      row1[f.name] = exampleForField(f, false);
      row2[f.name] = exampleForField(f, true);
    }
    return { headers, rows: [row1, row2], example: row1 };
  }

  function handleDownloadTemplate() {
    const { headers, rows } = buildTemplateExample();
    const ws = XLSX.utils.json_to_sheet(rows, { header: headers });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Modelo");
    XLSX.writeFile(wb, "modelo-importacao.xlsx");
  }

  const numericFields = fields.filter((f) => f.type === "NUMERO" || f.type === "MOEDA");

  function getFormulaValue(field: CustomField, task: ListTask): number | null {
    if (!field.options) return null;
    try {
      const { operation, fieldIds } = JSON.parse(field.options) as { operation: string; fieldIds: [string, string] };
      const a = Number(task.customFieldValues.find((v) => v.customFieldId === fieldIds[0])?.value ?? 0);
      const b = Number(task.customFieldValues.find((v) => v.customFieldId === fieldIds[1])?.value ?? 0);
      return computeFormula(operation, a, b);
    } catch {
      return null;
    }
  }

  if (!loaded) return <p className="text-sm text-gray-400">Carregando...</p>;

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {canManage && (
          <>
            <button
              onClick={() => setShowAddField((v) => !v)}
              className="rounded-md border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50"
            >
              + Coluna
            </button>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="rounded-md border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50"
            >
              Importar Excel
            </button>
            <button
              onClick={handleDownloadTemplate}
              className="rounded-md border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50"
            >
              Baixar modelo
            </button>
            <button
              onClick={handleAddResourcePackage}
              title="Cria as colunas Horas estimadas, Valor hora e Custo estimado (calculado automaticamente). Para custo real (horas gastas de verdade), veja a aba Recursos."
              className="rounded-md border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50"
            >
              📦 Colunas de estimativa
            </button>
            <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv" onChange={handleFileSelected} className="hidden" />
          </>
        )}
        <button onClick={handleExport} className="rounded-md border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50">
          Exportar Excel
        </button>
        {canManage && (
          <button
            type="button"
            onClick={() => setShowImportHelp((v) => !v)}
            className="text-xs text-gray-400 underline hover:text-gray-600"
          >
            {showImportHelp ? "Ocultar formato da planilha" : "Como formatar a planilha para importar?"}
          </button>
        )}
      </div>

      {showImportHelp && canManage && (
        <div className="mb-4 rounded-xl border border-gray-200 bg-gray-50 p-4 text-xs text-gray-600">
          <p className="mb-3">
            Arquivo <strong>.xlsx</strong>, <strong>.xls</strong> ou <strong>.csv</strong>, com a{" "}
            <strong>primeira linha contendo os nomes das colunas</strong>. Baixe o modelo abaixo, preencha por cima
            dele e importe — assim as colunas já vêm no formato certo.
          </p>
          <p className="mb-1 font-semibold text-gray-700">Colunas reconhecidas automaticamente pelo nome:</p>
          <ul className="mb-3 list-disc space-y-0.5 pl-5">
            <li><strong>Título</strong> — obrigatório, é o único campo que precisa existir</li>
            <li><strong>Descrição</strong> — texto livre, opcional</li>
            <li><strong>Status</strong>: A fazer, Fazendo, Bloqueado ou Feito</li>
            <li><strong>Prioridade</strong>: Baixa, Média, Alta ou Urgente</li>
            <li><strong>Responsável</strong>: nome exato de alguém da equipe (senão a tarefa fica sem responsável)</li>
            <li><strong>Início</strong> e <strong>Prazo</strong>: data no formato AAAA-MM-DD (ex: 2026-08-10)</li>
          </ul>
          <p className="mb-1 font-semibold text-gray-700">Colunas personalizadas do projeto:</p>
          <ul className="mb-3 list-disc space-y-0.5 pl-5">
            <li><strong>Texto / Número / Moeda</strong>: valor livre (moeda e número aceitam ponto decimal, ex: 480.50)</li>
            <li><strong>Data</strong>: formato AAAA-MM-DD</li>
            <li><strong>Lista suspensa</strong>: precisa ser exatamente uma das opções já cadastradas na coluna</li>
            <li><strong>Caixa de seleção</strong>: Sim/Não (ou Yes/No, true/false)</li>
            <li><strong>Pessoa</strong>: nome exato de alguém da equipe, igual ao campo Responsável</li>
          </ul>
          <p className="mb-3 text-gray-500">
            Qualquer coluna nova da planilha que a gente não reconheça automaticamente vira uma coluna personalizada
            nova (você escolhe o tipo na hora de importar) ou pode ser ligada a uma coluna já existente. Colunas de{" "}
            <strong>Cálculo</strong> nunca são preenchidas por importação — elas são sempre calculadas
            automaticamente a partir de outras colunas.
          </p>
          <p className="mb-1 font-semibold text-gray-700">Exemplo de como a planilha deve ficar:</p>
          <div className="overflow-x-auto rounded-md border border-gray-200 bg-white">
            <table className="w-full text-left text-[11px]">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  {buildTemplateExample().headers.map((h) => (
                    <th key={h} className="whitespace-nowrap px-2 py-1 font-semibold">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {buildTemplateExample().rows.map((row, i) => (
                  <tr key={i} className={i > 0 ? "border-t border-gray-50" : ""}>
                    {buildTemplateExample().headers.map((h) => (
                      <td key={h} className="whitespace-nowrap px-2 py-1 text-gray-500">{row[h] ?? ""}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {showAddField && canManage && (
        <form onSubmit={handleAddField} className="mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-gray-200 bg-white p-3 text-sm">
          <input
            required
            placeholder="Nome da coluna"
            value={newFieldName}
            onChange={(e) => setNewFieldName(e.target.value)}
            className="rounded-md border border-gray-300 px-2 py-1.5"
          />
          <select value={newFieldType} onChange={(e) => setNewFieldType(e.target.value as CustomField["type"])} className="rounded-md border border-gray-300 px-2 py-1.5">
            {fieldTypeOptions.map((o) => (
              <option key={o.v} value={o.v}>{o.l}</option>
            ))}
          </select>
          {newFieldType === "LISTA" && (
            <input
              placeholder="Opções separadas por vírgula"
              value={newFieldOptions}
              onChange={(e) => setNewFieldOptions(e.target.value)}
              className="flex-1 rounded-md border border-gray-300 px-2 py-1.5"
            />
          )}
          {newFieldType === "FORMULA" && (
            <>
              {numericFields.length < 2 ? (
                <span className="text-xs text-red-500">Crie ao menos 2 colunas do tipo Número/Moeda antes.</span>
              ) : (
                <>
                  <select value={newFormulaField1} onChange={(e) => setNewFormulaField1(e.target.value)} className="rounded-md border border-gray-300 px-2 py-1.5">
                    <option value="">Coluna A</option>
                    {numericFields.map((f) => (
                      <option key={f.id} value={f.id}>{f.name}</option>
                    ))}
                  </select>
                  <select value={newFormulaOp} onChange={(e) => setNewFormulaOp(e.target.value)} className="rounded-md border border-gray-300 px-2 py-1.5">
                    {Object.entries(operationLabel).map(([v, l]) => (
                      <option key={v} value={v}>{l}</option>
                    ))}
                  </select>
                  <select value={newFormulaField2} onChange={(e) => setNewFormulaField2(e.target.value)} className="rounded-md border border-gray-300 px-2 py-1.5">
                    <option value="">Coluna B</option>
                    {numericFields.map((f) => (
                      <option key={f.id} value={f.id}>{f.name}</option>
                    ))}
                  </select>
                </>
              )}
            </>
          )}
          <button className="rounded-md bg-brand px-3 py-1.5 font-medium text-white hover:bg-brand-dark">Adicionar</button>
        </form>
      )}

      {importRows && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
          <div className="flex max-h-[85vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl bg-white shadow-xl">
            <div className="border-b border-gray-100 p-4">
              <h2 className="text-lg font-semibold">Importar planilha — mapear colunas</h2>
              <p className="text-xs text-gray-500">{importRows.length} linha(s) encontrada(s). Escolha o destino de cada coluna.</p>
              <p className="mt-1 text-xs text-gray-400">
                Status aceita: A fazer, Fazendo, Bloqueado, Feito. Prioridade aceita: Baixa, Média, Alta, Urgente.
                Responsável deve ser o nome exato de um membro da equipe. Datas no formato AAAA-MM-DD.
              </p>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              <div className="flex flex-col gap-2">
                {importMappings.map((m) => (
                  <div key={m.column} className="flex items-center gap-2 rounded-md bg-gray-50 p-2 text-sm">
                    <span className="w-40 shrink-0 truncate font-medium">{m.column}</span>
                    <select
                      value={
                        m.targetType === "builtin"
                          ? `builtin:${m.builtinKey}`
                          : m.targetType === "existingField"
                          ? `existing:${m.fieldId}`
                          : m.targetType
                      }
                      onChange={(e) => {
                        const val = e.target.value;
                        if (val === "ignore") updateMapping(m.column, { targetType: "ignore", builtinKey: undefined, fieldId: undefined });
                        else if (val === "newField") updateMapping(m.column, { targetType: "newField", newFieldName: m.column, newFieldType: "TEXTO" });
                        else if (val.startsWith("builtin:")) updateMapping(m.column, { targetType: "builtin", builtinKey: val.split(":")[1] });
                        else if (val.startsWith("existing:")) updateMapping(m.column, { targetType: "existingField", fieldId: val.split(":")[1] });
                      }}
                      className="flex-1 rounded-md border border-gray-300 px-2 py-1.5"
                    >
                      <option value="ignore">Ignorar</option>
                      <optgroup label="Campos do sistema">
                        {BUILTIN_TARGETS.map((b) => (
                          <option key={b.v} value={`builtin:${b.v}`}>{b.l}</option>
                        ))}
                      </optgroup>
                      {fields.filter((f) => f.type !== "FORMULA").length > 0 && (
                        <optgroup label="Colunas existentes">
                          {fields
                            .filter((f) => f.type !== "FORMULA")
                            .map((f) => (
                              <option key={f.id} value={`existing:${f.id}`}>{f.name}</option>
                            ))}
                        </optgroup>
                      )}
                      <option value="newField">+ Criar nova coluna</option>
                    </select>
                    {m.targetType === "newField" && (
                      <select
                        value={m.newFieldType}
                        onChange={(e) => updateMapping(m.column, { newFieldType: e.target.value as CustomField["type"] })}
                        className="w-40 rounded-md border border-gray-300 px-2 py-1.5"
                      >
                        {importableFieldTypeOptions.map((o) => (
                          <option key={o.v} value={o.v}>{o.l}</option>
                        ))}
                      </select>
                    )}
                  </div>
                ))}
              </div>
            </div>
            <div className="flex justify-end gap-2 border-t border-gray-100 p-4">
              <button
                onClick={() => {
                  setImportRows(null);
                  setImportMappings([]);
                }}
                className="rounded-md px-4 py-2 text-sm hover:bg-gray-50"
              >
                Cancelar
              </button>
              <button
                onClick={handleConfirmImport}
                disabled={importing}
                className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark disabled:opacity-50"
              >
                {importing ? "Importando..." : `Importar ${importRows.length} linha(s)`}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="max-h-[calc(100vh-14rem)] overflow-auto rounded-xl border border-gray-200 bg-white">
        <table className="w-full border-collapse text-sm">
          <thead className="sticky top-0 z-10">
            <tr className="border-b border-gray-100 bg-gray-50 text-left text-xs text-gray-500">
              <th className="min-w-[220px] px-3 py-2">Título</th>
              <th className="min-w-[120px] px-3 py-2">Status</th>
              <th className="min-w-[110px] px-3 py-2">Prioridade</th>
              <th className="min-w-[160px] px-3 py-2">Responsável</th>
              <th className="min-w-[130px] px-3 py-2">Início</th>
              <th className="min-w-[130px] px-3 py-2">Prazo</th>
              <th className="min-w-[160px] px-3 py-2">Tarefa-mãe</th>
              {fields.map((f) => (
                <th key={f.id} className="min-w-[140px] px-3 py-2">
                  <div className="flex items-center gap-1">
                    <span className="truncate">{f.name}</span>
                    {canManage && (
                      <button onClick={() => handleDeleteField(f.id)} className="text-gray-300 hover:text-red-500" title="Excluir coluna">
                        ✕
                      </button>
                    )}
                  </div>
                </th>
              ))}
              <th className="w-8 px-2 py-2" />
            </tr>
          </thead>
          <tbody>
            {buildHierarchy(tasks, collapsed).map(({ task: t, depth }) => (
              <tr key={t.id} className="border-b border-gray-50 hover:bg-gray-50/50">
                <td className="px-3 py-1.5">
                  <div className="flex items-center gap-1" style={{ paddingLeft: depth * 20 }}>
                    {depth > 0 && <span className="text-gray-300">↳</span>}
                    {!!t._count?.subtasks && (
                      <button
                        type="button"
                        onClick={() => toggleCollapsed(t.id)}
                        className="w-4 shrink-0 text-gray-400 hover:text-gray-700"
                        title={collapsed.has(t.id) ? "Expandir subtarefas" : "Recolher subtarefas"}
                      >
                        {collapsed.has(t.id) ? "▸" : "▾"}
                      </button>
                    )}
                    <input
                      defaultValue={t.title}
                      onBlur={(e) => e.target.value !== t.title && patchTask(t.id, { title: e.target.value })}
                      className="w-full rounded-md border border-transparent px-2 py-1 hover:border-gray-200 focus:border-gray-300"
                    />
                  </div>
                </td>
                <td className="px-3 py-1.5">
                  <select
                    value={t.status}
                    onChange={(e) => patchTask(t.id, { status: e.target.value })}
                    className="w-full rounded-md border border-transparent px-2 py-1 hover:border-gray-200"
                  >
                    {statusOptions.map((s) => (
                      <option key={s.v} value={s.v}>{s.l}</option>
                    ))}
                  </select>
                </td>
                <td className="px-3 py-1.5">
                  <select
                    value={t.priority}
                    onChange={(e) => patchTask(t.id, { priority: e.target.value })}
                    className="w-full rounded-md border border-transparent px-2 py-1 hover:border-gray-200"
                  >
                    {priorityOptions.map((p) => (
                      <option key={p.v} value={p.v}>{p.l}</option>
                    ))}
                  </select>
                </td>
                <td className="px-3 py-1.5">
                  <select
                    value={t.assigneeId ?? ""}
                    onChange={(e) => patchTask(t.id, { assigneeId: e.target.value || null })}
                    className="w-full rounded-md border border-transparent px-2 py-1 hover:border-gray-200"
                  >
                    <option value="">Ninguém</option>
                    {team.members.map((m) => (
                      <option key={m.user.id} value={m.user.id}>{m.user.name}</option>
                    ))}
                  </select>
                </td>
                <td className="px-3 py-1.5">
                  <input
                    type="date"
                    defaultValue={t.startDate?.slice(0, 10) ?? ""}
                    onBlur={(e) => patchTask(t.id, { startDate: e.target.value ? new Date(e.target.value).toISOString() : null })}
                    className="w-full rounded-md border border-transparent px-2 py-1 hover:border-gray-200"
                  />
                </td>
                <td className="px-3 py-1.5">
                  <input
                    type="date"
                    defaultValue={t.dueDate?.slice(0, 10) ?? ""}
                    onBlur={(e) => patchTask(t.id, { dueDate: e.target.value ? new Date(e.target.value).toISOString() : null })}
                    className="w-full rounded-md border border-transparent px-2 py-1 hover:border-gray-200"
                  />
                </td>
                <td className="px-3 py-1.5">
                  <select
                    value={t.parentTaskId ?? ""}
                    onChange={(e) => patchTask(t.id, { parentTaskId: e.target.value || null })}
                    className="w-full rounded-md border border-transparent px-2 py-1 hover:border-gray-200"
                  >
                    <option value="">— (tarefa principal)</option>
                    {tasks
                      .filter((o) => o.id !== t.id)
                      .map((o) => (
                        <option key={o.id} value={o.id}>{o.title}</option>
                      ))}
                  </select>
                </td>
                {fields.map((f) => {
                  const value = t.customFieldValues.find((v) => v.customFieldId === f.id)?.value ?? "";
                  return (
                    <td key={f.id} className="px-3 py-1.5">
                      {f.type === "TEXTO" && (
                        <input
                          defaultValue={value}
                          onBlur={(e) => e.target.value !== value && patchCustomField(t.id, f.id, e.target.value)}
                          className="w-full rounded-md border border-transparent px-2 py-1 hover:border-gray-200"
                        />
                      )}
                      {f.type === "NUMERO" && (
                        <input
                          type="number"
                          defaultValue={value}
                          onBlur={(e) => e.target.value !== value && patchCustomField(t.id, f.id, e.target.value)}
                          className="w-full rounded-md border border-transparent px-2 py-1 hover:border-gray-200"
                        />
                      )}
                      {f.type === "MOEDA" && (
                        <div className="flex items-center gap-1">
                          <span className="text-xs text-gray-400">R$</span>
                          <input
                            type="number"
                            step="0.01"
                            defaultValue={value}
                            onBlur={(e) => e.target.value !== value && patchCustomField(t.id, f.id, e.target.value)}
                            className="w-full rounded-md border border-transparent px-2 py-1 hover:border-gray-200"
                          />
                        </div>
                      )}
                      {f.type === "DATA" && (
                        <input
                          type="date"
                          defaultValue={value}
                          onBlur={(e) => e.target.value !== value && patchCustomField(t.id, f.id, e.target.value)}
                          className="w-full rounded-md border border-transparent px-2 py-1 hover:border-gray-200"
                        />
                      )}
                      {f.type === "LISTA" && (
                        <select
                          value={value}
                          onChange={(e) => patchCustomField(t.id, f.id, e.target.value)}
                          className="w-full rounded-md border border-transparent px-2 py-1 hover:border-gray-200"
                        >
                          <option value="">—</option>
                          {(JSON.parse(f.options || "[]") as string[]).map((opt) => (
                            <option key={opt} value={opt}>{opt}</option>
                          ))}
                        </select>
                      )}
                      {f.type === "CHECKBOX" && (
                        <input
                          type="checkbox"
                          checked={value === "true"}
                          onChange={(e) => patchCustomField(t.id, f.id, e.target.checked ? "true" : "false")}
                        />
                      )}
                      {f.type === "PESSOA" && (
                        <select
                          value={value}
                          onChange={(e) => patchCustomField(t.id, f.id, e.target.value)}
                          className="w-full rounded-md border border-transparent px-2 py-1 hover:border-gray-200"
                        >
                          <option value="">Ninguém</option>
                          {team.members.map((m) => (
                            <option key={m.user.id} value={m.user.id}>{m.user.name}</option>
                          ))}
                        </select>
                      )}
                      {f.type === "FORMULA" && (
                        <span className="block px-2 py-1 text-gray-500">
                          {(() => {
                            const result = getFormulaValue(f, t);
                            return result === null ? "—" : result.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
                          })()}
                        </span>
                      )}
                    </td>
                  );
                })}
                <td className="px-2 py-1.5 text-center">
                  {canManage && (
                    <button onClick={() => handleDeleteTask(t.id)} className="text-gray-300 hover:text-red-500">
                      ✕
                    </button>
                  )}
                </td>
              </tr>
            ))}
            <tr>
              <td className="px-3 py-2" colSpan={7 + fields.length}>
                <input
                  placeholder="+ Adicionar tarefa"
                  value={newTaskTitle}
                  onChange={(e) => setNewTaskTitle(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleAddTask()}
                  className="w-full rounded-md border border-dashed border-gray-300 px-2 py-1.5 text-sm"
                />
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
