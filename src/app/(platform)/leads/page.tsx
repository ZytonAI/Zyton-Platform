import { createClient } from "@/lib/supabase/server";
import { TopBar } from "@/components/layout/TopBar";
import { LeadsClient } from "@/components/leads/LeadsClient";
import type { Lead } from "@/types";

export default async function LeadsPage() {
  const supabase = await createClient();
  const [{ data: { user } }, { data: allLeads }] = await Promise.all([
    supabase.auth.getUser(),
    supabase.from("leads").select("*").order("created_at", { ascending: false }).limit(1000),
  ]);

  // Antes se escondían los leads de Raúl con web hasta que Elisa generara su
  // informe. Elisa ya no existe, así que ese filtro solo los desaparecía.
  const leads = allLeads ?? [];

  return (
    <>
      <TopBar title="Leads" userEmail={user?.email} />
      <LeadsClient initialLeads={(leads as Lead[]) ?? []} />
    </>
  );
}
