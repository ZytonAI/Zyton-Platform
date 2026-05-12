"use client";

import { useState, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { EventForm } from "./EventForm";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import {
  Plus,
  MoreHorizontal,
  Pencil,
  Trash2,
  Search,
  List,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  Circle,
  MessageCircle,
} from "lucide-react";
import { toast } from "sonner";
import type { CalendarEvent } from "@/types";

type ViewMode = "list" | "calendar";

const TYPE_LABELS: Record<string, string> = {
  event:    "Evento",
  task:     "Tarea",
  deadline: "Deadline",
};

const TYPE_CHIP_COLORS: Record<string, string> = {
  event:    "bg-blue-100 text-blue-700",
  task:     "bg-violet-100 text-violet-700",
  deadline: "bg-orange-100 text-orange-700",
};

const WEEK_DAYS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("es-ES", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function toDateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function getCalendarCells(year: number, month: number): Date[] {
  const firstDay = new Date(year, month, 1);
  const lastDay  = new Date(year, month + 1, 0);
  // Monday = 0 … Sunday = 6
  const startPad = (firstDay.getDay() + 6) % 7;

  const cells: Date[] = [];
  for (let i = startPad; i > 0; i--) {
    cells.push(new Date(year, month, 1 - i));
  }
  for (let d = 1; d <= lastDay.getDate(); d++) {
    cells.push(new Date(year, month, d));
  }
  const remainder = cells.length % 7;
  if (remainder > 0) {
    for (let i = 1; i <= 7 - remainder; i++) {
      cells.push(new Date(year, month + 1, i));
    }
  }
  return cells;
}

function groupByDay(events: CalendarEvent[]): Map<string, CalendarEvent[]> {
  const map = new Map<string, CalendarEvent[]>();
  for (const ev of events) {
    const key = toDateKey(new Date(ev.event_date));
    map.set(key, [...(map.get(key) ?? []), ev]);
  }
  return map;
}

interface Props {
  initialEvents: CalendarEvent[];
}

export function EventsClient({ initialEvents }: Props) {
  const router = useRouter();
  const [events, setEvents]           = useState<CalendarEvent[]>(initialEvents);
  const [search, setSearch]           = useState("");
  const [view, setView]               = useState<ViewMode>("calendar");
  const [viewMonth, setViewMonth]     = useState(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() };
  });
  const [showForm, setShowForm]       = useState(false);
  const [editEvent, setEditEvent]     = useState<CalendarEvent | undefined>();
  const [defaultDate, setDefaultDate] = useState<string | undefined>();
  const [deletingId, setDeletingId]   = useState<string | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const draggedId = useRef<string | null>(null);
  const [dragOverKey, setDragOverKey] = useState<string | null>(null);

  const filtered = events.filter((e) =>
    [e.title, e.description].some((v) =>
      v?.toLowerCase().includes(search.toLowerCase())
    )
  );

  const calendarCells = useMemo(
    () => getCalendarCells(viewMonth.year, viewMonth.month),
    [viewMonth]
  );

  const eventsByDay = useMemo(() => groupByDay(events), [events]);

  const todayKey = toDateKey(new Date());

  const monthTitle = new Date(viewMonth.year, viewMonth.month, 1)
    .toLocaleDateString("es-ES", { month: "long", year: "numeric" })
    .replace(/^\w/, (c) => c.toUpperCase());

  function prevMonth() {
    setViewMonth(({ year, month }) =>
      month === 0 ? { year: year - 1, month: 11 } : { year, month: month - 1 }
    );
  }

  function nextMonth() {
    setViewMonth(({ year, month }) =>
      month === 11 ? { year: year + 1, month: 0 } : { year, month: month + 1 }
    );
  }

  function openNewForDay(date: Date) {
    setDefaultDate(`${toDateKey(date)}T09:00`);
    setEditEvent(undefined);
    setShowForm(true);
  }

  function handleSaved(event: CalendarEvent) {
    setEvents((prev) => {
      const idx = prev.findIndex((e) => e.id === event.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = event;
        return next;
      }
      return [event, ...prev];
    });
    toast.success(editEvent ? "Evento actualizado" : "Evento creado");
    setEditEvent(undefined);
    setDefaultDate(undefined);
  }

  async function handleToggleDone(event: CalendarEvent, e: React.MouseEvent) {
    e.stopPropagation();
    const newStatus = event.status === "done" ? "pending" : "done";
    const res = await fetch(`/api/events/${event.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus }),
    });
    if (res.ok) {
      const updated = await res.json();
      setEvents((prev) => prev.map((e) => e.id === updated.id ? updated : e));
    }
  }

  async function handleContactarLead(leadId: string) {
    const res = await fetch("/api/whatsapp/conversations");
    if (!res.ok) { toast.error("Error cargando conversaciones"); return; }
    const convs: { id: string; lead_id: string | null }[] = await res.json();
    const conv = convs.find((c) => c.lead_id === leadId);
    if (conv) {
      router.push(`/chat?conv=${conv.id}`);
    } else {
      toast.info("No hay chat activo con este lead todavía");
    }
  }

  async function handleDelete() {
    if (!deletingId) return;
    setDeleteLoading(true);
    const res = await fetch(`/api/events/${deletingId}`, { method: "DELETE" });
    if (res.ok) {
      setEvents((prev) => prev.filter((e) => e.id !== deletingId));
      toast.success("Evento eliminado");
    }
    setDeleteLoading(false);
    setDeletingId(null);
  }

  function handleDragStart(ev: CalendarEvent, e: React.DragEvent) {
    e.stopPropagation();
    draggedId.current = ev.id;
    e.dataTransfer.effectAllowed = "move";
  }

  async function handleDrop(targetDate: Date, e: React.DragEvent) {
    e.preventDefault();
    setDragOverKey(null);
    const id = draggedId.current;
    draggedId.current = null;
    if (!id) return;

    const event = events.find((ev) => ev.id === id);
    if (!event) return;

    const targetKey = toDateKey(targetDate);
    if (targetKey === toDateKey(new Date(event.event_date))) return;

    const orig = new Date(event.event_date);
    // Construir nueva fecha en hora LOCAL del usuario para que el calendario
    // la muestre siempre en el día correcto, independiente de la zona horaria.
    const newDate = new Date(
      targetDate.getFullYear(),
      targetDate.getMonth(),
      targetDate.getDate(),
      orig.getHours(),
      orig.getMinutes(),
      0, 0,
    );
    const newEventDate = newDate.toISOString();

    const res = await fetch(`/api/events/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event_date: newEventDate }),
    });
    if (res.ok) {
      const updated: CalendarEvent = await res.json();
      setEvents((prev) => prev.map((ev) => (ev.id === updated.id ? updated : ev)));
      toast.success("Evento movido");
    } else {
      toast.error("Error al mover el evento");
    }
  }

  return (
    <div className="p-6 space-y-4">
      {/* ── Top bar ── */}
      <div className="flex items-center justify-between gap-4">
        {/* Left: search (list) or month nav (calendar) */}
        {view === "list" ? (
          <div className="relative max-w-sm flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Buscar eventos..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" onClick={prevMonth}>
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <span className="text-sm font-semibold text-gray-900 min-w-[160px] text-center">
              {monthTitle}
            </span>
            <Button variant="outline" size="icon" onClick={nextMonth}>
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        )}

        {/* Right: view toggle + new event */}
        <div className="flex items-center gap-2 shrink-0">
          <div className="flex rounded-lg border overflow-hidden">
            <button
              onClick={() => setView("list")}
              className={`px-3 py-1.5 text-sm flex items-center gap-1.5 transition-colors ${
                view === "list"
                  ? "bg-primary text-primary-foreground"
                  : "bg-white text-muted-foreground hover:bg-gray-50"
              }`}
            >
              <List className="w-3.5 h-3.5" />
              Lista
            </button>
            <button
              onClick={() => setView("calendar")}
              className={`px-3 py-1.5 text-sm flex items-center gap-1.5 transition-colors border-l ${
                view === "calendar"
                  ? "bg-primary text-primary-foreground"
                  : "bg-white text-muted-foreground hover:bg-gray-50"
              }`}
            >
              <CalendarDays className="w-3.5 h-3.5" />
              Calendario
            </button>
          </div>

          <Button
            onClick={() => {
              setEditEvent(undefined);
              setDefaultDate(undefined);
              setShowForm(true);
            }}
            className="gap-2"
          >
            <Plus className="w-4 h-4" />
            Nuevo evento
          </Button>
        </div>
      </div>

      {/* ── List view — agrupada por día ── */}
      {view === "list" && (
        <div className="rounded-lg border bg-white shadow-sm overflow-hidden">
          {filtered.length === 0 ? (
            <p className="text-center text-muted-foreground py-12">
              {search ? "Sin resultados para tu búsqueda" : "No hay eventos aún. ¡Crea el primero!"}
            </p>
          ) : (() => {
            // Agrupar por día
            const groups = new Map<string, CalendarEvent[]>();
            for (const ev of filtered) {
              const key = toDateKey(new Date(ev.event_date));
              groups.set(key, [...(groups.get(key) ?? []), ev]);
            }
            const sortedKeys = [...groups.keys()].sort();
            return sortedKeys.map((dayKey) => {
              const dayEvents = groups.get(dayKey)!;
              const dayLabel = new Date(dayKey + "T12:00").toLocaleDateString("es-ES", {
                weekday: "long", day: "numeric", month: "long",
              }).replace(/^\w/, (c) => c.toUpperCase());
              const isToday = dayKey === todayKey;

              return (
                <div key={dayKey}>
                  {/* Cabecera del día */}
                  <div className={`px-4 py-2 border-b flex items-center gap-2 ${isToday ? "bg-primary/5" : "bg-gray-50"}`}>
                    <span className={`text-sm font-bold ${isToday ? "text-primary" : "text-gray-800"}`}>
                      {dayLabel}
                    </span>
                    {isToday && (
                      <span className="text-[10px] font-semibold bg-primary text-primary-foreground px-1.5 py-0.5 rounded-full">
                        HOY
                      </span>
                    )}
                  </div>

                  {/* Eventos del día */}
                  {dayEvents.map((event) => (
                    <div
                      key={event.id}
                      className={`flex items-center gap-3 px-4 py-3 border-b last:border-b-0 hover:bg-gray-50 transition-colors ${event.status === "done" ? "opacity-50" : ""}`}
                    >
                      {/* Checkbox */}
                      <button
                        onClick={(e) => handleToggleDone(event, e)}
                        className="shrink-0 text-muted-foreground hover:text-primary transition-colors"
                      >
                        {event.status === "done"
                          ? <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                          : <Circle className="w-4 h-4" />
                        }
                      </button>

                      {/* Título + tipo */}
                      <div className="flex-1 min-w-0">
                        <span className={`font-medium text-sm ${event.status === "done" ? "line-through text-muted-foreground" : "text-gray-900"}`}>
                          {event.title}
                        </span>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${TYPE_CHIP_COLORS[event.type] ?? "bg-gray-100 text-gray-600"}`}>
                            {TYPE_LABELS[event.type]}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {new Date(event.event_date).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })}
                          </span>
                        </div>
                      </div>

                      {/* Botón Contactar si tiene lead */}
                      {event.lead_id && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-1.5 text-xs shrink-0"
                          onClick={() => handleContactarLead(event.lead_id!)}
                        >
                          <MessageCircle className="w-3.5 h-3.5" />
                          Contactar
                        </Button>
                      )}

                      {/* Estado + menú */}
                      <StatusBadge status={event.status} type="event" />
                      <DropdownMenu>
                        <DropdownMenuTrigger className="inline-flex items-center justify-center w-8 h-8 rounded-md hover:bg-accent transition-colors shrink-0">
                          <MoreHorizontal className="w-4 h-4" />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => { setEditEvent(event); setShowForm(true); }}>
                            <Pencil className="w-4 h-4 mr-2" /> Editar
                          </DropdownMenuItem>
                          <DropdownMenuItem className="text-destructive" onClick={() => setDeletingId(event.id)}>
                            <Trash2 className="w-4 h-4 mr-2" /> Eliminar
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  ))}
                </div>
              );
            });
          })()}
        </div>
      )}

      {/* ── Calendar view ── */}
      {view === "calendar" && (
        <div className="rounded-lg border bg-white shadow-sm overflow-hidden">
          {/* Week day headers */}
          <div className="grid grid-cols-7 border-b bg-gray-50">
            {WEEK_DAYS.map((day) => (
              <div
                key={day}
                className="py-2 text-xs font-medium text-muted-foreground text-center border-r last:border-r-0"
              >
                {day}
              </div>
            ))}
          </div>

          {/* Day cells */}
          <div className="grid grid-cols-7">
            {calendarCells.map((date, idx) => {
              const key            = toDateKey(date);
              const isCurrentMonth = date.getMonth() === viewMonth.month;
              const isToday        = key === todayKey;
              const dayEvents      = (eventsByDay.get(key) ?? []).filter((ev) => ev.status !== "done");
              const MAX_VISIBLE    = 3;
              const overflow       = dayEvents.length - MAX_VISIBLE;

              return (
                <div
                  key={idx}
                  onClick={() => isCurrentMonth && openNewForDay(date)}
                  onDragOver={(e) => { e.preventDefault(); if (isCurrentMonth) setDragOverKey(key); }}
                  onDragLeave={() => setDragOverKey(null)}
                  onDrop={(e) => isCurrentMonth && handleDrop(date, e)}
                  className={[
                    "min-h-[100px] p-1.5 border-b transition-colors",
                    (idx + 1) % 7 !== 0 ? "border-r" : "",
                    dragOverKey === key && isCurrentMonth
                      ? "bg-blue-100/60"
                      : isCurrentMonth
                      ? "bg-white hover:bg-blue-50/40 cursor-pointer"
                      : "bg-gray-50/60 cursor-default",
                  ].join(" ")}
                >
                  {/* Day number */}
                  <div className="flex justify-end mb-1">
                    <span
                      className={[
                        "text-xs font-medium w-6 h-6 flex items-center justify-center rounded-full",
                        isToday
                          ? "bg-primary text-primary-foreground"
                          : isCurrentMonth
                          ? "text-gray-800"
                          : "text-gray-400",
                      ].join(" ")}
                    >
                      {date.getDate()}
                    </span>
                  </div>

                  {/* Event chips */}
                  <div className="space-y-0.5">
                    {dayEvents.slice(0, MAX_VISIBLE).map((ev) => (
                      <div
                        key={ev.id}
                        draggable
                        onDragStart={(e) => handleDragStart(ev, e)}
                        onDragEnd={() => setDragOverKey(null)}
                        className={[
                          "w-full flex items-center gap-1 text-xs rounded font-medium",
                          "transition-all group/chip cursor-grab active:cursor-grabbing",
                          TYPE_CHIP_COLORS[ev.type] ?? "bg-gray-100 text-gray-700",
                        ].join(" ")}
                      >
                        {/* Checkbox marcar hecho */}
                        <button
                          onClick={(e) => handleToggleDone(ev, e)}
                          className="shrink-0 pl-1 py-0.5 opacity-60 hover:opacity-100 transition-opacity"
                          title="Marcar como hecho"
                        >
                          <Circle className="w-3 h-3" />
                        </button>
                        {/* Título — abre el editor */}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditEvent(ev);
                            setShowForm(true);
                          }}
                          title={ev.title}
                          className="flex-1 text-left truncate pr-1.5 py-0.5"
                        >
                          {ev.title}
                        </button>
                      </div>
                    ))}
                    {overflow > 0 && (
                      <p className="text-xs text-muted-foreground pl-1">
                        +{overflow} más
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <EventForm
        open={showForm}
        onClose={() => {
          setShowForm(false);
          setEditEvent(undefined);
          setDefaultDate(undefined);
        }}
        onSave={handleSaved}
        initialData={editEvent}
        defaultDate={defaultDate}
      />

      <ConfirmDialog
        open={!!deletingId}
        title="Eliminar evento"
        description="¿Estás seguro? Esta acción no se puede deshacer."
        onConfirm={handleDelete}
        onCancel={() => setDeletingId(null)}
        loading={deleteLoading}
      />
    </div>
  );
}
