"use client";

import { useState, useCallback, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { ConversationList } from "./ConversationList";
import { MessageThread } from "./MessageThread";
import { WaConnectPanel } from "./WaConnectPanel";
import type { Conversation, WaSessionStatus } from "@/types";
import { MessageCircle } from "lucide-react";

interface Props {
  initialStatus: WaSessionStatus;
  initialConversations: Conversation[];
}

export function ChatClient({ initialStatus, initialConversations }: Props) {
  const [status, setStatus] = useState<WaSessionStatus>(initialStatus);
  const [conversations, setConversations] = useState<Conversation[]>(initialConversations);
  const [selected, setSelected] = useState<Conversation | null>(null);
  const supabase = createClient();

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
            // Actualizar conversación seleccionada si cambió
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

  const handleNewConversation = useCallback((conv: Conversation) => {
    setConversations((prev) => {
      const exists = prev.find((c) => c.id === conv.id);
      if (exists) return prev;
      return [conv, ...prev];
    });
  }, []);

  if (status !== "connected") {
    return (
      <div className="h-full">
        <WaConnectPanel onConnected={handleConnected} />
      </div>
    );
  }

  return (
    <div className="flex h-full">
      {/* Panel izquierdo — lista de conversaciones */}
      <div className="w-80 shrink-0 flex flex-col">
        <ConversationList
          conversations={conversations}
          selectedId={selected?.id ?? null}
          onSelect={setSelected}
          onNewConversation={handleNewConversation}
        />
      </div>

      {/* Panel derecho — hilo de mensajes */}
      <div className="flex-1 min-w-0">
        {selected ? (
          <MessageThread key={selected.id} conversation={selected} />
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
