"use client";

import { useState, useMemo, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
    const hh = String(orig.getUTCHours()).padStart(2, "0");
    const mm = String(orig.getUTCMinutes()).padStart(2, "0");
    const newEventDate = `${targetKey}T${hh}:${mm}`;

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

      {/* ── List view ── */}
      {view === "list" && (
        <div className="rounded-lg border bg-white shadow-sm overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-gray-50">
                <TableHead>Título</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Fecha</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground py-12">
                    {search
                      ? "Sin resultados para tu búsqueda"
                      : "No hay eventos aún. ¡Crea el primero!"}
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((event) => (
                  <TableRow key={event.id} className={`hover:bg-gray-50 ${event.status === "done" ? "opacity-50" : ""}`}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={(e) => handleToggleDone(event, e)}
                          className="shrink-0 text-muted-foreground hover:text-primary transition-colors"
                          title={event.status === "done" ? "Marcar como pendiente" : "Marcar como hecho"}
                        >
                          {event.status === "done"
                            ? <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                            : <Circle className="w-4 h-4" />
                          }
                        </button>
                        <span className={`font-medium ${event.status === "done" ? "line-through text-muted-foreground" : ""}`}>
                          {event.title}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {TYPE_LABELS[event.type]}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {formatDateTime(event.event_date)}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={event.status} type="event" />
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger className="inline-flex items-center justify-center w-8 h-8 rounded-md hover:bg-accent transition-colors">
                          <MoreHorizontal className="w-4 h-4" />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onClick={() => {
                              setEditEvent(event);
                              setShowForm(true);
                            }}
                          >
                            <Pencil className="w-4 h-4 mr-2" />
                            Editar
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="text-destructive"
                            onClick={() => setDeletingId(event.id)}
                          >
                            <Trash2 className="w-4 h-4 mr-2" />
                            Eliminar
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
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
