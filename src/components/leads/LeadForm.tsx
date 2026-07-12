"use client";

import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { leadSchema, type LeadFormData } from "@/lib/validations/lead.schema";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import type { Lead } from "@/types";

interface Props {
  open: boolean;
  onClose: () => void;
  onSave: (data: Lead) => void;
  initialData?: Lead;
}

interface DuplicateInfo {
  type: string;
  id: string;
  name: string;
}

export function LeadForm({ open, onClose, onSave, initialData }: Props) {
  const isEdit = !!initialData;
  const [duplicate, setDuplicate] = useState<DuplicateInfo | null>(null);

  const { register, handleSubmit, setValue, watch, reset, formState: { errors, isSubmitting } } = useForm<LeadFormData>({
    resolver: zodResolver(leadSchema),
    defaultValues: {
      name: initialData?.name ?? "",
      email: initialData?.email ?? "",
      phone: initialData?.phone ?? "",
      company: initialData?.company ?? "",
      status: initialData?.status ?? "new",
      source: initialData?.source ?? "",
      priority: initialData?.priority ?? null,
      website: initialData?.website ?? "",
      maps_url: initialData?.maps_url ?? "",
      notes: initialData?.notes ?? "",
    },
  });

  // El diálogo se queda montado entre aperturas — hay que re-sincronizar
  // los datos del lead cada vez que se abre (editar uno distinto, o crear).
  useEffect(() => {
    if (!open) return;
    reset({
      name: initialData?.name ?? "",
      email: initialData?.email ?? "",
      phone: initialData?.phone ?? "",
      company: initialData?.company ?? "",
      status: initialData?.status ?? "new",
      source: initialData?.source ?? "",
      priority: initialData?.priority ?? null,
      website: initialData?.website ?? "",
      maps_url: initialData?.maps_url ?? "",
      notes: initialData?.notes ?? "",
    });
    setDuplicate(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialData]);

  const status = watch("status");
  const priority = watch("priority");

  async function submit(data: LeadFormData, force: boolean) {
    const url = isEdit ? `/api/leads/${initialData.id}` : "/api/leads";
    const method = isEdit ? "PATCH" : "POST";

    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(force ? { ...data, force: true } : data),
    });

    if (res.ok) {
      const saved = await res.json();
      onSave(saved);
      setDuplicate(null);
      reset();
      onClose();
      return;
    }

    if (res.status === 409) {
      const err = await res.json().catch(() => ({}));
      setDuplicate(err.duplicate_of ?? { type: "lead", id: "", name: "otro registro" });
      return;
    }

    const err = await res.json().catch(() => ({}));
    toast.error(typeof err.error === "string" ? err.error : "Error guardando el lead");
  }

  async function onSubmit(data: LeadFormData) {
    await submit(data, false);
  }

  function handleClose() {
    setDuplicate(null);
    reset();
    onClose();
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Editar lead" : "Nuevo lead"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2 space-y-1">
              <Label>Nombre *</Label>
              <Input {...register("name")} placeholder="Nombre completo" />
              {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
            </div>
            <div className="space-y-1">
              <Label>Email</Label>
              <Input {...register("email")} type="email" placeholder="email@ejemplo.com" />
              {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
            </div>
            <div className="space-y-1">
              <Label>Teléfono</Label>
              <Input {...register("phone")} placeholder="+57 300 000 0000" />
            </div>
            <div className="space-y-1">
              <Label>Empresa</Label>
              <Input {...register("company")} placeholder="Nombre de empresa" />
            </div>
            <div className="space-y-1">
              <Label>Fuente</Label>
              <Input {...register("source")} placeholder="Instagram, referido..." />
            </div>
            <div className="space-y-1">
              <Label>Sitio web</Label>
              <Input {...register("website")} placeholder="https://..." />
            </div>
            <div className="space-y-1">
              <Label>Prioridad</Label>
              <Select
                value={priority ?? "none"}
                onValueChange={(v) => setValue("priority", v === "none" ? null : (v as "alta" | "media" | "baja"))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Sin prioridad" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sin prioridad</SelectItem>
                  <SelectItem value="alta">🔥 Alta</SelectItem>
                  <SelectItem value="media">Media</SelectItem>
                  <SelectItem value="baja">Baja</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-2 space-y-1">
              <Label>Estado</Label>
              <Select value={status} onValueChange={(v) => setValue("status", v as LeadFormData["status"])}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="new">Sin contactar</SelectItem>
                  <SelectItem value="contacted">Contactado</SelectItem>
                  <SelectItem value="scheduled">Programado</SelectItem>
                  <SelectItem value="qualified">Interesado</SelectItem>
                  <SelectItem value="lost">No interesado</SelectItem>
                  <SelectItem value="converted">Compró</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-2 space-y-1">
              <Label>Notas</Label>
              <Textarea {...register("notes")} placeholder="Notas sobre el lead..." rows={3} />
            </div>
          </div>

          {duplicate && (
            <div className="rounded-lg border border-amber-300 dark:border-amber-500/40 bg-amber-50 dark:bg-amber-500/10 p-3 space-y-2">
              <div className="flex items-center gap-2 text-sm font-medium text-amber-800 dark:text-amber-300">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                Ya existe {duplicate.type === "client" ? "un cliente" : "un lead"} con este teléfono o email:{" "}
                <span className="font-semibold">{duplicate.name}</span>
              </div>
              <div className="flex gap-2">
                {duplicate.id && (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      window.open(`/${duplicate.type === "client" ? "clients" : "leads"}/${duplicate.id}`, "_blank");
                    }}
                  >
                    Ver registro
                  </Button>
                )}
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={isSubmitting}
                  onClick={handleSubmit((data) => submit(data, true))}
                >
                  Crear de todos modos
                </Button>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={handleClose}>Cancelar</Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Guardando..." : isEdit ? "Guardar cambios" : "Crear lead"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
