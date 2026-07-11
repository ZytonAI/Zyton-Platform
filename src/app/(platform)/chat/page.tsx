import { TopBar } from "@/components/layout/TopBar";
import { createClient } from "@/lib/supabase/server";
import { ChatClient } from "@/components/chat/ChatClient";
import type { Conversation, WaSessionStatus } from "@/types";

export default async function ChatPage({
  searchParams,
}: {
  searchParams: Promise<{ conv?: string }>;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { conv } = await searchParams;

  // Siempre arrancar en "disconnected" — WaConnectPanel hará el poll real al bridge
  // y transicionará al chat si ya hay sesión activa. Evita leer status stale de Supabase.
  const initialStatus: WaSessionStatus = "disconnected";

  // Conversaciones iniciales
  const { data: conversations } = await supabase
    .from("conversations")
    .select("*")
    .eq("owner_id", user!.id)
    .order("last_message_at", { ascending: false, nullsFirst: false })
    .limit(500);

  return (
    <div className="flex flex-col h-screen">
      <TopBar title="Chat — WhatsApp" userEmail={user?.email} />
      <div className="flex-1 min-h-0">
        <ChatClient
          initialStatus={initialStatus}
          initialConversations={(conversations ?? []) as Conversation[]}
          preselectedConvId={conv}
        />
      </div>
    </div>
  );
}
