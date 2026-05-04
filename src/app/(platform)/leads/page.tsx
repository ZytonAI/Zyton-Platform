import { createClient } from "@/lib/supabase/server";
import { TopBar } from "@/components/layout/TopBar";
import { LeadsClient } from "@/components/leads/LeadsClient";
import type { Lead } from "@/types";

export default async function LeadsPage() {
  const supabase = await createClient();
  const [{ data: { user } }, { data: leads }] = await Promise.all([
    supabase.auth.getUser(),
    supabase.from("leads").select("*").order("created_at", { ascending: false }),
  ]);

  return (
    <>
      <TopBar title="Leads" userEmail={user?.email} />
      <LeadsClient initialLeads={(leads as Lead[]) ?? []} />
    </>
  );
}
