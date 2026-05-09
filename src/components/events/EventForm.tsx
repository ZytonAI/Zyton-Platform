"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  calendarEventSchema,
  type CalendarEventFormData,
} from "@/lib/validations/calendar-event.schema";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { CalendarEvent } from "@/types";

interface Props {
  open: boolean;
  onClose: () => void;
  onSave: (data: CalendarEvent) => void;
  initialData?: CalendarEvent;
  defaultDate?: string; // "YYYY-MM-DDTHH:mm" pre-filled when creating from calendar
}

function toDatetimeLocal(iso: string) {
  return iso ? iso.slice(0, 16) : "";
}

export function EventForm({ open, onClose, onSave, initialData, defaultDate }: Props) {
  const isEdit = !!initialData;

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<CalendarEventFormData>({
    resolver: zodResolver(calendarEventSchema),
    defaultValues: {
      title:       initialData?.title ?? "",
      event_date:  initialData ? toDatetimeLocal(initialData.event_date) : (defaultDate ?? ""),
      type:        initialData?.type ?? "event",
      description: initialData?.description ?? "",
      status:      initialData?.status ?? "pending",
    },
  });

  const type = watch("type");
  const status = watch("status");

  async function onSubmit(data: CalendarEventFormData) {
    const url = isEdit ? `/api/events/${initialData.id}` : "/api/events";
    const method = isEdit ? "PATCH" : "POST";
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (res.ok) {
      const saved = await res.json();
      onSave(saved);
      reset();
      onClose();
    }
  }

  function handleClose() {
    reset();
    onClose();
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Editar evento" : "Nuevo evento"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2 space-y-1">
              <Label>Título *</Label>
              <Input {...register("title")} placeholder="Nombre del evento o tarea" />
              {errors.title && (
                <p className="text-xs text-destructive">{errors.title.message}</p>
              )}
            </div>

            <div className="space-y-1">
              <Label>Fecha y hora *</Label>
              <Input {...register("event_date")} type="datetime-local" />
              {errors.event_date && (
                <p className="text-xs text-destructive">{errors.event_date.message}</p>
              )}
            </div>

            <div className="space-y-1">
              <Label>Tipo</Label>
              <Select
                value={type}
                onValueChange={(v) =>
                  setValue("type", v as CalendarEventFormData["type"])
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="event">Evento</SelectItem>
                  <SelectItem value="task">Tarea</SelectItem>
                  <SelectItem value="deadline">Deadline</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label>Estado</Label>
              <Select
                value={status}
                onValueChange={(v) =>
                  setValue("status", v as CalendarEventFormData["status"])
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pending">Pendiente</SelectItem>
                  <SelectItem value="done">Hecho</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="col-span-2 space-y-1">
              <Label>Descripción</Label>
              <Textarea
                {...register("description")}
                placeholder="Detalles del evento..."
                rows={3}
              />
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={handleClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting
                ? "Guardando..."
                : isEdit
                ? "Guardar cambios"
                : "Crear evento"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
