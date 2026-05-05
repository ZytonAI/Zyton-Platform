import { TopBar } from "@/components/layout/TopBar";
import { createClient } from "@/lib/supabase/server";
import { ChatClient } from "@/components/chat/ChatClient";
import type { Conversation, WaSessionStatus } from "@/types";

export default async function ChatPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  // Estado de la sesión WA almacenado en Supabase
  const { data: session } = await supabase
    .from("wa_sessions")
    .select("status")
    .eq("owner_id", user!.id)
    .single();

  const initialStatus = (session?.status ?? "disconnected") as WaSessionStatus;

  // Conversaciones iniciales
  const { data: conversations } = await supabase
    .from("conversations")
    .select("*")
    .eq("owner_id", user!.id)
    .order("last_message_at", { ascending: false, nullsFirst: false });

  return (
    <div className="flex flex-col h-screen">
      <TopBar title="Chat — WhatsApp" userEmail={user?.email} />
      <div className="flex-1 min-h-0">
        <ChatClient
          initialStatus={initialStatus}
          initialConversations={(conversations ?? []) as Conversation[]}
        />
      </div>
    </div>
  );
}
