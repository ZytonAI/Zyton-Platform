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
import { InvoiceForm } from "./InvoiceForm";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { Plus, MoreHorizontal, Pencil, Trash2, Search } from "lucide-react";
import { toast } from "sonner";
import type { Invoice } from "@/types";

interface Props {
  initialInvoices: Invoice[];
}

function formatDate(iso: string) {
  return new Date(iso + "T00:00:00").toLocaleDateString("es-ES", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function formatAmount(n: number) {
  return `$${n.toLocaleString("es-ES", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function InvoicesClient({ initialInvoices }: Props) {
  const [invoices, setInvoices] = useState<Invoice[]>(initialInvoices);
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editInvoice, setEditInvoice] = useState<Invoice | undefined>();
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const filtered = invoices.filter((i) =>
    [i.title, i.category].some((v) =>
      v?.toLowerCase().includes(search.toLowerCase())
    )
  );

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

  async function handleDelete() {
    if (!deletingId) return;
    setDeleteLoading(true);
    const res = await fetch(`/api/invoices/${deletingId}`, { method: "DELETE" });
    if (res.ok) {
      setInvoices((prev) => prev.filter((i) => i.id !== deletingId));
      toast.success("Factura eliminada");
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
            placeholder="Buscar facturas..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Button
          onClick={() => {
            setEditInvoice(undefined);
            setShowForm(true);
          }}
          className="gap-2 shrink-0"
        >
          <Plus className="w-4 h-4" />
          Nueva factura
        </Button>
      </div>

      <div className="rounded-lg border bg-white shadow-sm overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-gray-50">
              <TableHead>Título</TableHead>
              <TableHead>Monto</TableHead>
              <TableHead>Categoría</TableHead>
              <TableHead>Fecha de pago</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={6}
                  className="text-center text-muted-foreground py-12"
                >
                  {search
                    ? "Sin resultados para tu búsqueda"
                    : "No hay facturas aún. ¡Crea la primera!"}
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((invoice) => (
                <TableRow key={invoice.id} className="hover:bg-gray-50">
                  <TableCell className="font-medium">{invoice.title}</TableCell>
                  <TableCell className="font-mono text-sm">
                    {formatAmount(invoice.amount)}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {invoice.category ?? "—"}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {formatDate(invoice.due_date)}
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={invoice.status} type="invoice" />
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger className="inline-flex items-center justify-center w-8 h-8 rounded-md hover:bg-accent transition-colors">
                        <MoreHorizontal className="w-4 h-4" />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
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
