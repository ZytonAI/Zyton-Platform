"use client";

import { useState, useMemo } from "react";
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
import { InvoiceForm } from "./InvoiceForm";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import {
  Plus, MoreHorizontal, Pencil, Trash2, Search, RefreshCw,
  Clock, AlertTriangle, CheckCircle2,
} from "lucide-react";
import { RECURRENCE_INTERVALS } from "@/lib/validations/invoice.schema";
import { toast } from "sonner";
import type { Invoice, InvoiceStatus } from "@/types";
import { cn } from "@/lib/utils";

interface Props {
  initialInvoices: Invoice[];
}

const FILTERS: { label: string; value: string }[] = [
  { label: "Todas", value: "all" },
  { label: "Pendientes", value: "pending" },
  { label: "Vencidas", value: "overdue" },
  { label: "Pagadas", value: "paid" },
  { label: "Recurrentes", value: "recurring" },
];

function formatDate(iso: string) {
  return new Date(iso + "T00:00:00").toLocaleDateString("es-ES", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function formatAmount(n: number) {
  return `$${n.toLocaleString("es-CO", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}`;
}

/** Vencida de facto: pendiente con due_date en el pasado */
function isOverdue(inv: Invoice): boolean {
  if (inv.status === "overdue") return true;
  if (inv.status !== "pending") return false;
  return inv.due_date < new Date().toISOString().split("T")[0];
}

export function InvoicesClient({ initialInvoices }: Props) {
  const [invoices, setInvoices] = useState<Invoice[]>(initialInvoices);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [showForm, setShowForm] = useState(false);
  const [editInvoice, setEditInvoice] = useState<Invoice | undefined>();
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const kpis = useMemo(() => {
    const pending = invoices.filter((i) => i.status !== "paid" && !isOverdue(i));
    const overdue = invoices.filter((i) => i.status !== "paid" && isOverdue(i));
    const thisMonth = new Date().toISOString().slice(0, 7);
    const paidThisMonth = invoices.filter(
      (i) => i.status === "paid" && i.due_date.startsWith(thisMonth)
    );
    const sum = (list: Invoice[]) => list.reduce((acc, i) => acc + Number(i.amount), 0);
    return {
      pendingCount: pending.length,
      pendingSum: sum(pending),
      overdueCount: overdue.length,
      overdueSum: sum(overdue),
      paidCount: paidThisMonth.length,
      paidSum: sum(paidThisMonth),
    };
  }, [invoices]);

  const filtered = invoices.filter((i) => {
    const matchSearch = [i.title, i.category].some((v) =>
      v?.toLowerCase().includes(search.toLowerCase())
    );
    const matchFilter =
      filter === "all" ? true :
      filter === "recurring" ? i.is_recurring :
      filter === "overdue" ? isOverdue(i) :
      filter === "pending" ? i.status === "pending" && !isOverdue(i) :
      i.status === filter;
    return matchSearch && matchFilter;
  });

  function handleSaved(invoice: Invoice) {
    setInvoices((prev) => {
      const idx = prev.findIndex((i) => i.id === invoice.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = invoice;
        return next;
      }
      return [invoice, ...prev];
    });
    toast.success(editInvoice ? "Factura actualizada" : "Factura creada");
    setEditInvoice(undefined);
  }

  async function handleMarkStatus(invoice: Invoice, status: InvoiceStatus) {
    const res = await fetch(`/api/invoices/${invoice.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (!res.ok) {
      toast.error("Error actualizando la factura");
      return;
    }
    const updated = await res.json();
    setInvoices((prev) => prev.map((i) => (i.id === updated.id ? updated : i)));
    toast.success(status === "paid" ? "Factura marcada como pagada" : "Factura actualizada");
  }

  async function handleDelete() {
    if (!deletingId) return;
    setDeleteLoading(true);
    const res = await fetch(`/api/invoices/${deletingId}`, { method: "DELETE" });
    if (res.ok) {
      setInvoices((prev) => prev.filter((i) => i.id !== deletingId));
      toast.success("Factura eliminada");
    } else {
      toast.error("Error eliminando la factura");
    }
    setDeleteLoading(false);
    setDeletingId(null);
  }

  return (
    <div className="p-5 space-y-5">

      {/* ── KPIs ── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="rounded-2xl p-4 bg-card shadow-sm ring-1 ring-black/[0.06] dark:ring-white/[0.08]">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-7 h-7 rounded-lg bg-amber-50 dark:bg-amber-500/15 flex items-center justify-center">
              <Clock className="w-4 h-4 text-amber-500" />
            </div>
            <p className="text-[11px] font-medium text-muted-foreground">Pendiente por pagar</p>
          </div>
          <p className="text-2xl font-bold leading-none">{formatAmount(kpis.pendingSum)}</p>
          <p className="text-[11px] text-muted-foreground mt-1">{kpis.pendingCount} factura{kpis.pendingCount !== 1 ? "s" : ""}</p>
        </div>
        <div className="rounded-2xl p-4 bg-card shadow-sm ring-1 ring-black/[0.06] dark:ring-white/[0.08]">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-7 h-7 rounded-lg bg-red-50 dark:bg-red-500/15 flex items-center justify-center">
              <AlertTriangle className="w-4 h-4 text-red-500" />
            </div>
            <p className="text-[11px] font-medium text-muted-foreground">Vencidas sin pagar</p>
          </div>
          <p className="text-2xl font-bold leading-none text-red-600 dark:text-red-400">{formatAmount(kpis.overdueSum)}</p>
          <p className="text-[11px] text-muted-foreground mt-1">{kpis.overdueCount} factura{kpis.overdueCount !== 1 ? "s" : ""}</p>
        </div>
        <div className="rounded-2xl p-4 bg-card shadow-sm ring-1 ring-black/[0.06] dark:ring-white/[0.08]">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-7 h-7 rounded-lg bg-emerald-50 dark:bg-emerald-500/15 flex items-center justify-center">
              <CheckCircle2 className="w-4 h-4 text-emerald-500" />
            </div>
            <p className="text-[11px] font-medium text-muted-foreground">Pagadas este mes</p>
          </div>
          <p className="text-2xl font-bold leading-none text-emerald-600 dark:text-emerald-400">{formatAmount(kpis.paidSum)}</p>
          <p className="text-[11px] text-muted-foreground mt-1">{kpis.paidCount} factura{kpis.paidCount !== 1 ? "s" : ""}</p>
        </div>
      </div>

      {/* ── Búsqueda + nueva ── */}
      <div className="flex items-center justify-between gap-4">
        <div className="relative max-w-sm flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Buscar facturas..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 rounded-xl"
          />
        </div>
        <Button
          onClick={() => {
            setEditInvoice(undefined);
            setShowForm(true);
          }}
          className="gap-2 shrink-0 rounded-xl"
        >
          <Plus className="w-4 h-4" />
          Nueva factura
        </Button>
      </div>

      {/* ── Filter pills ── */}
      <div className="flex gap-2 flex-wrap items-center">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            onClick={() => setFilter(f.value)}
            className={cn(
              "px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all duration-150 tracking-tight",
              filter === f.value
                ? "bg-foreground text-background shadow-sm"
                : "bg-card text-muted-foreground hover:bg-muted shadow-sm ring-1 ring-border"
            )}
          >
            {f.label}
          </button>
        ))}
        <span className="ml-auto text-xs text-muted-foreground font-medium">
          {filtered.length} factura{filtered.length !== 1 ? "s" : ""}
        </span>
      </div>

      <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead>Título</TableHead>
              <TableHead className="text-right">Monto</TableHead>
              <TableHead>Categoría</TableHead>
              <TableHead>Fecha de pago</TableHead>
              <TableHead>Recurrencia</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={7}
                  className="text-center text-muted-foreground py-12"
                >
                  {search
                    ? "Sin resultados para tu búsqueda"
                    : "No hay facturas aún. ¡Crea la primera!"}
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((invoice) => (
                <TableRow
                  key={invoice.id}
                  className={cn(
                    "hover:bg-muted/50",
                    isOverdue(invoice) && "bg-red-50/60 dark:bg-red-500/[0.07] hover:bg-red-50 dark:hover:bg-red-500/10"
                  )}
                >
                  <TableCell className="font-medium">{invoice.title}</TableCell>
                  <TableCell className="font-mono text-sm text-right tabular-nums">
                    {formatAmount(invoice.amount)}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {invoice.category ?? "—"}
                  </TableCell>
                  <TableCell className={cn("text-sm", isOverdue(invoice) ? "text-red-600 dark:text-red-400 font-medium" : "text-muted-foreground")}>
                    {formatDate(invoice.due_date)}
                  </TableCell>
                  <TableCell>
                    {invoice.is_recurring && invoice.recurrence_interval ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 dark:bg-blue-500/15 px-2 py-0.5 text-xs font-medium text-blue-700 dark:text-blue-300">
                        <RefreshCw className="w-3 h-3" />
                        {RECURRENCE_INTERVALS.find((r) => r.value === invoice.recurrence_interval)?.label ?? invoice.recurrence_interval}
                      </span>
                    ) : (
                      <span className="text-muted-foreground text-sm">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={isOverdue(invoice) ? "overdue" : invoice.status} type="invoice" />
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger className="inline-flex items-center justify-center w-8 h-8 rounded-md hover:bg-accent transition-colors">
                        <MoreHorizontal className="w-4 h-4" />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {invoice.status !== "paid" && (
                          <DropdownMenuItem onClick={() => handleMarkStatus(invoice, "paid")}>
                            <CheckCircle2 className="w-4 h-4 mr-2" />
                            Marcar como pagada
                          </DropdownMenuItem>
                        )}
                        {invoice.status === "paid" && (
                          <DropdownMenuItem onClick={() => handleMarkStatus(invoice, "pending")}>
                            <Clock className="w-4 h-4 mr-2" />
                            Marcar pendiente
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem
                          onClick={() => {
                            setEditInvoice(invoice);
                            setShowForm(true);
                          }}
                        >
                          <Pencil className="w-4 h-4 mr-2" />
                          Editar
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="text-destructive"
                          onClick={() => setDeletingId(invoice.id)}
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

      <InvoiceForm
        open={showForm}
        onClose={() => {
          setShowForm(false);
          setEditInvoice(undefined);
        }}
        onSave={handleSaved}
        initialData={editInvoice}
      />

      <ConfirmDialog
        open={!!deletingId}
        title="Eliminar factura"
        description="¿Estás seguro? Esta acción no se puede deshacer."
        onConfirm={handleDelete}
        onCancel={() => setDeletingId(null)}
        loading={deleteLoading}
      />
    </div>
  );
}
