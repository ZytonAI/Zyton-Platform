import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSession } from "@/lib/auth/session";
import { isOwner } from "@/lib/permissions";
import { TopBar } from "@/components/layout/TopBar";
import { InvoicesClient } from "@/components/invoices/InvoicesClient";
import { resetRecurringInvoices } from "@/lib/recurring-invoices";
import type { Invoice } from "@/types";

export default async function InvoicesPage() {
  // Facturas = los cobros de la empresa: solo el Dueño. Los Socios
  // Estratégicos ni siquiera ven el ítem en el sidebar, pero si entran a
  // /invoices a mano se les devuelve al dashboard.
  const { user, role } = await getSession();
  if (!user) redirect("/login");
  if (!isOwner(role)) redirect("/dashboard");

  const supabase = await createClient();

  if (user) {
    // Reciclar facturas recurrentes pagadas cuyo período ya se cumplió —
    // se ve reflejado al instante, sin esperar al cron diario.
    const todayStr = new Date().toISOString().split("T")[0];
    await resetRecurringInvoices(supabase, todayStr).catch(() => {});
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

  // Si la migración 016 aún no se aplicó, `type` no existe en la fila —
  // se normaliza a "payable" (comportamiento previo) para no romper el render.
  const normalizedInvoices = ((invoices as Invoice[]) ?? []).map((inv) => ({
    ...inv,
    type: inv.type ?? "payable",
  }));

  return (
    <>
      <TopBar title="Facturas" userEmail={user?.email} />
      <InvoicesClient
        initialInvoices={normalizedInvoices}
        clients={clients ?? []}
      />
    </>
  );
}
