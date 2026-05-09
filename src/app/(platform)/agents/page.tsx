import { createClient } from "@/lib/supabase/server";
import { TopBar } from "@/components/layout/TopBar";

export default async function AgentsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <>
      <TopBar title="Agentes IA" userEmail={user?.email} />
      <div style={{ padding: "2rem" }}>Agents OK — paso 2 (TopBar + auth)</div>
    </>
  );
}
