"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { ClientForm } from "./ClientForm";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import {
  Plus, MoreHorizontal, Pencil, Trash2, Eye, Search,
  Phone, Mail, Building2, UserCheck, UserMinus, UserX, CalendarClock,
} from "lucide-react";
import { toast } from "sonner";
import { CLIENT_STATUS } from "@/lib/status-config";
import type { Client, ClientStatus } from "@/types";
import { cn } from "@/lib/utils";

interface Props {
  initialClients: Client[];
}

const STATUS_ORDER: ClientStatus[] = ["active", "inactive", "churned"];

const STATUS_ICONS: Record<ClientStatus, React.ElementType> = {
  active: UserCheck,
  inactive: UserMinus,
  churned: UserX,
};

const FILTERS: { label: string; value: string }[] = [
  { label: "Todos", value: "all" },
  { label: "Activos", value: "active" },
  { label: "Inactivos", value: "inactive" },
  { label: "Perdidos", value: "churned" },
  { label: "Contrato por vencer", value: "expiring" },
];

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("es-ES", { day: "2-digit", month: "short", year: "numeric" });
}

/** Días hasta el fin del contrato; negativo si ya venció */
function daysToContractEnd(client: Client): number | null {
  if (!client.contract_end) return null;
  const end = new Date(client.contract_end);
  return Math.ceil((end.getTime() - Date.now()) / 86_400_000);
}

export function ClientsClient({ initialClients }: Props) {
  const router = useRouter();
  const [clients, setClients] = useState<Client[]>(initialClients);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [showForm, setShowForm] = useState(false);
  const [editClient, setEditClient] = useState<Client | undefined>();
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const kpis = useMemo(() => {
    const total = clients.length;
    const byStatus = STATUS_ORDER.reduce((acc, s) => {
      acc[s] = clients.filter((c) => c.status === s).length;
      return acc;
    }, {} as Record<ClientStatus, number>);
    const expiring = clients.filter((c) => {
      const days = daysToContractEnd(c);
      return days !== null && days >= 0 && days <= 30 && c.status === "active";
    }).length;
    return { total, byStatus, expiring };
  }, [clients]);

  const filtered = clients.filter((c) => {
    const matchSearch = [c.name, c.company, c.email, c.phone].some((v) =>
      v?.toLowerCase().includes(search.toLowerCase())
    );
    const matchFilter =
      filter === "all" ? true :
      filter === "expiring" ? (() => {
        const days = daysToContractEnd(c);
        return days !== null && days >= 0 && days <= 30;
      })() :
      c.status === filter;
    return matchSearch && matchFilter;
  });

  function handleSaved(client: Client) {
    setClients((prev) => {
      const idx = prev.findIndex((c) => c.id === client.id);
      if (idx >= 0) { const next = [...prev]; next[idx] = client; return next; }
      return [client, ...prev];
    });
    toast.success(editClient ? "Cliente actualizado" : "Cliente creado");
    setEditClient(undefined);
  }

  async function handleChangeStatus(client: Client, status: ClientStatus) {
    const res = await fetch(`/api/clients/${client.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (!res.ok) {
      toast.error("Error actualizando el estado");
      return;
    }
    const updated = await res.json();
    setClients((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
    toast.success(`Estado: ${CLIENT_STATUS[status].label}`);
  }

  async function handleDelete() {
    if (!deletingId) return;
    setDeleteLoading(true);
    const res = await fetch(`/api/clients/${deletingId}`, { method: "DELETE" });
    if (res.ok) {
      setClients((prev) => prev.filter((c) => c.id !== deletingId));
      toast.success("Cliente eliminado");
    } else {
      toast.error("Error eliminando el cliente");
    }
    setDeleteLoading(false);
    setDeletingId(null);
  }

  return (
    <div className="p-5 space-y-5">

      {/* ── KPIs ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {STATUS_ORDER.map((s) => {
          const Icon = STATUS_ICONS[s];
          const count = kpis.byStatus[s];
          const pct = kpis.total > 0 ? Math.round((count / kpis.total) * 100) : 0;
          return (
            <button
              key={s}
              onClick={() => setFilter(filter === s ? "all" : s)}
              className={cn(
                "rounded-2xl p-4 text-left transition-all duration-150 shadow-sm ring-1",
                filter === s
                  ? "bg-foreground text-background ring-foreground"
                  : "bg-card text-card-foreground ring-black/[0.06] dark:ring-white/[0.08] hover:ring-primary/20 hover:shadow-md"
              )}
            >
              <div className="flex items-center justify-between mb-2">
                <Icon className={cn("w-4 h-4", filter === s ? "opacity-60" : "text-muted-foreground")} />
                <span className={cn("text-[10px] font-semibold", filter === s ? "opacity-50" : "text-muted-foreground")}>
                  {pct}%
                </span>
              </div>
              <p className="text-2xl font-bold leading-none">{count}</p>
              <p className={cn("text-[11px] font-medium mt-1 truncate", filter === s ? "opacity-70" : "text-muted-foreground")}>
                {CLIENT_STATUS[s].label}s
              </p>
            </button>
          );
        })}
        <button
          onClick={() => setFilter(filter === "expiring" ? "all" : "expiring")}
          className={cn(
            "rounded-2xl p-4 text-left transition-all duration-150 shadow-sm ring-1",
            filter === "expiring"
              ? "bg-foreground text-background ring-foreground"
              : "bg-card text-card-foreground ring-black/[0.06] dark:ring-white/[0.08] hover:ring-amber-400/40 hover:shadow-md"
          )}
        >
          <div className="flex items-center justify-between mb-2">
            <CalendarClock className={cn("w-4 h-4", filter === "expiring" ? "opacity-60" : "text-amber-500")} />
          </div>
          <p className="text-2xl font-bold leading-none">{kpis.expiring}</p>
          <p className={cn("text-[11px] font-medium mt-1 truncate", filter === "expiring" ? "opacity-70" : "text-muted-foreground")}>
            Contratos por vencer
          </p>
        </button>
      </div>

      {/* ── Barra de búsqueda + nuevo ── */}
      <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-card shadow-sm ring-1 ring-black/[0.05] dark:ring-white/[0.08]">
        <div className="text-center">
          <p className="text-xs text-muted-foreground font-medium">Total clientes</p>
          <p className="text-lg font-bold">{kpis.total}</p>
        </div>
        <div className="flex-1" />
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Buscar clientes..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-9 rounded-xl text-sm"
          />
        </div>
        <Button
          size="sm"
          className="gap-1.5 shrink-0 h-9 px-4 rounded-xl font-medium"
          onClick={() => { setEditClient(undefined); setShowForm(true); }}
        >
          <Plus className="w-4 h-4" /> Nuevo cliente
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
          {filtered.length} cliente{filtered.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* ── Cards grid ── */}
      {filtered.length === 0 ? (
        <div className="text-center py-20 text-muted-foreground text-sm font-medium">
          {search || filter !== "all" ? "Sin resultados para esta búsqueda" : "No hay clientes aún. ¡Crea el primero!"}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((client) => {
            const days = daysToContractEnd(client);
            const contractBadge =
              days === null ? null :
              days < 0 ? { label: "Contrato vencido", className: "bg-red-100 text-red-600 ring-red-200 dark:bg-red-500/15 dark:text-red-300 dark:ring-red-500/20" } :
              days <= 30 ? { label: `Vence en ${days} d`, className: "bg-amber-100 text-amber-600 ring-amber-200 dark:bg-amber-500/15 dark:text-amber-300 dark:ring-amber-500/20" } :
              null;

            return (
              <div
                key={client.id}
                onClick={() => router.push(`/clients/${client.id}`)}
                className={cn(
                  "bg-card rounded-2xl p-5 cursor-pointer transition-all duration-200 space-y-3.5 group",
                  "shadow-[0_1px_4px_rgba(0,0,0,0.06),_0_1px_2px_rgba(0,0,0,0.04)]",
                  "hover:shadow-[0_8px_32px_rgba(0,0,0,0.12),_0_2px_8px_rgba(0,0,0,0.06)]",
                  "ring-1 ring-black/[0.04] dark:ring-white/[0.08] hover:ring-primary/20",
                  "hover:-translate-y-0.5"
                )}
              >
                {/* Header */}
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-[13px] truncate leading-snug tracking-tight">{client.name}</p>
                    {client.company && client.company !== client.name && (
                      <p className="text-[11px] text-muted-foreground truncate mt-0.5 font-medium">{client.company}</p>
                    )}
                  </div>
                  <div onClick={(e) => e.stopPropagation()} className="shrink-0">
                    <DropdownMenu>
                      <DropdownMenuTrigger className="opacity-0 group-hover:opacity-100 inline-flex items-center justify-center w-7 h-7 rounded-lg hover:bg-muted transition-all shadow-sm ring-1 ring-black/5 dark:ring-white/10">
                        <MoreHorizontal className="w-4 h-4" />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => router.push(`/clients/${client.id}`)}>
                          <Eye className="w-4 h-4 mr-2" /> Ver detalle
                        </DropdownMenuItem>
                        {STATUS_ORDER.filter((s) => s !== client.status).map((s) => {
                          const Icon = STATUS_ICONS[s];
                          return (
                            <DropdownMenuItem key={s} onClick={() => handleChangeStatus(client, s)}>
                              <Icon className="w-4 h-4 mr-2" /> Marcar {CLIENT_STATUS[s].label.toLowerCase()}
                            </DropdownMenuItem>
                          );
                        })}
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => { setEditClient(client); setShowForm(true); }}>
                          <Pencil className="w-4 h-4 mr-2" /> Editar
                        </DropdownMenuItem>
                        <DropdownMenuItem className="text-destructive" onClick={() => setDeletingId(client.id)}>
                          <Trash2 className="w-4 h-4 mr-2" /> Eliminar
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>

                {/* Contact info */}
                <div className="space-y-1.5">
                  {client.phone && (
                    <div className="flex items-center gap-2 text-[11px] text-muted-foreground font-medium">
                      <Phone className="w-3 h-3 shrink-0 opacity-60" />
                      <span className="truncate">{client.phone}</span>
                    </div>
                  )}
                  {client.email && (
                    <div className="flex items-center gap-2 text-[11px] text-muted-foreground font-medium">
                      <Mail className="w-3 h-3 shrink-0 opacity-60" />
                      <span className="truncate">{client.email}</span>
                    </div>
                  )}
                  {!client.phone && !client.email && client.company && (
                    <div className="flex items-center gap-2 text-[11px] text-muted-foreground font-medium">
                      <Building2 className="w-3 h-3 shrink-0 opacity-60" />
                      <span className="truncate">{client.company}</span>
                    </div>
                  )}
                </div>

                {/* Footer badges */}
                <div className="flex items-center gap-1.5 flex-wrap pt-3 border-t border-border/60">
                  <span className={cn("px-2 py-0.5 rounded-full text-[10px] font-bold tracking-tight", CLIENT_STATUS[client.status].badgeClass)}>
                    {CLIENT_STATUS[client.status].label}
                  </span>
                  {contractBadge && (
                    <span className={cn("px-2 py-0.5 rounded-full text-[10px] font-bold flex items-center gap-1 tracking-tight ring-1", contractBadge.className)}>
                      <CalendarClock className="w-2.5 h-2.5" /> {contractBadge.label}
                    </span>
                  )}
                  <span className="ml-auto text-[10px] text-muted-foreground/70 font-semibold">
                    {formatDate(client.created_at)}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <ClientForm
        open={showForm}
        onClose={() => { setShowForm(false); setEditClient(undefined); }}
        onSave={handleSaved}
        initialData={editClient}
      />

      <ConfirmDialog
        open={!!deletingId}
        title="Eliminar cliente"
        description="¿Estás seguro? Esta acción no se puede deshacer."
        onConfirm={handleDelete}
        onCancel={() => setDeletingId(null)}
        loading={deleteLoading}
      />
    </div>
  );
}
