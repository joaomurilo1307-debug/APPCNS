"use client";

import { useState } from "react";
import Link from "next/link";
import { STATUS_ACAO } from "@/lib/contractGoals/calculo";
import type { MetaContrato, PessoaMeta, AcaoMeta, DetalhesItemPlano } from "@/lib/contractGoals/tipos";

const campo = "w-full min-w-0 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800 focus:border-brand focus:outline-none disabled:bg-gray-50 disabled:text-gray-400";
const botao = "rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white disabled:opacity-50";
const data = (value?: string | null) => value?.slice(0, 10) ?? "";
const dataBR = (value?: string | null) => value ? data(value).split("-").reverse().join("/") : "—";
const texto = (value?: string | null) => value?.trim() || "—";
const opcoes = (a?: AcaoMeta) => Object.entries(STATUS_ACAO).filter(([id]) => !a?.taskId || id !== "CANCELADA");
const iso = (value: string | null) => value ? `${value}T12:00:00.000Z` : null;
const original = (a?: AcaoMeta) => data(a?.planDetails?.originalDueDate ?? a?.dueDate);
const reprogramado = (a?: AcaoMeta) => {
  if (a?.taskId) return a.dueDate && data(a.dueDate) !== original(a) ? data(a.dueDate) : "";
  return data(a?.planDetails?.replannedDueDate);
};
const inicio = (a?: AcaoMeta) => a?.taskId ? a.startDate : a?.startDate ?? a?.planDetails?.plannedStart;
const realizado = (a?: AcaoMeta) => a?.status !== "CONCLUIDA" ? null : a.taskId ? a.actualEndedAt : a.actualEndedAt ?? a.planDetails?.actualCompletion;

type Props = { meta: MetaContrato; pessoas: PessoaMeta[]; ocupado: boolean; onLoadPeople: () => Promise<void>; onAlterar: (id: string, body: unknown) => Promise<boolean> };

function FormularioItem({ meta, pessoas, ocupado, onAlterar, item, onSaved, onCancel }: Pick<Props, "meta" | "pessoas" | "ocupado" | "onAlterar"> & { item?: AcaoMeta; onSaved: () => void; onCancel?: () => void }) {
  const [status, setStatus] = useState(item?.status ?? "A_FAZER");
  const detalhes = item?.planDetails;
  const linha = (label: string, name: keyof DetalhesItemPlano, maxLength = 4000) => <label className="grid gap-1 text-sm text-gray-600">{label}<textarea name={name} rows={3} maxLength={maxLength} defaultValue={detalhes?.[name] ?? ""} className={campo} /></label>;
  const dateInput = (label: string, name: keyof DetalhesItemPlano, value: string, disabled = false) => <label className="grid gap-1 text-sm text-gray-600">{label}<input name={name} type="date" defaultValue={value} disabled={disabled} className={campo} /></label>;
  return <form aria-label={item ? `Editar item ${item.title}` : "Novo item do plano"} className="space-y-5" onSubmit={async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    const ler = (name: string) => { const value = values.get(name); return typeof value === "string" && value.trim() ? value.trim() : null; };
    const planDetails: DetalhesItemPlano = {
      competence: ler("competence"), item: ler("item"), account: ler("account"), fact: ler("fact"),
      correctiveMeasure: ler("correctiveMeasure"), correctiveHow: ler("correctiveHow"), preventiveMeasure: ler("preventiveMeasure"), preventiveHow: ler("preventiveHow"),
      plannedStart: ler("plannedStart"), originalDueDate: ler("originalDueDate"), replannedDueDate: ler("replannedDueDate"), actualCompletion: status === "CONCLUIDA" ? ler("actualCompletion") : null, notes: ler("notes"),
    };
    const saved = await onAlterar(meta.id, {
      operation: item ? "updateAction" : "action", ...(item ? { actionId: item.id } : {}),
      title: ler("title"), description: ler("description"), ownerId: ler("ownerId"), status,
      dueDate: iso(planDetails.replannedDueDate || planDetails.originalDueDate || null), planDetails,
    });
    if (saved) { if (!item) { form.reset(); setStatus("A_FAZER"); } onSaved(); }
  }}>
    <fieldset disabled={ocupado} className="space-y-5 disabled:opacity-60">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <label className="grid gap-1 text-sm text-gray-600 sm:col-span-2 lg:col-span-3">Item / ação<input name="title" autoFocus={Boolean(item)} required minLength={2} maxLength={250} defaultValue={item?.title ?? ""} placeholder="Identifique a ação que contribuirá para alcançar a meta" className={campo} /></label>
        <label className="grid gap-1 text-sm text-gray-600">Competência<input name="competence" type="month" defaultValue={detalhes?.competence ?? ""} className={campo} /></label>
        <label className="grid gap-1 text-sm text-gray-600">Identificação do item<input name="item" maxLength={80} defaultValue={detalhes?.item ?? ""} placeholder="Código ou número do item" className={campo} /></label>
        <label className="grid gap-1 text-sm text-gray-600">Pacote / Conta financeira<input name="account" maxLength={200} defaultValue={detalhes?.account ?? meta.sourceAccount ?? ""} className={campo} /></label>
        <label className="grid gap-1 text-sm text-gray-600 sm:col-span-2 lg:col-span-3">Descrição<textarea name="description" rows={3} maxLength={4000} defaultValue={item?.description ?? ""} className={campo} /></label>
        <div className="sm:col-span-2 lg:col-span-3">{linha("Fato", "fact")}</div>
      </div>
      <fieldset className="grid gap-3 rounded-xl border border-gray-200 p-4 sm:grid-cols-2">
        <legend className="px-1 text-sm font-semibold text-gray-700">Medidas e execução</legend>
        {linha("Medida corretiva", "correctiveMeasure")}{linha("Como? (Corretiva)", "correctiveHow")}
        {linha("Medida preventiva", "preventiveMeasure")}{linha("Como? (Preventiva)", "preventiveHow")}
      </fieldset>
      <fieldset className="grid gap-3 rounded-xl border border-gray-200 p-4 sm:grid-cols-2 lg:grid-cols-3">
        <legend className="px-1 text-sm font-semibold text-gray-700">Responsável e acompanhamento</legend>
        <label className="grid gap-1 text-sm text-gray-600">Responsável (Quem?)<select name="ownerId" defaultValue={item?.ownerId ?? ""} className={campo}><option value="">Sem responsável</option>{item?.owner && !pessoas.some((p) => p.id === item.ownerId) && <option value={item.owner.id}>{item.owner.name}</option>}{pessoas.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
        {dateInput("Data de início", "plannedStart", data(inicio(item)))}
        {dateInput("Prazo de término", "originalDueDate", original(item))}
        {dateInput("Prazo reprogramado", "replannedDueDate", reprogramado(item))}
        <label className="grid gap-1 text-sm text-gray-600">Status<select name="status" value={status} onChange={(event) => setStatus(event.target.value)} className={campo}>{opcoes(item).map(([id, nome]) => <option key={id} value={id}>{nome}</option>)}</select></label>
        <div>{dateInput("Prazo realizado", "actualCompletion", data(realizado(item)), status !== "CONCLUIDA")}<p className="mt-1 text-xs text-gray-400">Informe a data realizada ao concluir o item.</p></div>
      </fieldset>
      {linha("Observações", "notes")}
      <div className="flex flex-wrap gap-2"><button disabled={ocupado} className={botao}>{ocupado ? "Salvando…" : item ? "Salvar item" : "Adicionar item"}</button>{onCancel && <button type="button" disabled={ocupado} onClick={onCancel} className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-600">Cancelar edição</button>}</div>
    </fieldset>
  </form>;
}

export default function AtividadesDaMeta({ meta, pessoas, ocupado, onLoadPeople, onAlterar }: Props) {
  const [editada, setEditada] = useState<string | null>(null);
  const podeEditar = meta.canManage && (!meta.actionPlan || meta.actionPlan.canManage);
  const temPlano = meta.hasPlan ?? Boolean(meta.standalonePlan || meta.actionPlan || meta.kind === "PLANO" || meta.actions.length);
  const itemEditado = meta.actions.find((action) => action.id === editada);
  const headers = ["Competência", "Item", "Pacote / Conta financeira", "Descrição", "Fato", "Medida corretiva", "Como? (Corretiva)", "Medida preventiva", "Como? (Preventiva)", "Responsável (Quem?)", "Data de início", "Prazo de término", "Prazo reprogramado", "Prazo realizado", "Status", "Observações"];
  const th = "sticky top-0 z-10 border-b border-gray-200 bg-gray-50 px-3 py-3 text-left text-xs font-semibold text-gray-600";
  const td = "border-b border-gray-100 px-3 py-3 align-top text-xs leading-relaxed text-gray-600 whitespace-pre-wrap break-words";
  return <section className="min-w-0 space-y-4" aria-label={`Plano de ação da meta ${meta.title}`}>
    <header className="flex flex-wrap items-center justify-between gap-2"><div><h4 className="text-sm font-semibold text-gray-800">Itens do plano de ação <span className="font-normal text-gray-400">· {meta.actions.filter((a) => a.status === "CONCLUIDA").length} de {meta.actions.filter((a) => a.status !== "CANCELADA").length} concluídos</span></h4><p className="mt-1 text-xs text-gray-500">Competência, fatos, medidas, responsáveis e acompanhamento conforme o modelo do contrato.</p></div>{meta.actionPlan && <Link href={`/projetos/${meta.actionPlan.id}`} className="text-xs font-medium text-teal-700 hover:underline">Gerenciar atividades no projeto ↗</Link>}</header>
    {meta.actions.length > 0 ? <>
      <p className="text-xs text-gray-400">Deslize a tabela para consultar todas as colunas.{meta.actionPlan ? " Responsável, datas e status acompanham as mesmas atividades do projeto." : " O plano pode ser preenchido antes de criar um projeto."}</p>
      <div role="region" aria-label="Tabela do plano de ação" tabIndex={0} className="max-h-[600px] overflow-auto rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-brand/30">
        <table className="w-full table-fixed border-collapse" style={{ minWidth: 3060 }}>
          <colgroup>{[110, 105, 165, 300, 250, 225, 225, 225, 225, 160, 125, 125, 125, 125, 200, 240].map((width, index) => <col key={index} style={{ width }} />)}</colgroup>
          <thead><tr>{headers.map((header) => <th scope="col" key={header} className={th}>{header}</th>)}</tr></thead>
          <tbody>{meta.actions.map((a, index) => {
            const detail = a.planDetails;
            return <tr key={a.id} className="even:bg-gray-50/40 hover:bg-teal-50/30">
              <td className={td}>{detail?.competence ? `${detail.competence.slice(5)}/${detail.competence.slice(0, 4)}` : "—"}</td>
              <td className={td}>{detail?.item || index + 1}</td>
              <td className={td}>{texto(detail?.account)}</td>
              <td className={td}><span className="block font-medium text-gray-800">{a.title}</span>{a.description && <span className="mt-1 block">{a.description}</span>}{a.taskId && <span className="mt-2 block text-[11px] text-teal-700">Vinculado ao projeto</span>}{podeEditar && a.canUpdate && <button type="button" onClick={() => { setEditada(a.id); void onLoadPeople(); }} aria-label={`Editar item ${a.title}`} className="mt-2 rounded-md border border-gray-200 bg-white px-2 py-1 text-xs text-gray-600 hover:border-teal-300">Editar item</button>}</td>
              {[detail?.fact, detail?.correctiveMeasure, detail?.correctiveHow, detail?.preventiveMeasure, detail?.preventiveHow].map((value, position) => <td key={position} className={td}>{texto(value)}</td>)}
              <td className={td}>{a.owner?.name || "Sem responsável"}</td>
              <td className={td}>{dataBR(inicio(a))}</td>
              <td className={td}>{dataBR(original(a))}</td>
              <td className={td}>{dataBR(reprogramado(a))}</td>
              <td className={td}>{dataBR(realizado(a))}</td>
              <td className={td}>{a.canUpdate ? <select aria-label={`Situação da ação ${a.title}`} disabled={ocupado} value={a.status} onChange={(event) => void onAlterar(meta.id, { operation: "updateAction", actionId: a.id, status: event.target.value })} className={`${campo} px-2 py-1.5 text-xs`}>{opcoes(a).map(([id, nome]) => <option key={id} value={id}>{nome}</option>)}</select> : STATUS_ACAO[a.status as keyof typeof STATUS_ACAO] ?? a.status}</td>
              <td className={td}>{texto(detail?.notes)}</td>
            </tr>;
          })}</tbody>
        </table>
      </div>
    </> : <p className="rounded-lg bg-gray-50 p-3 text-sm text-gray-500">{temPlano ? "Adicione o primeiro item do plano, com o fato e as medidas para alcançar a meta." : "Crie o plano de ação para registrar fatos, medidas, responsáveis e prazos."}</p>}
    {itemEditado && podeEditar && itemEditado.canUpdate && <div key={itemEditado.id} className="rounded-xl border border-teal-200 bg-teal-50/20 p-4"><h5 className="mb-4 text-sm font-semibold text-gray-800">Editar item do plano</h5><FormularioItem meta={meta} pessoas={pessoas} ocupado={ocupado} onAlterar={onAlterar} item={itemEditado} onSaved={() => setEditada(null)} onCancel={() => setEditada(null)} /></div>}
    {(meta.canAddAction ?? podeEditar) && temPlano && <details onToggle={(event) => { if (event.currentTarget.open) void onLoadPeople(); }} className="rounded-xl border border-gray-200 p-4"><summary className="cursor-pointer text-sm font-medium text-teal-700">Adicionar item ao plano</summary><div className="mt-5"><FormularioItem meta={meta} pessoas={pessoas} ocupado={ocupado} onAlterar={onAlterar} onSaved={() => {}} /></div></details>}
  </section>;
}
