import { createClient } from "@/lib/supabase/server";
import { TopBar } from "@/components/layout/TopBar";
import dynamic from "next/dynamic";

const AgentsPageClient = dynamic(
  () =>
    import("@/components/agents/AgentsPageClient").then(
      (m) => ({ default: m.AgentsPageClient })
    ),
  { ssr: false, loading: () => <div className="p-6 text-sm text-muted-foreground">Cargando agentes...</div> }
);

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
