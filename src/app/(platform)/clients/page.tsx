import { createClient } from "@/lib/supabase/server";
import { getSession } from "@/lib/auth/session";
import { canManageBilling } from "@/lib/permissions";
import { TopBar } from "@/components/layout/TopBar";
import { ClientsClient } from "@/components/clients/ClientsClient";
import type { Client } from "@/types";

export default async function ClientsPage() {
  const supabase = await createClient();
  const [{ user, role }, { data: clients }] = await Promise.all([
    getSession(),
    supabase.from("clients").select("*").order("created_at", { ascending: false }).limit(1000),
  ]);

  // El cobro configurado de cada cliente no viaja al navegador de un
  // Socio Estratégico (ver src/lib/permissions.ts)
  const rows = (clients as Client[]) ?? [];
  const visibleClients = canManageBilling(role)
    ? rows
    : rows.map((c) => ({ ...c, billing_type: null, billing_amount: null, billing_invoice_id: null }));

  return (
    <>
      <TopBar title="Clientes" userEmail={user?.email} />
      <ClientsClient initialClients={visibleClients as Client[]} />
    </>
  );
}
