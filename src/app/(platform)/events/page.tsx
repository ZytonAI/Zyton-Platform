import { createClient } from "@/lib/supabase/server";
import { TopBar } from "@/components/layout/TopBar";
import { EventsClient } from "@/components/events/EventsClient";
import type { CalendarEvent } from "@/types";

export default async function EventsPage() {
  const supabase = await createClient();
  const [{ data: { user } }, { data: events }] = await Promise.all([
    supabase.auth.getUser(),
    supabase
      .from("calendar_events")
      .select("*")
      .order("event_date", { ascending: true })
      .limit(1000),
  ]);

  return (
    <>
      <TopBar title="Calendario" userEmail={user?.email} />
      <EventsClient initialEvents={(events as CalendarEvent[]) ?? []} />
    </>
  );
}
