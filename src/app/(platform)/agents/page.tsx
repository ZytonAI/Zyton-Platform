import { createClient } from "@/lib/supabase/server";
import { TopBar } from "@/components/layout/TopBar";
import { AgentsWrapper } from "@/components/agents/AgentsWrapper";

export default async function AgentsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <>
      <TopBar title="Agentes IA" userEmail={user?.email} />
      <AgentsWrapper />
    </>
  );
}
