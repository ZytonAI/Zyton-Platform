import type { SupabaseClient } from "@supabase/supabase-js";

export interface WaSessionRow {
  id: string;
  owner_id: string;
  status: string;
  phone: string | null;
}

/**
 * El QR no se lee de aquí: desde la migración 027 no se guarda. `wa_sessions`
 * la ven los cuatro, así que dejarlo en la tabla era ponerle el número del
 * equipo al alcance de cualquiera con la anon key.
 *
 * La sesión de WhatsApp es del workspace, no de cada persona: el equipo comparte
 * un solo número. Devuelve la fila vigente (la más reciente) o null si nadie ha
 * conectado todavía.
 */
export async function getWorkspaceSession(
  supabase: SupabaseClient
): Promise<WaSessionRow | null> {
  const { data } = await supabase
    .from("wa_sessions")
    .select("id, owner_id, status, phone")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return (data as WaSessionRow) ?? null;
}
