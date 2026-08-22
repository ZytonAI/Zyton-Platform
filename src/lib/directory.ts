import type { SupabaseClient } from "@supabase/supabase-js";
import { memberByUsername, TEAM_MEMBERS, type TeamSlug } from "@/lib/team";

/**
 * De `owner_id` (el UUID de Supabase Auth) al miembro del equipo.
 *
 * Las tablas guardan quién creó cada registro, pero el UUID no le dice nada a
 * nadie. Esto lo traduce a un slug (samuel, camilo, …) para poder pintar el
 * nombre y el color de la persona.
 *
 * Es un objeto plano a propósito: viaja de un Server Component a los
 * componentes cliente sin ceremonia.
 */
export type Directory = Record<string, TeamSlug>;

/** Cuatro filas; se pide una vez por request. */
export async function fetchDirectory(supabase: SupabaseClient): Promise<Directory> {
  const { data, error } = await supabase.from("profiles").select("id, username, full_name");
  if (error || !data) return {};

  const directory: Directory = {};
  for (const row of data as { id: string; username: string | null; full_name: string | null }[]) {
    const member =
      memberByUsername(row.username) ??
      TEAM_MEMBERS.find((m) => m.name.toLowerCase() === row.full_name?.toLowerCase());
    if (member) directory[row.id] = member.slug;
  }
  return directory;
}
