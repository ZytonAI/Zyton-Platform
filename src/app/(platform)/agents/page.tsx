import { createClient } from "@/lib/supabase/server";
import { TopBar } from "@/components/layout/TopBar";
import { AgentsPageClient } from "@/components/agents/AgentsPageClient";

export default async function AgentsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <>
      <TopBar title="Agentes IA" userEmail={user?.email} />
      <AgentsPageClient />
    </>
  );
}
