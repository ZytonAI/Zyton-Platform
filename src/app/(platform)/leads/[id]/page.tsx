import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { TopBar } from "@/components/layout/TopBar";
import { LeadDetailClient } from "@/components/leads/LeadDetailClient";
import type { Lead, HistoryEvent, FileAttachment } from "@/types";

export default async function LeadDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [leadRes, historyRes, attachmentsRes] = await Promise.all([
    supabase.from("leads").select("*").eq("id", id).single(),
    supabase.from("lead_history").select("*").eq("lead_id", id).order("created_at", { ascending: false }),
    supabase.from("file_attachments").select("*").eq("entity_type", "lead").eq("entity_id", id).order("created_at", { ascending: false }),
  ]);

  if (leadRes.error) notFound();

  return (
    <>
      <TopBar title={leadRes.data.name} userEmail={user.email} />
      <LeadDetailClient
        lead={leadRes.data as Lead}
        history={(historyRes.data ?? []) as HistoryEvent[]}
        attachments={(attachmentsRes.data ?? []) as FileAttachment[]}
      />
    </>
  );
}
