"use client";

import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { clientSchema, type ClientFormData } from "@/lib/validations/client.schema";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import type { Client } from "@/types";

interface Props {
  open: boolean;
  onClose: () => void;
  onSave: (data: Client) => void;
  initialData?: Client;
}

interface DuplicateInfo {
  type: string;
  id: string;
  name: string;
}

export function ClientForm({ open, onClose, onSave, initialData }: Props) {
  const isEdit = !!initialData;
  const [duplicate, setDuplicate] = useState<DuplicateInfo | null>(null);

  const { register, handleSubmit, setValue, watch, reset, formState: { errors, isSubmitting } } = useForm<ClientFormData>({
    resolver: zodResolver(clientSchema),
    defaultValues: {
      name: initialData?.name ?? "",
      email: initialData?.email ?? "",
      phone: initialData?.phone ?? "",
      company: initialData?.company ?? "",
      status: initialData?.status ?? "active",
      contract_start: initialData?.contract_start ?? "",
      contract_end: initialData?.contract_end ?? "",
      notes: initialData?.notes ?? "",
    },
  });

  // El diálogo se queda montado entre aperturas — hay que re-sincronizar
  // los datos del cliente cada vez que se abre (editar uno distinto, o crear).
  useEffect(() => {
    if (!open) return;
    reset({
      name: initialData?.name ?? "",
      email: initialData?.email ?? "",
      phone: initialData?.phone ?? "",
      company: initialData?.company ?? "",
      status: initialData?.status ?? "active",
      contract_start: initialData?.contract_start ?? "",
      contract_end: initialData?.contract_end ?? "",
      notes: initialData?.notes ?? "",
    });
    setDuplicate(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialData]);

  const status = watch("status");

  async function submit(data: ClientFormData, force: boolean) {
    const url = isEdit ? `/api/clients/${initialData.id}` : "/api/clients";
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
      setDuplicate(err.duplicate_of ?? { type: "client", id: "", name: "otro registro" });
      return;
    }

    const err = await res.json().catch(() => ({}));
    toast.error(typeof err.error === "string" ? err.error : "Error guardando el cliente");
  }

  async function onSubmit(data: ClientFormData) {
    await submit(data, false);
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) { reset(); onClose(); } }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Editar cliente" : "Nuevo cliente"}</DialogTitle>
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
              <Label>Estado</Label>
              <Select value={status} onValueChange={(v) => setValue("status", v as ClientFormData["status"])}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Activo</SelectItem>
                  <SelectItem value="inactive">Inactivo</SelectItem>
                  <SelectItem value="churned">Perdido</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Inicio contrato</Label>
              <Input {...register("contract_start")} type="date" />
            </div>
            <div className="space-y-1">
              <Label>Fin contrato</Label>
              <Input {...register("contract_end")} type="date" />
            </div>
            <div className="col-span-2 space-y-1">
              <Label>Notas</Label>
              <Textarea {...register("notes")} placeholder="Notas sobre el cliente..." rows={3} />
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
            <Button type="button" variant="outline" onClick={() => { setDuplicate(null); reset(); onClose(); }}>Cancelar</Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Guardando..." : isEdit ? "Guardar cambios" : "Crear cliente"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
