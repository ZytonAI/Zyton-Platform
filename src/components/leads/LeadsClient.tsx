"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LeadForm } from "./LeadForm";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import {
  Plus, Search, Phone, Globe, Building2,
  MoreHorizontal, Pencil, Trash2, Eye,
  Bot, FileText, MessageCircle, Flame,
} from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import type { Lead, LeadStatus } from "@/types";
import { cn } from "@/lib/utils";

interface Props { initialLeads: Lead[] }

const STATUS_LABELS: Record<LeadStatus, string> = {
  new: "Nuevo",
  contacted: "Contactado",
  qualified: "Calificado",
  lost: "Perdido",
  converted: "Convertido",
};

const STATUS_COLORS: Record<LeadStatus, string> = {
  new: "bg-blue-100 text-blue-700",
  contacted: "bg-yellow-100 text-yellow-700",
  qualified: "bg-emerald-100 text-emerald-700",
  lost: "bg-red-100 text-red-700",
  converted: "bg-purple-100 text-purple-700",
};

const FILTERS: { label: string; value: string }[] = [
  { label: "Todos", value: "all" },
  { label: "Alta prioridad", value: "alta" },
  { label: "Nuevos", value: "new" },
  { label: "Contactados", value: "contacted" },
  { label: "Calificados", value: "qualified" },
  { label: "De Raúl", value: "raul" },
  { label: "Con informe", value: "analyzed" },
];

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const d = Math.floor(diff / 86400000);
  if (d === 0) return "hoy";
  if (d === 1) return "ayer";
  if (d < 7) return `hace ${d} días`;
  if (d < 30) return `hace ${Math.floor(d / 7)} sem`;
  return new Date(iso).toLocaleDateString("es-ES", { day: "2-digit", month: "short" });
}

export function LeadsClient({ initialLeads }: Props) {
  const router = useRouter();
  const [leads, setLeads] = useState<Lead[]>(initialLeads);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [showForm, setShowForm] = useState(false);
  const [editLead, setEditLead] = useState<Lead | undefined>();
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [contactandoId, setContactandoId] = useState<string | null>(null);

  async function handleContactar(lead: Lead, e: React.MouseEvent) {
    e.stopPropagation();
    if (!lead.phone) {
      toast.error("Este lead no tiene número de teléfono registrado");
      return;
    }
    setContactandoId(lead.id);
    try {
      const res = await fetch("/api/whatsapp/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: lead.phone, name: lead.name, lead_id: lead.id }),
      });
      if (!res.ok) {
        toast.error("Error creando conversación");
        return;
      }
      const conv = await res.json();
      router.push(`/chat?conv=${conv.id}`);
    } catch {
      toast.error("Error de conexión");
    } finally {
      setContactandoId(null);
    }
  }

  const filtered = leads.filter((l) => {
    const matchSearch = [l.name, l.company, l.phone, l.email].some(
      (v) => v?.toLowerCase().includes(search.toLowerCase())
    );
    const matchFilter =
      filter === "all" ? true :
      filter === "alta" ? l.priority === "alta" :
      filter === "raul" ? l.source === "raul" :
      filter === "analyzed" ? l.analyzed :
      l.status === filter;
    return matchSearch && matchFilter;
  });

  function handleSaved(lead: Lead) {
    setLeads((prev) => {
      const idx = prev.findIndex((l) => l.id === lead.id);
      if (idx >= 0) { const next = [...prev]; next[idx] = lead; return next; }
      return [lead, ...prev];
    });
    toast.success(editLead ? "Lead actualizado" : "Lead creado");
    setEditLead(undefined);
  }

  async function handleDelete() {
    if (!deletingId) return;
    setDeleteLoading(true);
    const res = await fetch(`/api/leads/${deletingId}`, { method: "DELETE" });
    if (res.ok) {
      setLeads((prev) => prev.filter((l) => l.id !== deletingId));
      toast.success("Lead eliminado");
    }
    setDeleteLoading(false);
    setDeletingId(null);
  }

  return (
    <div className="p-6 space-y-4">
      {/* Top bar */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Buscar..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-9"
          />
        </div>
        <Button
          size="sm"
          className="gap-1.5 shrink-0"
          onClick={() => { setEditLead(undefined); setShowForm(true); }}
        >
          <Plus className="w-4 h-4" /> Nuevo lead
        </Button>
      </div>

      {/* Filter pills */}
      <div className="flex gap-2 flex-wrap">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            onClick={() => setFilter(f.value)}
            className={cn(
              "px-3 py-1 rounded-full text-xs font-medium transition-colors",
              filter === f.value
                ? "bg-gray-900 text-white"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            )}
          >
            {f.label}
          </button>
        ))}
        <span className="ml-auto text-xs text-muted-foreground self-center">
          {filtered.length} lead{filtered.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Cards grid */}
      {filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground text-sm">
          {search || filter !== "all" ? "Sin resultados" : "No hay leads aún. ¡Crea el primero!"}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map((lead) => (
            <div
              key={lead.id}
              onClick={() => router.push(`/leads/${lead.id}`)}
              className="bg-white border rounded-xl p-4 cursor-pointer hover:shadow-md hover:border-gray-300 transition-all space-y-3 group"
            >
              {/* Header */}
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-sm text-gray-900 truncate">{lead.name}</p>
                  {lead.company && lead.company !== lead.name && (
                    <p className="text-xs text-muted-foreground truncate">{lead.company}</p>
                  )}
                </div>
                <div onClick={(e) => e.stopPropagation()} className="shrink-0">
                  <DropdownMenu>
                    <DropdownMenuTrigger className="opacity-0 group-hover:opacity-100 inline-flex items-center justify-center w-7 h-7 rounded-md hover:bg-gray-100 transition-all">
                      <MoreHorizontal className="w-4 h-4" />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => router.push(`/leads/${lead.id}`)}>
                        <Eye className="w-4 h-4 mr-2" /> Ver
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={(e) => handleContactar(lead, e)}
                        disabled={!lead.phone || contactandoId === lead.id}
                      >
                        <MessageCircle className="w-4 h-4 mr-2" />
                        {contactandoId === lead.id ? "Abriendo chat..." : "Contactar"}
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => { setEditLead(lead); setShowForm(true); }}>
                        <Pencil className="w-4 h-4 mr-2" /> Editar
                      </DropdownMenuItem>
                      <DropdownMenuItem className="text-destructive" onClick={() => setDeletingId(lead.id)}>
                        <Trash2 className="w-4 h-4 mr-2" /> Eliminar
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>

              {/* Contact info */}
              <div className="space-y-1">
                {lead.phone && (
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Phone className="w-3 h-3 shrink-0" />
                    <span className="truncate">{lead.phone}</span>
                  </div>
                )}
                {lead.website && lead.website !== "Sin página web" && (
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Globe className="w-3 h-3 shrink-0" />
                    <span className="truncate">{lead.website.replace(/^https?:\/\//, "")}</span>
                  </div>
                )}
                {lead.notes && !lead.phone && (
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Building2 className="w-3 h-3 shrink-0" />
                    <span className="truncate">{lead.notes}</span>
                  </div>
                )}
              </div>

              {/* Footer badges */}
              <div className="flex items-center gap-1.5 flex-wrap pt-1 border-t border-gray-50">
                {lead.priority === "alta" && (
                  <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-orange-50 text-orange-600 flex items-center gap-1">
                    <Flame className="w-2.5 h-2.5" /> Alta
                  </span>
                )}
                <span className={cn("px-2 py-0.5 rounded-full text-xs font-medium", STATUS_COLORS[lead.status])}>
                  {STATUS_LABELS[lead.status]}
                </span>
                {lead.source === "raul" && (
                  <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-600 flex items-center gap-1">
                    <Bot className="w-2.5 h-2.5" /> Raúl
                  </span>
                )}
                {lead.analyzed && (
                  <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-violet-50 text-violet-600 flex items-center gap-1">
                    <FileText className="w-2.5 h-2.5" /> Con informe
                  </span>
                )}
                <span className="ml-auto text-xs text-muted-foreground">{timeAgo(lead.created_at)}</span>
                {lead.phone && (
                  <button
                    onClick={(e) => handleContactar(lead, e)}
                    disabled={contactandoId === lead.id}
                    className="opacity-0 group-hover:opacity-100 transition-opacity ml-1 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 hover:bg-emerald-100 disabled:opacity-50"
                  >
                    <MessageCircle className="w-2.5 h-2.5" />
                    {contactandoId === lead.id ? "..." : "Contactar"}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <LeadForm
        open={showForm}
        onClose={() => { setShowForm(false); setEditLead(undefined); }}
        onSave={handleSaved}
        initialData={editLead}
      />
      <ConfirmDialog
        open={!!deletingId}
        title="Eliminar lead"
        description="¿Estás seguro? Esta acción no se puede deshacer."
        onConfirm={handleDelete}
        onCancel={() => setDeletingId(null)}
        loading={deleteLoading}
      />
    </div>
  );
}
