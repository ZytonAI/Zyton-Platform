import type { SupabaseClient } from "@supabase/supabase-js";
import { phonesMatch } from "@/lib/phone";

export interface DuplicateMatch {
  type: "lead" | "client";
  id: string;
  name: string;
}

/**
 * Busca en leads y clientes del owner un registro con el mismo teléfono
 * (normalizado, con/sin código de país) o el mismo email.
 * Devuelve el primer match o null.
 */
export async function findDuplicate(
  supabase: SupabaseClient,
  ownerId: string,
  phone: string | null | undefined,
  email: string | null | undefined,
  excludeId?: string
): Promise<DuplicateMatch | null> {
  const cleanEmail = email?.trim().toLowerCase() || null;
  const hasPhone = !!phone?.trim();
  if (!hasPhone && !cleanEmail) return null;

  const [{ data: leads }, { data: clients }] = await Promise.all([
    supabase
      .from("leads")
      .select("id, name, phone, email")
      .eq("owner_id", ownerId)
      .limit(2000),
    supabase
      .from("clients")
      .select("id, name, phone, email")
      .eq("owner_id", ownerId)
      .limit(2000),
  ]);

  const matches = (row: { id: string; phone: string | null; email: string | null }) => {
    if (excludeId && row.id === excludeId) return false;
    if (hasPhone && phonesMatch(row.phone, phone)) return true;
    if (cleanEmail && row.email?.trim().toLowerCase() === cleanEmail) return true;
    return false;
  };

  const client = clients?.find(matches);
  if (client) return { type: "client", id: client.id, name: client.name };

  const lead = leads?.find(matches);
  if (lead) return { type: "lead", id: lead.id, name: lead.name };

  return null;
}
