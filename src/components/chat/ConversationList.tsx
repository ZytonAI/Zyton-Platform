"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Search, MessageCircle, Plus, Loader2, Trash2, Users, User } from "lucide-react";
import { memberBySlug } from "@/lib/team";
import { toast } from "sonner";
import type { Conversation } from "@/types";
import { cn } from "@/lib/utils";

function timeAgo(iso: string | null) {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "ahora";
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  return new Date(iso).toLocaleDateString("es-ES", { day: "2-digit", month: "short" });
}

/** Punto del color de quien trabaja el chat. Sin dueño, no pinta nada. */
function OwnerDot({ slug }: { slug: string | null | undefined }) {
  const member = memberBySlug(slug ?? "");
  if (!member) return null;
  return (
    <span
      className={cn("w-2 h-2 rounded-full shrink-0", member.dot)}
      title={`Lo trabaja ${member.name}`}
    />
  );
}

function initials(name: string | null, phone: string) {
  if (name) return name.slice(0, 2).toUpperCase();
  return phone.slice(-2);
}

interface Props {
  conversations: Conversation[];
  selectedId: string | null;
  onSelect: (conv: Conversation) => void;
  onNewConversation: (conv: Conversation) => void;
  onDeleteConversation: (id: string) => void;
  /** Vista actual — solo el Dueño puede cambiarla */
  view: "all" | "mine";
  onChangeView: (view: "all" | "mine") => void;
  showViewToggle: boolean;
}

export function ConversationList({
  conversations,
  selectedId,
  onSelect,
  onNewConversation,
  onDeleteConversation,
  view,
  onChangeView,
  showViewToggle,
}: Props) {
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const filtered = conversations.filter((c) => {
    const q = search.toLowerCase();
    return (
      c.contact_name?.toLowerCase().includes(q) ||
      c.contact_phone.includes(q) ||
      c.last_message?.toLowerCase().includes(q)
    );
  });

  async function handleDelete() {
    if (!deletingId) return;
    setDeleteLoading(true);
    try {
      const res = await fetch(`/api/whatsapp/conversations/${deletingId}`, { method: "DELETE" });
      if (res.ok) {
        onDeleteConversation(deletingId);
        toast.success("Chat eliminado");
      } else {
        toast.error("Error eliminando el chat");
      }
    } catch {
      toast.error("Error de conexión");
    } finally {
      setDeleteLoading(false);
      setDeletingId(null);
    }
  }

  async function handleCreate() {
    if (!phone.trim()) { setError("Ingresa un número de teléfono"); return; }
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/whatsapp/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: phone.trim(), name: name.trim() }),
      });
      if (!res.ok) { const d = await res.json(); setError(d.error ?? "Error"); return; }
      const conv: Conversation = await res.json();
      onNewConversation(conv);
      onSelect(conv);
      setOpen(false);
      setPhone("");
      setName("");
    } catch {
      setError("Error de conexión");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col h-full border-r bg-card">
      <div className="p-3 border-b flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Buscar conversación..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-9 text-sm"
          />
        </div>
        <Button size="icon" variant="outline" className="h-9 w-9 shrink-0" onClick={() => setOpen(true)}>
          <Plus className="w-4 h-4" />
        </Button>
      </div>

      {/* Vista general vs personal — solo para el Dueño; los Socios
          Estratégicos ya reciben la lista recortada desde el servidor. */}
      {showViewToggle && (
        <div className="px-3 pb-3 flex gap-1.5">
          {([
            { value: "all",  label: "Todo el equipo", icon: Users },
            { value: "mine", label: "Solo míos",      icon: User },
          ] as const).map(({ value, label, icon: Icon }) => (
            <button
              key={value}
              onClick={() => onChangeView(value)}
              className={cn(
                "flex-1 inline-flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-lg text-xs font-medium transition-colors",
                view === value
                  ? "bg-foreground text-background"
                  : "bg-muted text-muted-foreground hover:text-foreground"
              )}
            >
              <Icon className="w-3.5 h-3.5" />
              {label}
            </button>
          ))}
        </div>
      )}

      <div className="flex-1 overflow-y-auto">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center px-4">
            <MessageCircle className="w-8 h-8 text-muted-foreground/40 mb-2" />
            <p className="text-sm text-muted-foreground">
              {search ? "Sin resultados" : "Aún no hay conversaciones"}
            </p>
          </div>
        ) : (
          filtered.map((conv) => (
            <div
              key={conv.id}
              className={cn(
                "group relative flex items-center gap-3 px-4 py-3 border-b border-border hover:bg-muted transition-colors",
                selectedId === conv.id && "bg-primary/10 hover:bg-primary/10"
              )}
            >
              <button
                onClick={() => onSelect(conv)}
                className="flex items-center gap-3 flex-1 min-w-0 text-left"
              >
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0 text-primary font-semibold text-sm">
                  {initials(conv.contact_name, conv.contact_phone)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-1">
                    <span className="font-medium text-sm text-foreground truncate flex items-center gap-1.5 min-w-0">
                      <span className="truncate">{conv.contact_name ?? conv.contact_phone}</span>
                      <OwnerDot slug={conv.assigned_to} />
                    </span>
                    <span className="text-xs text-muted-foreground shrink-0 group-hover:hidden">
                      {timeAgo(conv.last_message_at)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-1 mt-0.5">
                    <p className="text-xs text-muted-foreground truncate">{conv.last_message ?? ""}</p>
                    {conv.unread_count > 0 && (
                      <span className="shrink-0 min-w-[18px] h-[18px] rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center px-1">
                        {conv.unread_count > 99 ? "99+" : conv.unread_count}
                      </span>
                    )}
                  </div>
                </div>
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); setDeletingId(conv.id); }}
                className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0 w-7 h-7 flex items-center justify-center rounded-md hover:bg-destructive/10 hover:text-destructive text-muted-foreground"
                title="Eliminar chat"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))
        )}
      </div>

      {/* Confirmación eliminar */}
      <Dialog open={!!deletingId} onOpenChange={(v) => { if (!v) setDeletingId(null); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Eliminar chat</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Se eliminará la conversación y todos sus mensajes. Esta acción no se puede deshacer.
            El lead y su etiqueta de contacto (en frío / con investigación) se conservan.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeletingId(null)} disabled={deleteLoading}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleteLoading}>
              {deleteLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Eliminar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Nueva conversación */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Nueva conversación</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-3 py-2">
            <div>
              <label className="text-sm font-medium text-foreground mb-1 block">
                Teléfono <span className="text-destructive">*</span>
              </label>
              <Input
                placeholder="Ej: 5491112345678"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleCreate()}
              />
              <p className="text-xs text-muted-foreground mt-1">
                Código de país + número, sin espacios ni símbolos
              </p>
            </div>
            <div>
              <label className="text-sm font-medium text-foreground mb-1 block">Nombre (opcional)</label>
              <Input
                placeholder="Ej: Juan García"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleCreate()}
              />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={loading}>
              Cancelar
            </Button>
            <Button onClick={handleCreate} disabled={loading}>
              {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Crear conversación
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
