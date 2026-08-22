import { TopBar } from "@/components/layout/TopBar";
import { createClient } from "@/lib/supabase/server";
import { getSession } from "@/lib/auth/session";
import { isOwner } from "@/lib/permissions";
import { fetchConversations, scopeConversations } from "@/lib/conversation-scope";
import { ChatClient } from "@/components/chat/ChatClient";
import type { WaSessionStatus } from "@/types";

export default async function ChatPage({
  searchParams,
}: {
  searchParams: Promise<{ conv?: string }>;
}) {
  const supabase = await createClient();
  const { user, role, member } = await getSession();
  const { conv } = await searchParams;

  // Siempre arrancar en "disconnected" — WaConnectPanel hará el poll real al bridge
  // y transicionará al chat si ya hay sesión activa. Evita leer status stale de Supabase.
  const initialStatus: WaSessionStatus = "disconnected";

  // Cada quien ve los chats de los leads que contactó (ver conversation-scope).
  // El Dueño los ve todos y puede alternar entre vista general y personal.
  const canSeeAll = isOwner(role);
  const all = await fetchConversations(supabase);
  const conversations = scopeConversations(all, member?.slug, canSeeAll);

  return (
    <div className="flex flex-col h-screen">
      <TopBar title="Chat — WhatsApp" userEmail={user?.email} />
      <div className="flex-1 min-h-0">
        <ChatClient
          initialStatus={initialStatus}
          initialConversations={conversations}
          preselectedConvId={conv}
          mySlug={member?.slug ?? null}
          canSeeAll={canSeeAll}
        />
      </div>
    </div>
  );
}
