import { createClient } from "@/lib/supabase/server";
import { TopBar } from "@/components/layout/TopBar";
import { InvoicesClient } from "@/components/invoices/InvoicesClient";
import { resetRecurringInvoices } from "@/lib/recurring-invoices";
import type { Invoice } from "@/types";

export default async function InvoicesPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (user) {
    // Reciclar facturas recurrentes pagadas cuyo período ya se cumplió —
    // se ve reflejado al instante, sin esperar al cron diario.
    const todayStr = new Date().toISOString().split("T")[0];
    await resetRecurringInvoices(supabase, todayStr, user.id).catch(() => {});
  }

  const [{ data: invoices }, { data: clients }] = await Promise.all([
    supabase
      .from("invoices")
      .select("*")
      .order("due_date", { ascending: true })
      .limit(1000),
    supabase
      .from("clients")
      .select("id, name")
      .order("name", { ascending: true })
      .limit(1000),
  ]);

  return (
    <>
      <TopBar title="Facturas" userEmail={user?.email} />
      <InvoicesClient
        initialInvoices={(invoices as Invoice[]) ?? []}
        clients={clients ?? []}
      />
    </>
  );
}
