import { createClient } from "@/lib/supabase/server";
import { TopBar } from "@/components/layout/TopBar";
import { WikiClient } from "@/components/wiki/WikiClient";

export default async function WikiPage() {
  const supabase = await createClient();
  const [{ data: { user } }, { data: pages }] = await Promise.all([
    supabase.auth.getUser(),
    supabase
      .from("workspace_pages")
      .select("*")
      .order("position", { ascending: true })
      .order("created_at", { ascending: true }),
  ]);

  return (
    <>
      <TopBar title="Wiki" userEmail={user?.email} />
      <WikiClient initialPages={pages ?? []} />
    </>
  );
}
