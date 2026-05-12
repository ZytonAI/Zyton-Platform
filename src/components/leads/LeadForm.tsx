"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { leadSchema, type LeadFormData } from "@/lib/validations/lead.schema";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { Lead } from "@/types";

interface Props {
  open: boolean;
  onClose: () => void;
  onSave: (data: Lead) => void;
  initialData?: Lead;
}

export function LeadForm({ open, onClose, onSave, initialData }: Props) {
  const isEdit = !!initialData;

  const { register, handleSubmit, setValue, watch, reset, formState: { errors, isSubmitting } } = useForm<LeadFormData>({
    resolver: zodResolver(leadSchema),
    defaultValues: {
      name: initialData?.name ?? "",
      email: initialData?.email ?? "",
      phone: initialData?.phone ?? "",
      company: initialData?.company ?? "",
      status: initialData?.status ?? "new",
      source: initialData?.source ?? "",
      notes: initialData?.notes ?? "",
    },
  });

  const status = watch("status");

  async function onSubmit(data: LeadFormData) {
    const url = isEdit ? `/api/leads/${initialData.id}` : "/api/leads";
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

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) { reset(); onClose(); } }}>
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
            <div className="col-span-2 space-y-1">
              <Label>Estado</Label>
              <Select value={status} onValueChange={(v) => setValue("status", v as LeadFormData["status"])}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="new">Sin contactar</SelectItem>
                  <SelectItem value="contacted">Contactado</SelectItem>
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
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => { reset(); onClose(); }}>Cancelar</Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Guardando..." : isEdit ? "Guardar cambios" : "Crear lead"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
