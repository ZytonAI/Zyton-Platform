"use client";

import { useState, useCallback, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { ConversationList } from "./ConversationList";
import { MessageThread } from "./MessageThread";
import { WaConnectPanel } from "./WaConnectPanel";
import type { Conversation, WaSessionStatus } from "@/types";
import { MessageCircle, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface Props {
  initialStatus: WaSessionStatus;
  initialConversations: Conversation[];
  preselectedConvId?: string;
}

export function ChatClient({ initialStatus, initialConversations, preselectedConvId }: Props) {
  const [status, setStatus] = useState<WaSessionStatus>(initialStatus);
  const [conversations, setConversations] = useState<Conversation[]>(initialConversations);
  const [selected, setSelected] = useState<Conversation | null>(
    preselectedConvId ? (initialConversations.find((c) => c.id === preselectedConvId) ?? null) : null
  );
  const supabase = createClient();

  // Unificar conversaciones duplicadas al abrir el chat (una sola vez)
  useEffect(() => {
    fetch("/api/admin/merge-conversations", { method: "POST" }).catch(() => {});
  }, []);

  // Realtime: nuevas conversaciones o actualizaciones
  useEffect(() => {
    const channel = supabase
      .channel("conversations")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "conversations" },
        async () => {
          const res = await fetch("/api/whatsapp/conversations");
          if (res.ok) {
            const updated: Conversation[] = await res.json();
            setConversations(updated);
            setSelected((prev) => prev ? updated.find((c) => c.id === prev.id) ?? prev : null);
          }
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [supabase]);

  const handleConnected = useCallback(() => {
    setStatus("connected");
  }, []);

  const [disconnecting, setDisconnecting] = useState(false);
  const [justDisconnected, setJustDisconnected] = useState(false);

  const handleDisconnect = useCallback(async () => {
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
          selected ? "hidden md:flex" : "flex"
        )}
      >
        <div className="flex-1 min-h-0">
          <ConversationList
            conversations={conversations}
            selectedId={selected?.id ?? null}
            onSelect={setSelected}
            onNewConversation={handleNewConversation}
            onDeleteConversation={handleDeleteConversation}
          />
        </div>
        <div className="p-3 border-t">
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start gap-2 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
            onClick={handleDisconnect}
            disabled={disconnecting}
          >
            <LogOut className="w-4 h-4" />
            {disconnecting ? "Cerrando sesión..." : "Cerrar sesión de WhatsApp"}
          </Button>
        </div>
      </div>

      {/* Panel derecho — hilo de mensajes
          Mobile: full width cuando hay conversación seleccionada, oculto si no hay
          Desktop: flex-1, siempre visible */}
      <div
        className={cn(
          "flex-1 min-w-0",
          !selected && "hidden md:block"
        )}
      >
        {selected ? (
          <MessageThread
            key={selected.id}
            conversation={selected}
            onBack={() => setSelected(null)}
          />
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-center px-6">
            <div className="w-14 h-14 rounded-2xl bg-blue-50 flex items-center justify-center mb-4">
              <MessageCircle className="w-7 h-7 text-primary" />
            </div>
            <h3 className="font-semibold text-gray-900">Selecciona una conversación</h3>
            <p className="text-sm text-muted-foreground mt-1">
              Elige un contacto de la lista para ver los mensajes
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
