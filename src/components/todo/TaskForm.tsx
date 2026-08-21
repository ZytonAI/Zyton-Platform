"use client";

import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { taskSchema, type TaskFormData } from "@/lib/validations/task.schema";
import { TEAM_MEMBERS, type TeamSlug } from "@/lib/team";
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
import { toast } from "sonner";
import type { Task, TaskStatus } from "@/types";

interface Props {
  open: boolean;
  onClose: () => void;
  onSave: (task: Task) => void;
  initialData?: Task;
  defaultAssignee?: TeamSlug;
}

export function TaskForm({ open, onClose, onSave, initialData, defaultAssignee }: Props) {
  const isEdit = !!initialData;

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<TaskFormData>({
    resolver: zodResolver(taskSchema),
    defaultValues: {
      assignee:    defaultAssignee ?? "samuel",
      title:       "",
      description: "",
      due_date:    "",
      status:      "todo",
    },
  });

  // Resincronizar cada vez que se abre (cambia según la columna o la tarea)
  useEffect(() => {
    if (!open) return;
    reset({
      assignee:    (initialData?.assignee as TeamSlug) ?? defaultAssignee ?? "samuel",
      title:       initialData?.title ?? "",
      description: initialData?.description ?? "",
      due_date:    initialData?.due_date ?? "",
      status:      initialData?.status ?? "todo",
    });
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const assignee = watch("assignee");
  const status = watch("status");

  async function onSubmit(data: TaskFormData) {
    const url = isEdit ? `/api/tasks/${initialData.id}` : "/api/tasks";
    const res = await fetch(url, {
      method: isEdit ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });

    if (res.ok) {
      onSave(await res.json());
      handleClose();
    } else {
      const err = await res.json().catch(() => ({}));
      toast.error(typeof err.error === "string" ? err.error : "Error al guardar la tarea");
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
          <DialogTitle>{isEdit ? "Editar tarea" : "Nueva tarea"}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-1">
            <Label>Tarea *</Label>
            <Input {...register("title")} placeholder="¿Qué hay que hacer?" autoFocus />
            {errors.title && (
              <p className="text-xs text-destructive">{errors.title.message}</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label>Responsable</Label>
              <Select
                value={assignee}
                onValueChange={(v) => setValue("assignee", v as TeamSlug)}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TEAM_MEMBERS.map((m) => (
                    <SelectItem key={m.slug} value={m.slug}>{m.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label>Fecha</Label>
              <Input type="date" {...register("due_date")} />
            </div>

            <div className="col-span-2 space-y-1">
              <Label>Estado</Label>
              <Select
                value={status}
                onValueChange={(v) => setValue("status", v as TaskStatus)}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="todo">Sin hacer</SelectItem>
                  <SelectItem value="in_progress">En progreso</SelectItem>
                  <SelectItem value="done">Completado</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="col-span-2 space-y-1">
              <Label>
                Notas <span className="text-muted-foreground font-normal">(opcional)</span>
              </Label>
              <Textarea {...register("description")} rows={3} placeholder="Detalles de la tarea..." />
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={handleClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Guardando..." : isEdit ? "Guardar cambios" : "Crear tarea"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
