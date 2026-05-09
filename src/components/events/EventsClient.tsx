"use client";

import { useState } from "react";
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
import { Plus, MoreHorizontal, Pencil, Trash2, Search } from "lucide-react";
import { toast } from "sonner";
import type { CalendarEvent } from "@/types";

interface Props {
  initialEvents: CalendarEvent[];
}

const TYPE_LABELS: Record<string, string> = {
  event:    "Evento",
  task:     "Tarea",
  deadline: "Deadline",
};

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("es-ES", {
    day:    "2-digit",
    month:  "short",
    year:   "numeric",
    hour:   "2-digit",
    minute: "2-digit",
  });
}

export function EventsClient({ initialEvents }: Props) {
  const [events, setEvents] = useState<CalendarEvent[]>(initialEvents);
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editEvent, setEditEvent] = useState<CalendarEvent | undefined>();
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const filtered = events.filter((e) =>
    [e.title, e.description].some((v) =>
      v?.toLowerCase().includes(search.toLowerCase())
    )
  );

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

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div className="relative max-w-sm flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Buscar eventos..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Button
          onClick={() => {
            setEditEvent(undefined);
            setShowForm(true);
          }}
          className="gap-2 shrink-0"
        >
          <Plus className="w-4 h-4" />
          Nuevo evento
        </Button>
      </div>

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
                <TableCell
                  colSpan={5}
                  className="text-center text-muted-foreground py-12"
                >
                  {search
                    ? "Sin resultados para tu búsqueda"
                    : "No hay eventos aún. ¡Crea el primero!"}
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((event) => (
                <TableRow key={event.id} className="hover:bg-gray-50">
                  <TableCell className="font-medium">{event.title}</TableCell>
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

      <EventForm
        open={showForm}
        onClose={() => {
          setShowForm(false);
          setEditEvent(undefined);
        }}
        onSave={handleSaved}
        initialData={editEvent}
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
