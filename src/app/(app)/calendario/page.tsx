"use client";

import { useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import TaskDetailModal from "@/components/TaskDetailModal";
import EventModal from "@/components/EventModal";
import Avatar from "@/components/Avatar";
import OutlookConnect from "@/components/OutlookConnect";
import {
  CalItem,
  ColorBy,
  colorFor,
  eventTypeColor,
  eventTypeLabel,
} from "@/lib/calendarColors";

type RawTask = {
  id: string;
  title: string;
  dueDate: string | null;
  startDate: string | null;
  priority: string;
  locked: boolean;
  project: { id: string; name: string } | null;
  assignee: { id: string; name: string; avatarColor: string | null } | null;
};

type RawEvent = {
  id: string;
  title: string;
  type: string;
  startAt: string;
  endAt: string | null;
  allDay: boolean;
  project: { id: string; name: string } | null;
  creator: { id: string; name: string; avatarColor: string | null };
};

type ViewMode = "month" | "week" | "day" | "faixa";

const HOUR_START = 6;
const HOUR_END = 22;
const ROW_HEIGHT = 48;

function startOfWeek(d: Date) {
  const r = new Date(d);
  r.setHours(0, 0, 0, 0);
  r.setDate(r.getDate() - r.getDay());
  return r;
}

function addDays(d: Date, n: number) {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function startOfMonthGrid(year: number, month: number) {
  const first = new Date(year, month, 1);
  const gridStart = new Date(year, month, 1 - first.getDay());
  return Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
}

function rangeForView(view: ViewMode, cursor: Date) {
  if (view === "month") {
    const days = startOfMonthGrid(cursor.getFullYear(), cursor.getMonth());
    return { from: days[0], to: addDays(days[days.length - 1], 1) };
  }
  if (view === "day") return { from: new Date(cursor.setHours(0, 0, 0, 0)), to: addDays(cursor, 1) };
  const start = startOfWeek(cursor);
  return { from: start, to: addDays(start, 7) };
}

export default function CalendarioPage() {
  const { data: session } = useSession();
  const currentUserId = (session?.user as any)?.id ?? "";
  const [outlookFeedback, setOutlookFeedback] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const feedback = params.get("outlook");
    if (!feedback) return;
    setOutlookFeedback(feedback);
    window.history.replaceState({}, "", window.location.pathname);
    const t = setTimeout(() => setOutlookFeedback(null), 5000);
    return () => clearTimeout(t);
  }, []);

  const [view, setView] = useState<ViewMode>("month");
  const [cursor, setCursor] = useState(() => new Date());
  const [colorBy, setColorBy] = useState<ColorBy>("prioridade");
  const [rangeStartHour, setRangeStartHour] = useState(8);
  const [rangeEndHour, setRangeEndHour] = useState(18);

  const [tasks, setTasks] = useState<RawTask[]>([]);
  const [events, setEvents] = useState<RawEvent[]>([]);
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);
  const [members, setMembers] = useState<{ id: string; name: string }[]>([]);

  const [taskModalId, setTaskModalId] = useState<string | null>(null);
  const [eventModal, setEventModal] = useState<{ id?: string; initialStart?: Date } | null>(null);

  const { from, to } = useMemo(() => rangeForView(view, new Date(cursor)), [view, cursor]);

  async function loadItems() {
    const [t, e] = await Promise.all([
      fetch("/api/tasks").then((r) => r.json()),
      fetch(`/api/events?from=${from.toISOString()}&to=${to.toISOString()}`).then((r) => r.json()),
    ]);
    setTasks(t);
    setEvents(e);
  }

  useEffect(() => {
    loadItems();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, cursor.toDateString()]);

  useEffect(() => {
    fetch("/api/projects").then((r) => r.json()).then((ps) => setProjects(ps.map((p: any) => ({ id: p.id, name: p.name }))));
    fetch("/api/teams").then((r) => r.json()).then((teams: any[]) => {
      const map = new Map<string, { id: string; name: string }>();
      teams.forEach((t) => t.members.forEach((m: any) => map.set(m.user.id, m.user)));
      setMembers(Array.from(map.values()));
    });
  }, []);

  const items: CalItem[] = useMemo(() => {
    const taskItems: CalItem[] = tasks
      .filter((t) => t.dueDate || t.startDate)
      .map((t) => ({
        id: t.id,
        kind: "task",
        title: t.title,
        start: new Date((t.dueDate ?? t.startDate)!),
        end: null,
        allDay: true,
        projectId: t.project?.id ?? null,
        projectName: t.project?.name ?? null,
        priority: t.priority,
        personName: t.assignee?.name ?? null,
        personColor: t.assignee?.avatarColor ?? null,
        locked: t.locked,
      }));
    const eventItems: CalItem[] = events.map((e) => ({
      id: e.id,
      kind: "event",
      title: e.title,
      start: new Date(e.startAt),
      end: e.endAt ? new Date(e.endAt) : null,
      allDay: e.allDay,
      projectId: e.project?.id ?? null,
      projectName: e.project?.name ?? null,
      type: e.type,
      personName: e.creator.name,
      personColor: e.creator.avatarColor,
    }));
    return [...taskItems, ...eventItems].sort((a, b) => a.start.getTime() - b.start.getTime());
  }, [tasks, events]);

  function openItem(item: CalItem) {
    if (item.kind === "task") setTaskModalId(item.id);
    else setEventModal({ id: item.id });
  }

  function navigate(delta: number) {
    if (view === "month") setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + delta, 1));
    else if (view === "day") setCursor(addDays(cursor, delta));
    else setCursor(addDays(cursor, delta * 7));
  }

  function itemsOnDay(day: Date) {
    return items.filter((i) => sameDay(i.start, day));
  }

  function chip(item: CalItem, compact = true) {
    const color = colorFor(item, colorBy);
    return (
      <div
        key={item.id}
        onClick={(e) => {
          e.stopPropagation();
          openItem(item);
        }}
        className={`flex items-center gap-1 truncate rounded px-1.5 py-0.5 text-[11px] cursor-pointer hover:opacity-80`}
        style={{ backgroundColor: color + "22", borderLeft: `3px solid ${color}` }}
        title={item.title}
      >
        {!item.allDay && (
          <span className="shrink-0 text-[10px] text-gray-500">
            {item.start.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
          </span>
        )}
        {item.locked && <span>🔒</span>}
        <span className="truncate">{item.title}</span>
        {!compact && item.personName && (
          <span className="ml-auto flex items-center gap-1 text-gray-500">
            <Avatar name={item.personName} color={item.personColor} size={16} />
          </span>
        )}
      </div>
    );
  }

  const monthDays = useMemo(() => startOfMonthGrid(cursor.getFullYear(), cursor.getMonth()), [cursor]);
  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(startOfWeek(cursor), i)), [cursor]);
  const hours = useMemo(() => Array.from({ length: HOUR_END - HOUR_START }, (_, i) => HOUR_START + i), []);

  const headerLabel =
    view === "month"
      ? cursor.toLocaleDateString("pt-BR", { month: "long", year: "numeric" })
      : view === "day"
      ? cursor.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" })
      : `${weekDays[0].toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })} – ${weekDays[6].toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })}`;

  function hourGridColumn(day: Date) {
    const dayItems = itemsOnDay(day).filter((i) => !i.allDay);
    const allDayItems = itemsOnDay(day).filter((i) => i.allDay);
    return (
      <div className="relative flex-1 border-l border-gray-100">
        <div className="flex flex-col gap-0.5 border-b border-gray-100 p-1">
          {allDayItems.map((i) => chip(i))}
        </div>
        <div className="relative">
          {hours.map((h) => (
            <div
              key={h}
              onClick={() => setEventModal({ initialStart: new Date(day.getFullYear(), day.getMonth(), day.getDate(), h) })}
              className="cursor-pointer border-b border-gray-50 hover:bg-brand/5"
              style={{ height: ROW_HEIGHT }}
            />
          ))}
          {dayItems.map((item) => {
            const startH = item.start.getHours() + item.start.getMinutes() / 60;
            const clampedStart = Math.min(Math.max(startH, HOUR_START), HOUR_END);
            const top = (clampedStart - HOUR_START) * ROW_HEIGHT;
            const durationH = item.end ? Math.max((item.end.getTime() - item.start.getTime()) / 3600000, 0.4) : 0.6;
            const height = Math.min(durationH * ROW_HEIGHT, (HOUR_END - HOUR_START) * ROW_HEIGHT - top);
            const color = colorFor(item, colorBy);
            return (
              <div
                key={item.id}
                onClick={(e) => {
                  e.stopPropagation();
                  openItem(item);
                }}
                className="absolute left-0.5 right-0.5 cursor-pointer overflow-hidden rounded px-1 py-0.5 text-[11px] shadow-sm hover:opacity-90"
                style={{ top, height: Math.max(height, 18), backgroundColor: color + "33", borderLeft: `3px solid ${color}` }}
                title={item.title}
              >
                <span className="font-medium">{item.title}</span>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div>
      {outlookFeedback === "conectado" && (
        <div className="mb-4 rounded-md bg-green-50 px-3 py-2 text-sm text-green-700">Outlook conectado com sucesso.</div>
      )}
      {outlookFeedback === "erro" && (
        <div className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">Não foi possível conectar o Outlook. Tente novamente.</div>
      )}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold capitalize">{headerLabel}</h1>
        <OutlookConnect />
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-md border border-gray-300 text-sm">
            {(["month", "week", "day", "faixa"] as ViewMode[]).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={`px-3 py-1.5 ${view === v ? "bg-brand text-white" : "hover:bg-gray-50"} ${v !== "month" ? "border-l border-gray-300" : ""}`}
              >
                {v === "month" ? "Mês" : v === "week" ? "Semana" : v === "day" ? "Dia" : "Faixa de horários"}
              </button>
            ))}
          </div>
          <select
            value={colorBy}
            onChange={(e) => setColorBy(e.target.value as ColorBy)}
            className="rounded-md border border-gray-300 px-2 py-1.5 text-sm"
          >
            <option value="prioridade">Cor por prioridade</option>
            <option value="responsavel">Cor por responsável</option>
            <option value="projeto">Cor por projeto</option>
          </select>
          <button onClick={() => navigate(-1)} className="rounded-md border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50">←</button>
          <button onClick={() => setCursor(new Date())} className="rounded-md border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50">Hoje</button>
          <button onClick={() => navigate(1)} className="rounded-md border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50">→</button>
          <button
            onClick={() => setEventModal({ initialStart: new Date() })}
            className="rounded-md bg-brand px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-dark"
          >
            + Novo evento
          </button>
        </div>
      </div>

      {view === "month" && (
        <div className="grid grid-cols-7 gap-px overflow-hidden rounded-xl border border-gray-200 bg-gray-200">
          {["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"].map((d) => (
            <div key={d} className="bg-gray-50 px-2 py-2 text-center text-xs font-semibold text-gray-500">{d}</div>
          ))}
          {monthDays.map((d) => {
            const inMonth = d.getMonth() === cursor.getMonth();
            const isToday = sameDay(d, new Date());
            const dayItems = itemsOnDay(d);
            return (
              <div
                key={d.toISOString()}
                onClick={() => setEventModal({ initialStart: new Date(d.getFullYear(), d.getMonth(), d.getDate(), 9) })}
                className={`min-h-[110px] cursor-pointer bg-white p-2 hover:bg-gray-50 ${!inMonth ? "opacity-40" : ""}`}
              >
                <span className={`text-xs ${isToday ? "rounded-full bg-brand px-1.5 py-0.5 text-white" : "text-gray-500"}`}>
                  {d.getDate()}
                </span>
                <div className="mt-1 flex flex-col gap-1">
                  {dayItems.slice(0, 3).map((i) => chip(i))}
                  {dayItems.length > 3 && <span className="text-[10px] text-gray-400">+{dayItems.length - 3} mais</span>}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {view === "week" && (
        <div className="flex overflow-hidden rounded-xl border border-gray-200 bg-white">
          <div className="w-14 shrink-0 border-r border-gray-100">
            <div className="h-[52px] border-b border-gray-100" />
            {hours.map((h) => (
              <div key={h} className="flex items-start justify-end pr-1 text-[10px] text-gray-400" style={{ height: ROW_HEIGHT }}>
                {String(h).padStart(2, "0")}h
              </div>
            ))}
          </div>
          {weekDays.map((d) => (
            <div key={d.toISOString()} className="flex flex-1 flex-col">
              <div className={`flex h-[52px] flex-col items-center justify-center border-b border-gray-100 text-xs ${sameDay(d, new Date()) ? "bg-brand/10 font-semibold text-brand-dark" : "text-gray-500"}`}>
                <span className="capitalize">{d.toLocaleDateString("pt-BR", { weekday: "short" })}</span>
                <span>{d.getDate()}</span>
              </div>
              {hourGridColumn(d)}
            </div>
          ))}
        </div>
      )}

      {view === "day" && (
        <div className="flex overflow-hidden rounded-xl border border-gray-200 bg-white">
          <div className="w-14 shrink-0 border-r border-gray-100">
            <div className="h-[52px] border-b border-gray-100" />
            {hours.map((h) => (
              <div key={h} className="flex items-start justify-end pr-1 text-[10px] text-gray-400" style={{ height: ROW_HEIGHT }}>
                {String(h).padStart(2, "0")}h
              </div>
            ))}
          </div>
          <div className="flex flex-1 flex-col">
            <div className="flex h-[52px] items-center justify-center border-b border-gray-100 text-sm font-medium">
              {cursor.toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" })}
            </div>
            {hourGridColumn(cursor)}
          </div>
        </div>
      )}

      {view === "faixa" && (
        <div>
          <div className="mb-3 flex items-center gap-2 text-sm text-gray-600">
            <span>Mostrar de</span>
            <select value={rangeStartHour} onChange={(e) => setRangeStartHour(Number(e.target.value))} className="rounded-md border border-gray-300 px-2 py-1">
              {Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{String(h).padStart(2, "0")}h</option>)}
            </select>
            <span>até</span>
            <select value={rangeEndHour} onChange={(e) => setRangeEndHour(Number(e.target.value))} className="rounded-md border border-gray-300 px-2 py-1">
              {Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{String(h).padStart(2, "0")}h</option>)}
            </select>
            <span className="text-xs text-gray-400">(itens de dia inteiro sempre aparecem)</span>
          </div>
          <div className="flex flex-col gap-2">
            {weekDays.map((d) => {
              const dayItems = itemsOnDay(d).filter((i) => {
                if (i.allDay) return true;
                const h = i.start.getHours();
                return h >= rangeStartHour && h < rangeEndHour;
              });
              return (
                <div key={d.toISOString()} className="rounded-xl border border-gray-200 bg-white p-3">
                  <p className={`mb-2 text-sm font-semibold capitalize ${sameDay(d, new Date()) ? "text-brand-dark" : "text-gray-700"}`}>
                    {d.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "short" })}
                  </p>
                  <div className="flex flex-col gap-1">
                    {dayItems.length === 0 && <p className="text-xs text-gray-400">Nada nesse período.</p>}
                    {dayItems.map((i) => chip(i, false))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="mt-4 flex flex-wrap gap-3 text-xs text-gray-500">
        {colorBy === "prioridade" && (
          <>
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full" style={{ background: "#9ca3af" }} /> Baixa</span>
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full" style={{ background: "#3b82f6" }} /> Média</span>
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full" style={{ background: "#f97316" }} /> Alta</span>
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full" style={{ background: "#dc2626" }} /> Urgente</span>
          </>
        )}
        <span className="mx-1 text-gray-300">|</span>
        {Object.entries(eventTypeLabel).map(([v, l]) => (
          <span key={v} className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-full" style={{ background: eventTypeColor[v] }} /> {l}
          </span>
        ))}
      </div>

      {taskModalId && (
        <TaskDetailModal taskId={taskModalId} onClose={() => setTaskModalId(null)} onChanged={loadItems} />
      )}
      {eventModal && (
        <EventModal
          eventId={eventModal.id}
          initialStart={eventModal.initialStart}
          projects={projects}
          members={members}
          currentUserId={currentUserId}
          onClose={() => setEventModal(null)}
          onChanged={loadItems}
        />
      )}
    </div>
  );
}
