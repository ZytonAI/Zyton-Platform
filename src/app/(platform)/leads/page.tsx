import { createClient } from "@/lib/supabase/server";
import { TopBar } from "@/components/layout/TopBar";
import { LeadsClient } from "@/components/leads/LeadsClient";
import type { Lead } from "@/types";

export default async function LeadsPage() {
  const supabase = await createClient();
  const [{ data: { user } }, { data: allLeads }] = await Promise.all([
    supabase.auth.getUser(),
    supabase.from("leads").select("*")
      .order("priority", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: false }),
  ]);

  // Ocultar leads de Raúl que tienen web pero Elisa aún no ha generado su informe
  const leads = (allLeads ?? []).filter(
    (l) => l.source !== "raul" || l.analyzed || l.website === "Sin página web"
  );

  return (
    <>
      <TopBar title="Leads" userEmail={user?.email} />
      <LeadsClient initialLeads={(leads as Lead[]) ?? []} />
    </>
  );
}
