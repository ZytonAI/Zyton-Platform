import { createClient } from "@/lib/supabase/server";
import { TopBar } from "@/components/layout/TopBar";
import { InvoicesClient } from "@/components/invoices/InvoicesClient";
import type { Invoice } from "@/types";

export default async function InvoicesPage() {
  const supabase = await createClient();
  const [{ data: { user } }, { data: invoices }] = await Promise.all([
    supabase.auth.getUser(),
    supabase
      .from("invoices")
      .select("*")
      .order("due_date", { ascending: true }),
  ]);

  return (
    <>
      <TopBar title="Facturas" userEmail={user?.email} />
      <InvoicesClient initialInvoices={(invoices as Invoice[]) ?? []} />
    </>
  );
}
