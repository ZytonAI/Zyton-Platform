"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { invoiceSchema, type InvoiceFormData, RECURRENCE_INTERVALS } from "@/lib/validations/invoice.schema";
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
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Invoice } from "@/types";

interface Props {
  open: boolean;
  onClose: () => void;
  onSave: (data: Invoice) => void;
  initialData?: Invoice;
}

export function InvoiceForm({ open, onClose, onSave, initialData }: Props) {
  const isEdit = !!initialData;

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<InvoiceFormData>({
    resolver: zodResolver(invoiceSchema),
    defaultValues: {
      title:               initialData?.title ?? "",
      amount:              initialData?.amount ?? 0,
      category:            initialData?.category ?? "",
      due_date:            initialData?.due_date ?? "",
      status:              initialData?.status ?? "pending",
      is_recurring:        initialData?.is_recurring ?? false,
      recurrence_interval: initialData?.recurrence_interval ?? null,
      notes:               initialData?.notes ?? "",
    },
  });

  const status = watch("status");
  const isRecurring = watch("is_recurring");
  const recurrenceInterval = watch("recurrence_interval");

  async function onSubmit(data: InvoiceFormData) {
    const url = isEdit ? `/api/invoices/${initialData.id}` : "/api/invoices";
    const method = isEdit ? "PATCH" : "POST";
    const payload = {
      ...data,
      recurrence_interval: data.is_recurring ? data.recurrence_interval : null,
    };
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
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
          <DialogTitle>{isEdit ? "Editar factura" : "Nueva factura"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2 space-y-1">
              <Label>Título *</Label>
              <Input {...register("title")} placeholder="Ej: Renta oficina, Hosting web..." />
              {errors.title && <p className="text-xs text-destructive">{errors.title.message}</p>}
            </div>

            <div className="space-y-1">
              <Label>Monto *</Label>
              <Input
                {...register("amount", { valueAsNumber: true })}
                type="number"
                step="0.01"
                min="0"
                placeholder="0.00"
              />
              {errors.amount && <p className="text-xs text-destructive">{errors.amount.message}</p>}
            </div>

            <div className="space-y-1">
              <Label>Categoría</Label>
              <Input {...register("category")} placeholder="Ej: Servicios, Renta..." />
            </div>

            <div className="space-y-1">
              <Label>Fecha de pago *</Label>
              <Input {...register("due_date")} type="date" />
              {errors.due_date && <p className="text-xs text-destructive">{errors.due_date.message}</p>}
            </div>

            <div className="space-y-1">
              <Label>Estado</Label>
              <Select
                value={status}
                onValueChange={(v) => setValue("status", v as InvoiceFormData["status"])}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pending">Pendiente</SelectItem>
                  <SelectItem value="paid">Pagada</SelectItem>
                  <SelectItem value="overdue">Vencida</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Recurrencia */}
            <div className="col-span-2 rounded-lg border p-3 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">Pago recurrente</p>
                  <p className="text-xs text-muted-foreground">Se repite automáticamente</p>
                </div>
                <Switch
                  checked={isRecurring}
                  onCheckedChange={(v) => {
                    setValue("is_recurring", v);
                    if (!v) setValue("recurrence_interval", null);
                  }}
                />
              </div>

              {isRecurring && (
                <div className="space-y-1">
                  <Label>Frecuencia *</Label>
                  <Select
                    value={recurrenceInterval ?? ""}
                    onValueChange={(v) =>
                      setValue("recurrence_interval", v as InvoiceFormData["recurrence_interval"])
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="¿Cada cuánto se repite?" />
                    </SelectTrigger>
                    <SelectContent>
                      {RECURRENCE_INTERVALS.map((r) => (
                        <SelectItem key={r.value} value={r.value}>
                          {r.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {errors.recurrence_interval && (
                    <p className="text-xs text-destructive">{errors.recurrence_interval.message}</p>
                  )}
                </div>
              )}
            </div>

            <div className="col-span-2 space-y-1">
              <Label>Notas</Label>
              <Textarea
                {...register("notes")}
                placeholder="Notas adicionales..."
                rows={3}
              />
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={handleClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Guardando..." : isEdit ? "Guardar cambios" : "Crear factura"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
