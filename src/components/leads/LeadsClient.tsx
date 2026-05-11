"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { LeadForm } from "./LeadForm";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import {
  Plus, Search, Phone, Globe, Building2,
  MoreHorizontal, Pencil, Trash2, Eye,
  Bot, FileText, MessageCircle, Flame, CalendarClock,
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
  const [scheduleLeadId, setScheduleLeadId] = useState<string | null>(null);
  const [scheduleName, setScheduleName] = useState("");
  const [scheduleDate, setScheduleDate] = useState("");
  const [scheduleTime, setScheduleTime] = useState("");
  const [scheduleSaving, setScheduleSaving] = useState(false);

  function openSchedule(lead: Lead, e: React.MouseEvent) {
    e.stopPropagation();
    setScheduleLeadId(lead.id);
    setScheduleName(lead.name);
    setScheduleDate("");
    setScheduleTime("");
  }

  async function handleSchedule() {
    if (!scheduleDate) { toast.error("Selecciona una fecha"); return; }
    setScheduleSaving(true);
    try {
      const eventDate = `${scheduleDate}T${scheduleTime || "09:00"}`;
      const res = await fetch("/api/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: `Contactar ${scheduleName}`,
          event_date: eventDate,
          type: "task",
          description: `Llamar o escribir a ${scheduleName} para seguimiento comercial.`,
          status: "pending",
        }),
      });
      if (res.ok) {
        toast.success("Evento creado en el calendario");
        setScheduleLeadId(null);
      } else {
        toast.error("Error creando el evento");
      }
    } finally {
      setScheduleSaving(false);
    }
  }

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
    <div className="p-7 space-y-5">
      {/* Top bar */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input
            placeholder="Buscar leads..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-10 bg-white shadow-sm border-gray-200 focus:border-primary/50 rounded-xl"
          />
        </div>
        <Button
          size="sm"
          className="gap-1.5 shrink-0 h-10 px-4 rounded-xl shadow-sm font-medium"
          onClick={() => { setEditLead(undefined); setShowForm(true); }}
        >
          <Plus className="w-4 h-4" /> Nuevo lead
        </Button>
      </div>

      {/* Filter pills */}
      <div className="flex gap-2 flex-wrap items-center">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            onClick={() => setFilter(f.value)}
            className={cn(
              "px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all duration-150 tracking-tight",
              filter === f.value
                ? "bg-gray-900 text-white shadow-sm"
                : "bg-white text-gray-500 hover:bg-gray-100 shadow-sm ring-1 ring-gray-200/80"
            )}
          >
            {f.label}
          </button>
        ))}
        <span className="ml-auto text-xs text-gray-400 font-medium">
          {filtered.length} lead{filtered.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Cards grid */}
      {filtered.length === 0 ? (
        <div className="text-center py-20 text-gray-400 text-sm font-medium">
          {search || filter !== "all" ? "Sin resultados para esta búsqueda" : "No hay leads aún. ¡Crea el primero!"}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((lead) => (
            <div
              key={lead.id}
              onClick={() => router.push(`/leads/${lead.id}`)}
              className={cn(
                "bg-white rounded-2xl p-5 cursor-pointer transition-all duration-200 space-y-3.5 group",
                "shadow-[0_1px_4px_rgba(0,0,0,0.06),_0_1px_2px_rgba(0,0,0,0.04)]",
                "hover:shadow-[0_8px_32px_rgba(0,0,0,0.12),_0_2px_8px_rgba(0,0,0,0.06)]",
                "ring-1 ring-black/[0.04] hover:ring-primary/20",
                "hover:-translate-y-0.5",
                lead.priority === "alta" && "ring-1 ring-orange-200/60"
              )}
            >
              {/* Header */}
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-[13px] text-gray-900 truncate leading-snug tracking-tight">{lead.name}</p>
                  {lead.company && lead.company !== lead.name && (
                    <p className="text-[11px] text-gray-400 truncate mt-0.5 font-medium">{lead.company}</p>
                  )}
                </div>
                <div onClick={(e) => e.stopPropagation()} className="shrink-0">
                  <DropdownMenu>
                    <DropdownMenuTrigger className="opacity-0 group-hover:opacity-100 inline-flex items-center justify-center w-7 h-7 rounded-lg hover:bg-gray-100 transition-all shadow-sm ring-1 ring-black/5">
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
                      <DropdownMenuItem onClick={(e) => openSchedule(lead, e)}>
                        <CalendarClock className="w-4 h-4 mr-2" /> Programar contacto
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
              <div className="space-y-1.5">
                {lead.phone && (
                  <div className="flex items-center gap-2 text-[11px] text-gray-400 font-medium">
                    <Phone className="w-3 h-3 shrink-0 text-gray-300" />
                    <span className="truncate">{lead.phone}</span>
                  </div>
                )}
                {lead.website && lead.website !== "Sin página web" && (
                  <div className="flex items-center gap-2 text-[11px] text-gray-400 font-medium">
                    <Globe className="w-3 h-3 shrink-0 text-gray-300" />
                    <span className="truncate">{lead.website.replace(/^https?:\/\//, "")}</span>
                  </div>
                )}
                {lead.notes && !lead.phone && (
                  <div className="flex items-center gap-2 text-[11px] text-gray-400 font-medium">
                    <Building2 className="w-3 h-3 shrink-0 text-gray-300" />
                    <span className="truncate">{lead.notes}</span>
                  </div>
                )}
              </div>

              {/* Footer badges */}
              <div className="flex items-center gap-1.5 flex-wrap pt-3 border-t border-gray-100/80">
                {lead.priority === "alta" && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-orange-50 text-orange-500 flex items-center gap-1 tracking-tight ring-1 ring-orange-100">
                    <Flame className="w-2.5 h-2.5" /> Alta
                  </span>
                )}
                <span className={cn("px-2 py-0.5 rounded-full text-[10px] font-bold tracking-tight", STATUS_COLORS[lead.status])}>
                  {STATUS_LABELS[lead.status]}
                </span>
                {lead.source === "raul" && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 text-blue-500 flex items-center gap-1 tracking-tight ring-1 ring-blue-100">
                    <Bot className="w-2.5 h-2.5" /> Raúl
                  </span>
                )}
                {lead.analyzed && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-violet-50 text-violet-500 flex items-center gap-1 tracking-tight ring-1 ring-violet-100">
                    <FileText className="w-2.5 h-2.5" /> Informe
                  </span>
                )}
                <span className="ml-auto text-[10px] text-gray-300 font-semibold">{timeAgo(lead.created_at)}</span>
                {lead.phone && (
                  <button
                    onClick={(e) => handleContactar(lead, e)}
                    disabled={contactandoId === lead.id}
                    className="opacity-0 group-hover:opacity-100 transition-opacity ml-1 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-600 hover:bg-emerald-100 disabled:opacity-50 ring-1 ring-emerald-100"
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

      {/* Dialog programar contacto */}
      <Dialog open={!!scheduleLeadId} onOpenChange={(v) => { if (!v) setScheduleLeadId(null); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Programar contacto</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground -mt-2">
            Se creará una tarea en el calendario para contactar a <span className="font-medium text-gray-800">{scheduleName}</span>.
          </p>
          <div className="space-y-3">
            <div className="space-y-1">
              <label className="text-sm font-medium text-gray-700">Fecha *</label>
              <Input type="date" value={scheduleDate} onChange={(e) => setScheduleDate(e.target.value)} />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium text-gray-700">
                Hora <span className="text-muted-foreground font-normal">(opcional)</span>
              </label>
              <Input type="time" value={scheduleTime} onChange={(e) => setScheduleTime(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setScheduleLeadId(null)} disabled={scheduleSaving}>
              Cancelar
            </Button>
            <Button onClick={handleSchedule} disabled={scheduleSaving || !scheduleDate}>
              {scheduleSaving ? "Guardando..." : "Crear evento"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
