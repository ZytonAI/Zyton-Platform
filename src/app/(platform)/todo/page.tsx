import { createClient } from "@/lib/supabase/server";
import { TopBar } from "@/components/layout/TopBar";
import { TodoClient } from "@/components/todo/TodoClient";
import { purgarTareasCumplidas } from "@/lib/task-cleanup";
import type { Task } from "@/types";

export default async function TodoPage() {
  const supabase = await createClient();

  // Las completadas cuya fecha ya pasó se van antes de pintar el tablero
  const purgadas = await purgarTareasCumplidas(supabase);

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
      <TodoClient
        initialTasks={(tasks as Task[]) ?? []}
        userEmail={user?.email}
        purgadas={purgadas}
      />
    </>
  );
}
