import type { SupabaseClient } from "@supabase/supabase-js";
import { fechaHoyColombia } from "@/lib/event-time";

/**
 * Limpieza del tablero To Do: una tarea completada desaparece el día
 * siguiente a su fecha.
 *
 * El día de la fecha la tarea sigue a la vista aunque ya esté hecha —sirve
 * para saber que se cumplió—; a partir del día siguiente ya no aporta nada y
 * se borra. Las tareas sin fecha no se tocan nunca: no hay "día siguiente"
 * que esperar. Las que no están completadas tampoco: esas se quedan, y el
 * tablero las pinta en rojo.
 *
 * Corre cuando alguien abre el tablero (la página y `GET /api/tasks`), que es
 * justo cuando importa que ya no estén. No hace falta un cron para eso.
 */
export async function purgarTareasCumplidas(supabase: SupabaseClient): Promise<number> {
  const { data, error } = await supabase
    .from("tasks")
    .delete()
    .eq("status", "done")
    .not("due_date", "is", null)
    .lt("due_date", fechaHoyColombia())
    .select("id");

  if (error) {
    // Que no se puedan borrar no debe impedir ver el tablero
    console.error("[todo] no se pudieron borrar las tareas cumplidas:", error.message);
    return 0;
  }
  return data?.length ?? 0;
}
