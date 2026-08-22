import type { SupabaseClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

/**
 * Aviso de edición concurrente.
 *
 * Con cuatro personas sobre los mismos leads, dos pueden abrir la misma ficha
 * y guardar una encima de la otra sin enterarse. El formulario manda el
 * `updated_at` que tenía cuando la abrió; si en la base hay uno más nuevo,
 * alguien más guardó primero y se responde 409 en vez de pisarlo.
 *
 * No es un bloqueo: quien llega segundo recarga y vuelve a guardar.
 */
export async function detectConflict(
  supabase: SupabaseClient,
  table: "leads" | "clients",
  id: string,
  expectedUpdatedAt: unknown
): Promise<NextResponse | null> {
  if (typeof expectedUpdatedAt !== "string" || !expectedUpdatedAt) return null;

  const { data } = await supabase.from(table).select("updated_at").eq("id", id).maybeSingle();
  const current = (data as { updated_at?: string } | null)?.updated_at;
  if (!current) return null;

  // Comparar como fecha: el formato del string puede variar (zonas, precisión)
  if (new Date(current).getTime() <= new Date(expectedUpdatedAt).getTime()) return null;

  return NextResponse.json(
    {
      error:
        "Otra persona del equipo guardó cambios en este registro mientras lo tenías abierto. " +
        "Recarga la página para ver la versión actual y vuelve a aplicar lo tuyo.",
      conflict: true,
    },
    { status: 409 }
  );
}
