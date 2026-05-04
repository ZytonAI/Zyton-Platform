import { createClient } from "@/lib/supabase/server";
import { TopBar } from "@/components/layout/TopBar";
import { ClientsClient } from "@/components/clients/ClientsClient";
import type { Client } from "@/types";

export default async function ClientsPage() {
  const supabase = await createClient();
  const [{ data: { user } }, { data: clients }] = await Promise.all([
    supabase.auth.getUser(),
    supabase.from("clients").select("*").order("created_at", { ascending: false }),
  ]);

  return (
    <>
      <TopBar title="Clientes" userEmail={user?.email} />
      <ClientsClient initialClients={(clients as Client[]) ?? []} />
    </>
  );
}
