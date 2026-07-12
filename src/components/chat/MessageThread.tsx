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
import { Send, Loader2, MessageCircle, Plus, FileText, Search, Video, ArrowLeft, ChevronDown, Check, CheckCheck, AlertCircle, Download } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { LEAD_STATUS, LEAD_STATUS_ORDER } from "@/lib/status-config";
import type { Conversation, Message, FileAttachment } from "@/types";
import { cn } from "@/lib/utils";

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
}

// Etiquetas placeholder que pone el webhook cuando el mensaje es solo media
const MEDIA_PLACEHOLDERS = new Set(["[Imagen]", "[Audio]", "[Video]", "[Documento]", "[Archivo]"]);

function MessageStatusTicks({ status }: { status: Message["status"] }) {
  if (status === "read") return <CheckCheck className="w-3.5 h-3.5 text-sky-300" />;
  if (status === "delivered") return <CheckCheck className="w-3.5 h-3.5 opacity-70" />;
  if (status === "failed") return <AlertCircle className="w-3.5 h-3.5 text-red-300" />;
  return <Check className="w-3.5 h-3.5 opacity-70" />;
}

function MessageMedia({ msg }: { msg: Message }) {
  if (!msg.media_signed_url) {
    // Media sin URL firmada (ej: envío fallido sin archivo) — no renderizar nada extra
    return null;
  }
  const mime = msg.media_type ?? "";

  if (mime.startsWith("image/")) {
    return (
      <a href={msg.media_signed_url} target="_blank" rel="noopener noreferrer" className="block mb-1">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={msg.media_signed_url}
          alt="Imagen adjunta"
          className="rounded-lg max-h-64 max-w-full object-contain"
          loading="lazy"
        />
      </a>
    );
  }
  if (mime.startsWith("audio/")) {
    return <audio controls src={msg.media_signed_url} className="mb-1 max-w-full" preload="metadata" />;
  }
  if (mime.startsWith("video/")) {
    return <video controls src={msg.media_signed_url} className="rounded-lg max-h-64 max-w-full mb-1" preload="metadata" />;
  }
  // Documento u otro tipo — chip de descarga
  return (
    <a
      href={msg.media_signed_url}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        "flex items-center gap-2 rounded-lg px-2.5 py-2 mb-1 text-xs font-medium",
        msg.direction === "outbound" ? "bg-white/15 hover:bg-white/25" : "bg-muted hover:bg-muted/70"
      )}
    >
      <FileText className="w-4 h-4 shrink-0" />
      <span className="truncate">{msg.body.replace(/^📎\s*/, "") || "Documento"}</span>
      <Download className="w-3.5 h-3.5 shrink-0 ml-auto" />
    </a>
  );
}

interface Props {
  conversation: Conversation;
  onBack?: () => void;
}

type LeadStatus = "new" | "contacted" | "scheduled" | "qualified" | "lost" | "converted";

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
  const [uploading, setUploading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
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
        // Refrescar también cuando cambian estados (ticks), o cuando un mensaje
        // llegó por Realtime sin su URL firmada todavía (Realtime trae la fila
        // cruda de la base de datos, sin media_signed_url — eso solo lo agrega
        // este endpoint) y hay que completarla.
        const signature = (list: Message[]) =>
          list.map((m) => `${m.id}:${m.status}:${m.media_url ? !!m.media_signed_url : 1}`).join(",");
        if (signature(fresh) === signature(prev)) return prev;
        return fresh;
      });
    }
  }, [conversation.id]);

  useEffect(() => {
    fetchMessages();
  }, [fetchMessages]);

  // Cargar estado del lead — primero por lead_id, luego por teléfono
  useEffect(() => {
    async function loadLeadStatus() {
      // 1. Por lead_id directo
      if (conversation.lead_id) {
        const res = await fetch(`/api/leads/${conversation.lead_id}`);
        if (res.ok) {
          const lead = await res.json();
          if (lead?.status) { setLeadStatus(lead.status as LeadStatus); return; }
        }
      }
      // 2. Fallback: buscar por sufijo de teléfono
      const suffix = conversation.contact_phone?.slice(-10);
      if (!suffix) return;
      const res = await fetch(`/api/leads?search=${suffix}`);
      if (!res.ok) return;
      const leads: { id: string; phone?: string; status?: string }[] = await res.json();
      const match = leads.find((l) => l.phone?.slice(-10) === suffix);
      if (match?.status) setLeadStatus(match.status as LeadStatus);
    }
    loadLeadStatus().catch(() => {});
  }, [conversation.id, conversation.lead_id, conversation.contact_phone]);

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
      toast.success(`Lead: ${LEAD_STATUS[status].label}`);
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
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "messages",
          filter: `conversation_id=eq.${conversation.id}`,
        },
        (payload) => {
          // Acks de entregado/leído: actualizar el estado sin perder la URL firmada
          setMessages((prev) =>
            prev.map((m) =>
              m.id === payload.new.id ? { ...m, status: (payload.new as Message).status } : m
            )
          );
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
        const err = await res.json().catch(() => ({}));
        toast.error(err.error ?? "Error enviando mensaje");
        // La API persiste el intento fallido — mostrarlo con opción de reintentar
        if (err.message) {
          const failed: Message = err.message;
          setMessages((prev) =>
            prev.some((m) => m.id === failed.id) ? prev : [...prev, failed]
          );
          setText("");
        }
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

  async function handleRetry(msg: Message) {
    if (sending) return;
    setSending(true);
    try {
      const res = await fetch("/api/whatsapp/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversation_id: conversation.id,
          body: msg.body,
          retry_message_id: msg.id,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error ?? "Error reintentando el envío");
        return;
      }
      const updated: Message = await res.json();
      setMessages((prev) => prev.map((m) => (m.id === updated.id ? updated : m)));
      toast.success("Mensaje enviado");
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
        const err = await res.json().catch(() => ({}));
        toast.error(err.error ?? "Error enviando archivo");
        // La API persiste el intento fallido — mostrarlo en el hilo
        if (err.message) {
          const failed: Message = err.message;
          setMessages((prev) =>
            prev.some((m) => m.id === failed.id) ? prev : [...prev, failed]
          );
          setShowAttach(false);
        }
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

  // Subir un archivo del equipo (se guarda como adjunto del lead) y enviarlo directo
  async function handleUploadAndSend(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !conversation.lead_id) return;

    if (file.size > 16 * 1024 * 1024) {
      toast.error("El archivo es demasiado grande para WhatsApp (máx. 16 MB)");
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    setUploading(true);
    try {
      const res = await fetch("/api/attachments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entity_type: "lead",
          entity_id: conversation.lead_id,
          file_name: file.name,
          content_type: file.type || "application/octet-stream",
          size_bytes: file.size,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Error creando URL de subida");

      const uploadRes = await fetch(json.signedUrl, {
        method: "PUT",
        headers: { "Content-Type": file.type || "application/octet-stream" },
        body: file,
      });
      if (!uploadRes.ok) throw new Error(`Error subiendo a Storage (${uploadRes.status})`);

      await handleSendFile(json.attachment);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al subir el archivo");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  const filteredAttachments = attachments.filter((a) =>
    a.file_name.toLowerCase().includes(attachSearch.toLowerCase())
  );

  return (
    <div className="flex flex-col h-full bg-muted/60">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 bg-card border-b">
        {onBack && (
          <button
            onClick={onBack}
            className="md:hidden p-1.5 -ml-1 rounded-lg text-muted-foreground hover:bg-muted transition-colors shrink-0"
            aria-label="Volver a conversaciones"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
        )}
        <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center text-primary font-semibold text-sm shrink-0">
          {(conversation.contact_name ?? conversation.contact_phone).slice(0, 2).toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm text-foreground">
            {conversation.contact_name ?? conversation.contact_phone}
          </p>
          {conversation.contact_name && (
            <p className="text-xs text-muted-foreground">{conversation.contact_phone}</p>
          )}
        </div>

        {/* Dropdown estado del lead — siempre visible */}
        <DropdownMenu>
          <DropdownMenuTrigger
            className={`shrink-0 flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold border hover:opacity-80 outline-none transition-opacity ${leadStatus ? LEAD_STATUS[leadStatus].badgeClass : "bg-muted text-muted-foreground border-border"}`}
          >
            {leadStatus ? LEAD_STATUS[leadStatus].label : "Estado"}
            <ChevronDown className="w-3 h-3" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {LEAD_STATUS_ORDER.filter((s) => s !== leadStatus).map((s) => (
              <DropdownMenuItem key={s} onClick={() => handleChangeLeadStatus(s)}>
                {LEAD_STATUS[s].label}
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
          messages.map((msg) => {
            // No repetir el placeholder "[Imagen]" cuando la media ya se renderiza,
            // ni el "📎 nombre" cuando el chip de documento ya lo muestra
            const isDocChip =
              msg.media_signed_url &&
              !["image/", "audio/", "video/"].some((p) => msg.media_type?.startsWith(p));
            const hideBody =
              (msg.media_signed_url && MEDIA_PLACEHOLDERS.has(msg.body)) || isDocChip;

            return (
              <div
                key={msg.id}
                className={cn("flex", msg.direction === "outbound" ? "justify-end" : "justify-start")}
              >
                <div
                  className={cn(
                    "max-w-[70%] px-3 py-2 rounded-2xl text-sm shadow-sm",
                    msg.direction === "outbound"
                      ? "bg-primary text-primary-foreground rounded-br-sm"
                      : "bg-card text-card-foreground rounded-bl-sm",
                    msg.status === "failed" && "opacity-80 ring-1 ring-red-300"
                  )}
                >
                  <MessageMedia msg={msg} />
                  {!hideBody && <p className="leading-relaxed break-words">{msg.body}</p>}
                  <div className={cn(
                    "flex items-center justify-end gap-1 text-[10px] mt-1",
                    msg.direction === "outbound" ? "text-primary-foreground/70" : "text-muted-foreground"
                  )}>
                    <span>{formatTime(msg.created_at)}</span>
                    {msg.direction === "outbound" && <MessageStatusTicks status={msg.status} />}
                  </div>
                  {msg.status === "failed" && msg.direction === "outbound" && (
                    <button
                      type="button"
                      onClick={() => handleRetry(msg)}
                      disabled={sending}
                      className="mt-1 w-full text-center text-[11px] font-semibold text-red-200 hover:text-white underline underline-offset-2 disabled:opacity-50"
                    >
                      No se envió — Reintentar
                    </button>
                  )}
                </div>
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <form onSubmit={handleSend} className="flex items-center gap-2 px-4 py-3 bg-card border-t">
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
              Usa el botón &quot;Contactar&quot; desde la sección Leads para vincularla.
            </p>
          ) : (
            <div className="flex flex-col gap-3">
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                onChange={handleUploadAndSend}
              />
              <Button
                type="button"
                variant="outline"
                className="w-full justify-center gap-2"
                disabled={uploading || sendingFile}
                onClick={() => fileInputRef.current?.click()}
              >
                {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                {uploading ? "Subiendo y enviando..." : "Subir archivo del equipo"}
              </Button>
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
                        className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-muted text-left transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${attIsVideo ? "bg-purple-50" : "bg-red-50"}`}>
                          {attIsVideo
                            ? <Video className="w-4 h-4 text-purple-500" />
                            : <FileText className="w-4 h-4 text-red-500" />
                          }
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-foreground truncate">{displayName}</p>
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
