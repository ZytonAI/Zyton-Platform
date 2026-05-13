"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Send, Loader2, MessageCircle, Plus, FileText, Search, Video, ArrowLeft, ChevronDown } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import type { Conversation, Message, FileAttachment } from "@/types";
import { cn } from "@/lib/utils";

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
}

interface Props {
  conversation: Conversation;
  onBack?: () => void;
}

type LeadStatus = "new" | "contacted" | "qualified" | "lost" | "converted";

const LEAD_STATUS_LABELS: Record<LeadStatus, string> = {
  new:       "Sin contactar",
  contacted: "Contactado",
  qualified: "Interesado",
  lost:      "No interesado",
  converted: "Compró",
};

const LEAD_STATUS_COLORS: Record<LeadStatus, string> = {
  new:       "bg-gray-100 text-gray-600",
  contacted: "bg-blue-100 text-blue-700",
  qualified: "bg-emerald-100 text-emerald-700",
  lost:      "bg-red-100 text-red-700",
  converted: "bg-purple-100 text-purple-700",
};

const LEAD_STATUS_ORDER: LeadStatus[] = ["new", "contacted", "qualified", "lost", "converted"];

export function MessageThread({ conversation, onBack }: Props) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [showAttach, setShowAttach] = useState(false);
  const [attachments, setAttachments] = useState<FileAttachment[]>([]);
  const [loadingAttach, setLoadingAttach] = useState(false);
  const [attachSearch, setAttachSearch] = useState("");
  const [sendingFile, setSendingFile] = useState(false);
  const [leadStatus, setLeadStatus] = useState<LeadStatus | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const supabase = createClient();

  const fetchMessages = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/whatsapp/conversations/${conversation.id}/messages`);
    if (res.ok) setMessages(await res.json());
    setLoading(false);
  }, [conversation.id]);

  const refreshMessages = useCallback(async () => {
    const res = await fetch(`/api/whatsapp/conversations/${conversation.id}/messages`);
    if (res.ok) {
      const fresh: Message[] = await res.json();
      setMessages((prev) => {
        if (fresh.length === prev.length) return prev;
        return fresh;
      });
    }
  }, [conversation.id]);

  useEffect(() => {
    fetchMessages();
  }, [fetchMessages]);

  // Cargar estado del lead vinculado
  useEffect(() => {
    if (!conversation.lead_id) { setLeadStatus(null); return; }
    fetch(`/api/leads/${conversation.lead_id}`)
      .then((r) => r.ok ? r.json() : null)
      .then((lead) => { if (lead?.status) setLeadStatus(lead.status as LeadStatus); })
      .catch(() => {});
  }, [conversation.lead_id]);

  async function handleChangeLeadStatus(status: LeadStatus) {
    let leadId = conversation.lead_id;

    // Si no tiene lead vinculado, buscar por sufijo de teléfono
    if (!leadId) {
      const suffix = conversation.contact_phone?.slice(-10);
      if (!suffix) { toast.error("Sin lead vinculado a esta conversación"); return; }
      const res = await fetch(`/api/leads?search=${suffix}`);
      const leads: { id: string; phone?: string }[] = res.ok ? await res.json() : [];
      const match = leads.find((l) => l.phone?.slice(-10) === suffix);
      if (!match) { toast.error("No hay lead vinculado a esta conversación"); return; }
      leadId = match.id;
      // Vincular la conversación al lead encontrado
      await fetch(`/api/whatsapp/conversations/${conversation.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lead_id: leadId }),
      });
    }

    const res = await fetch(`/api/leads/${leadId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (res.ok) {
      setLeadStatus(status);
      toast.success(`Lead: ${LEAD_STATUS_LABELS[status]}`);
    }
  }

  // Supabase Realtime para mensajes nuevos
  useEffect(() => {
    const channel = supabase
      .channel(`messages:${conversation.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `conversation_id=eq.${conversation.id}`,
        },
        (payload) => {
          setMessages((prev) => {
            const exists = prev.some((m) => m.id === payload.new.id);
            if (exists) return prev;
            return [...prev, payload.new as Message];
          });
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [conversation.id, supabase]);

  // Polling de fallback: si Realtime falla, los mensajes aparecen igual
  useEffect(() => {
    const interval = setInterval(refreshMessages, 5000);
    return () => clearInterval(interval);
  }, [refreshMessages]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim() || sending) return;
    setSending(true);
    try {
      const res = await fetch("/api/whatsapp/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversation_id: conversation.id, body: text.trim() }),
      });
      if (!res.ok) {
        const err = await res.json();
        toast.error(err.error ?? "Error enviando mensaje");
        return;
      }
      const msg: Message = await res.json();
      setMessages((prev) => {
        const exists = prev.some((m) => m.id === msg.id);
        return exists ? prev : [...prev, msg];
      });
      setText("");
    } finally {
      setSending(false);
    }
  }

  async function openAttachDialog() {
    setAttachSearch("");
    setShowAttach(true);
    if (!conversation.lead_id) return;
    setLoadingAttach(true);
    const res = await fetch(`/api/attachments?entity_type=lead&entity_id=${conversation.lead_id}`);
    if (res.ok) setAttachments(await res.json());
    setLoadingAttach(false);
  }

  async function handleSendFile(attachment: FileAttachment) {
    setSendingFile(true);
    try {
      const res = await fetch("/api/whatsapp/send-file", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversation_id: conversation.id, attachment_id: attachment.id }),
      });
      if (!res.ok) {
        const err = await res.json();
        toast.error(err.error ?? "Error enviando archivo");
        return;
      }
      const msg: Message = await res.json();
      setMessages((prev) => {
        const exists = prev.some((m) => m.id === msg.id);
        return exists ? prev : [...prev, msg];
      });
      setShowAttach(false);
      toast.success("Archivo enviado");
    } finally {
      setSendingFile(false);
    }
  }

  const filteredAttachments = attachments.filter((a) =>
    a.file_name.toLowerCase().includes(attachSearch.toLowerCase())
  );

  return (
    <div className="flex flex-col h-full bg-gray-50">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 bg-white border-b">
        {onBack && (
          <button
            onClick={onBack}
            className="md:hidden p-1.5 -ml-1 rounded-lg text-gray-500 hover:bg-gray-100 transition-colors shrink-0"
            aria-label="Volver a conversaciones"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
        )}
        <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center text-primary font-semibold text-sm shrink-0">
          {(conversation.contact_name ?? conversation.contact_phone).slice(0, 2).toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm text-gray-900">
            {conversation.contact_name ?? conversation.contact_phone}
          </p>
          {conversation.contact_name && (
            <p className="text-xs text-muted-foreground">{conversation.contact_phone}</p>
          )}
        </div>

        {/* Dropdown estado del lead — siempre visible */}
        <DropdownMenu>
          <DropdownMenuTrigger
            className={`shrink-0 flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold border hover:opacity-80 outline-none transition-opacity ${leadStatus ? LEAD_STATUS_COLORS[leadStatus] : "bg-gray-100 text-gray-500 border-gray-200"}`}
          >
            {leadStatus ? LEAD_STATUS_LABELS[leadStatus] : "Estado"}
            <ChevronDown className="w-3 h-3" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {LEAD_STATUS_ORDER.filter((s) => s !== leadStatus).map((s) => (
              <DropdownMenuItem key={s} onClick={() => handleChangeLeadStatus(s)}>
                {LEAD_STATUS_LABELS[s]}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-2">
        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <MessageCircle className="w-8 h-8 text-muted-foreground/40 mb-2" />
            <p className="text-sm text-muted-foreground">Ningún mensaje aún</p>
          </div>
        ) : (
          messages.map((msg) => (
            <div
              key={msg.id}
              className={cn("flex", msg.direction === "outbound" ? "justify-end" : "justify-start")}
            >
              <div
                className={cn(
                  "max-w-[70%] px-3 py-2 rounded-2xl text-sm shadow-sm",
                  msg.direction === "outbound"
                    ? "bg-primary text-primary-foreground rounded-br-sm"
                    : "bg-white text-gray-900 rounded-bl-sm"
                )}
              >
                <p className="leading-relaxed break-words">{msg.body}</p>
                <p className={cn(
                  "text-[10px] mt-1 text-right",
                  msg.direction === "outbound" ? "text-primary-foreground/70" : "text-muted-foreground"
                )}>
                  {formatTime(msg.created_at)}
                </p>
              </div>
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <form onSubmit={handleSend} className="flex items-center gap-2 px-4 py-3 bg-white border-t">
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="shrink-0"
          onClick={openAttachDialog}
          title="Adjuntar informe PDF"
        >
          <Plus className="w-4 h-4" />
        </Button>
        <Input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Escribe un mensaje..."
          className="flex-1"
          disabled={sending}
          autoComplete="off"
        />
        <Button type="submit" disabled={!text.trim() || sending} size="icon">
          {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
        </Button>
      </form>

      {/* Dialog selector de PDFs del lead */}
      <Dialog open={showAttach} onOpenChange={setShowAttach}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Adjuntar informe del lead</DialogTitle>
          </DialogHeader>
          {!conversation.lead_id ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              Esta conversación no está vinculada a ningún lead.<br />
              Usa el botón "Contactar" desde la sección Leads para vincularla.
            </p>
          ) : (
            <div className="flex flex-col gap-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar archivo..."
                  value={attachSearch}
                  onChange={(e) => setAttachSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
              {loadingAttach ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="w-5 h-5 animate-spin text-primary" />
                </div>
              ) : filteredAttachments.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">
                  {attachSearch ? "Sin resultados" : "No hay archivos adjuntos para este lead"}
                </p>
              ) : (
                <div className="flex flex-col gap-1 max-h-64 overflow-y-auto">
                  {filteredAttachments.map((att) => {
                    const attIsHtml =
                      att.content_type === "text/html" ||
                      att.file_name.toLowerCase().endsWith(".html");
                    const attIsVideo =
                      att.content_type?.startsWith("video/") ||
                      ["mp4", "mov", "webm", "avi"].some((ext) =>
                        att.file_name.toLowerCase().endsWith(`.${ext}`)
                      );
                    const displayName = attIsHtml
                      ? att.file_name.replace(/\.html?$/i, ".pdf")
                      : att.file_name;
                    const sizeLabel = att.size_bytes
                      ? att.size_bytes < 1024 * 1024
                        ? `${(att.size_bytes / 1024).toFixed(0)} KB`
                        : `${(att.size_bytes / (1024 * 1024)).toFixed(1)} MB`
                      : "";
                    const over16mb = (att.size_bytes ?? 0) > 16 * 1024 * 1024;

                    return (
                      <button
                        key={att.id}
                        onClick={() => !over16mb && handleSendFile(att)}
                        disabled={sendingFile || over16mb}
                        title={over16mb ? "Archivo demasiado grande para WhatsApp (máx. 16 MB)" : undefined}
                        className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-gray-50 text-left transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${attIsVideo ? "bg-purple-50" : "bg-red-50"}`}>
                          {attIsVideo
                            ? <Video className="w-4 h-4 text-purple-500" />
                            : <FileText className="w-4 h-4 text-red-500" />
                          }
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900 truncate">{displayName}</p>
                          <p className="text-xs text-muted-foreground">
                            {attIsHtml
                              ? "Informe — se enviará como PDF"
                              : attIsVideo
                              ? over16mb
                                ? `${sizeLabel} · demasiado grande para WA`
                                : `Video · ${sizeLabel}`
                              : sizeLabel}
                          </p>
                        </div>
                        {sendingFile && <Loader2 className="w-4 h-4 animate-spin text-primary shrink-0" />}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
