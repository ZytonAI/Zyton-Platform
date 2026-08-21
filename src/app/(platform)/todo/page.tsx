import { createClient } from "@/lib/supabase/server";
import { TopBar } from "@/components/layout/TopBar";
import { TodoClient } from "@/components/todo/TodoClient";
import type { Task } from "@/types";

export default async function TodoPage() {
  const supabase = await createClient();
  const [{ data: { user } }, { data: tasks }] = await Promise.all([
    supabase.auth.getUser(),
    supabase
      .from("tasks")
      .select("*")
      .order("due_date", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: false }),
  ]);

  return (
    <>
      <TopBar title="To Do" userEmail={user?.email} />
      <TodoClient initialTasks={(tasks as Task[]) ?? []} userEmail={user?.email} />
    </>
  );
}
