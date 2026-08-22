import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSession } from "@/lib/auth/session";
import { canManageBilling } from "@/lib/permissions";
import { TopBar } from "@/components/layout/TopBar";
import { ClientDetailClient } from "@/components/clients/ClientDetailClient";
import type { Client, HistoryEvent, FileAttachment, Invoice } from "@/types";

export default async function ClientDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { user, role } = await getSession();
  if (!user) redirect("/login");

  // Las facturas del cliente son cobros: solo se consultan para el Dueño
  const showBilling = canManageBilling(role);

  const [clientRes, historyRes, attachmentsRes, invoicesRes] = await Promise.all([
    supabase.from("clients").select("*").eq("id", id).single(),
    supabase.from("client_history").select("*").eq("client_id", id).order("created_at", { ascending: false }).limit(200),
    supabase.from("file_attachments").select("*").eq("entity_type", "client").eq("entity_id", id).order("created_at", { ascending: false }).limit(200),
    showBilling
      ? supabase.from("invoices").select("*").eq("client_id", id).order("due_date", { ascending: false }).limit(200)
      : Promise.resolve({ data: [] }),
  ]);

  if (clientRes.error) notFound();

  // Si la migración 016 aún no se aplicó, `type` no existe en la fila —
  // se normaliza a "payable" para no romper el render.
  const normalizedInvoices = ((invoicesRes.data ?? []) as Invoice[]).map((inv) => ({
    ...inv,
    type: inv.type ?? "payable",
  }));

  // El monto de cobro tampoco viaja al navegador de un Socio Estratégico
  const client = clientRes.data as Client;
  const visibleClient = showBilling
    ? client
    : { ...client, billing_type: null, billing_amount: null, billing_invoice_id: null };

  return (
    <>
      <TopBar title={client.name} userEmail={user.email} />
      <ClientDetailClient
        client={visibleClient as Client}
        history={(historyRes.data ?? []) as HistoryEvent[]}
        attachments={(attachmentsRes.data ?? []) as FileAttachment[]}
        invoices={normalizedInvoices}
      />
    </>
  );
}
