"use client";

import { useState, useCallback, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { ConversationList } from "./ConversationList";
import { MessageThread } from "./MessageThread";
import { WaConnectPanel } from "./WaConnectPanel";
import type { Conversation, WaSessionStatus } from "@/types";
import { isMine } from "@/lib/conversation-scope";
import { useIsOwner } from "@/components/layout/SessionContext";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { MessageCircle, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface Props {
  initialStatus: WaSessionStatus;
  initialConversations: Conversation[];
  preselectedConvId?: string;
  /** Slug del equipo de quien está viendo — para saber qué chats son suyos */
  mySlug: string | null;
  /** El Dueño puede alternar entre ver todo el equipo y solo lo suyo */
  canSeeAll: boolean;
}

export function ChatClient({
  initialStatus,
  initialConversations,
  preselectedConvId,
  mySlug,
  canSeeAll,
}: Props) {
  const [status, setStatus] = useState<WaSessionStatus>(initialStatus);
  const [conversations, setConversations] = useState<Conversation[]>(initialConversations);
  // Solo el Dueño ve el selector; para el resto la API ya recortó la lista.
  const [view, setView] = useState<"all" | "mine">("all");
  const [selected, setSelected] = useState<Conversation | null>(
    preselectedConvId ? (initialConversations.find((c) => c.id === preselectedConvId) ?? null) : null
  );
  const supabase = createClient();

  const refreshConversations = useCallback(async () => {
    const res = await fetch("/api/whatsapp/conversations");
    if (!res.ok) return;
    const updated: Conversation[] = await res.json();
    setConversations(updated);
    setSelected((prev) => (prev ? updated.find((c) => c.id === prev.id) ?? null : null));
  }, []);

  // Realtime: nuevas conversaciones o actualizaciones
  useEffect(() => {
    const channel = supabase
      .channel("conversations")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "conversations" },
        refreshConversations
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [supabase, refreshConversations]);

  const handleConnected = useCallback(() => {
    setStatus("connected");
  }, []);

  const [disconnecting, setDisconnecting] = useState(false);
  const [justDisconnected, setJustDisconnected] = useState(false);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  // El número es uno solo para los cuatro: cerrarlo deja sin chat a todo el
  // equipo, así que solo el Dueño puede hacerlo.
  const canDisconnect = useIsOwner();

  const handleDisconnect = useCallback(async () => {
    setConfirmDisconnect(false);
    setDisconnecting(true);
    setJustDisconnected(true);
    setStatus("disconnected");
    setSelected(null);
    try {
      await fetch("/api/whatsapp/disconnect", { method: "POST" });
    } finally {
      setDisconnecting(false);
      setTimeout(() => setJustDisconnected(false), 6000);
    }
  }, []);

  const handleNewConversation = useCallback((conv: Conversation) => {
    setConversations((prev) => {
      const exists = prev.find((c) => c.id === conv.id);
      if (exists) return prev;
      return [conv, ...prev];
    });
  }, []);

  const handleDeleteConversation = useCallback((id: string) => {
    setConversations((prev) => prev.filter((c) => c.id !== id));
    setSelected((prev) => (prev?.id === id ? null : prev));
  }, []);

  // Vista personal: lo etiquetado como mío + los chats que nadie ha reclamado
  const visible =
    canSeeAll && view === "mine"
      ? conversations.filter((c) => isMine(c, mySlug))
      : conversations;

  // Si al cambiar de vista el chat abierto ya no está en la lista, se cierra
  const openConv = selected && visible.some((c) => c.id === selected.id) ? selected : null;

  if (status !== "connected") {
    return (
      <div className="h-full">
        <WaConnectPanel onConnected={handleConnected} suppressConnect={justDisconnected} />
      </div>
    );
  }

  return (
    <div className="flex h-full">
      {/* Panel izquierdo — lista de conversaciones
          Mobile: full width cuando no hay conversación seleccionada, oculto si hay una
          Desktop: ancho fijo, siempre visible */}
      <div
        className={cn(
          "shrink-0 flex flex-col border-r",
          "w-full md:w-80",
          openConv ? "hidden md:flex" : "flex"
        )}
      >
        <div className="flex-1 min-h-0">
          <ConversationList
            conversations={visible}
            view={view}
            onChangeView={setView}
            showViewToggle={canSeeAll}
            selectedId={openConv?.id ?? null}
            onSelect={setSelected}
            onNewConversation={handleNewConversation}
            onDeleteConversation={handleDeleteConversation}
          />
        </div>
        {canDisconnect && (
          <div className="p-3 border-t">
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-start gap-2 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
              onClick={() => setConfirmDisconnect(true)}
              disabled={disconnecting}
            >
              <LogOut className="w-4 h-4" />
              {disconnecting ? "Cerrando sesión..." : "Cerrar sesión de WhatsApp"}
            </Button>
          </div>
        )}
      </div>

      {/* Panel derecho — hilo de mensajes
          Mobile: full width cuando hay conversación seleccionada, oculto si no hay
          Desktop: flex-1, siempre visible */}
      <div
        className={cn(
          "flex-1 min-w-0",
          !openConv && "hidden md:block"
        )}
      >
        {openConv ? (
          <MessageThread
            key={openConv.id}
            conversation={openConv}
            onBack={() => setSelected(null)}
            onReassigned={refreshConversations}
          />
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-center px-6">
            <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
              <MessageCircle className="w-7 h-7 text-primary" />
            </div>
            <h3 className="font-semibold text-foreground">Selecciona una conversación</h3>
            <p className="text-sm text-muted-foreground mt-1">
              Elige un contacto de la lista para ver los mensajes
            </p>
          </div>
        )}
      </div>

      <ConfirmDialog
        open={confirmDisconnect}
        title="Cerrar la sesión de WhatsApp"
        description="El número es uno solo para todo el equipo: al cerrarlo, los cuatro se quedan sin chat hasta que alguien vuelva a escanear el código QR."
        confirmLabel="Cerrar sesión"
        loadingLabel="Cerrando..."
        loading={disconnecting}
        onConfirm={handleDisconnect}
        onCancel={() => setConfirmDisconnect(false)}
      />
    </div>
  );
}
