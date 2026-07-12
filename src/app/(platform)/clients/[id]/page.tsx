import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { TopBar } from "@/components/layout/TopBar";
import { ClientDetailClient } from "@/components/clients/ClientDetailClient";
import type { Client, HistoryEvent, FileAttachment, Invoice } from "@/types";

export default async function ClientDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [clientRes, historyRes, attachmentsRes, invoicesRes] = await Promise.all([
    supabase.from("clients").select("*").eq("id", id).single(),
    supabase.from("client_history").select("*").eq("client_id", id).order("created_at", { ascending: false }).limit(200),
    supabase.from("file_attachments").select("*").eq("entity_type", "client").eq("entity_id", id).order("created_at", { ascending: false }).limit(200),
    supabase.from("invoices").select("*").eq("client_id", id).order("due_date", { ascending: false }).limit(200),
  ]);

  if (clientRes.error) notFound();

  return (
    <>
      <TopBar title={clientRes.data.name} userEmail={user.email} />
      <ClientDetailClient
        client={clientRes.data as Client}
        history={(historyRes.data ?? []) as HistoryEvent[]}
        attachments={(attachmentsRes.data ?? []) as FileAttachment[]}
        invoices={(invoicesRes.data ?? []) as Invoice[]}
      />
    </>
  );
}
