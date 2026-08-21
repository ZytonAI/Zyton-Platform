import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { memberByUsername } from "@/lib/team";
import { NextResponse } from "next/server";
import { z } from "zod";

const loginSchema = z.object({
  username: z.string().min(1).max(120),
  password: z.string().min(1).max(200),
});

// Mismo mensaje para usuario inexistente y contraseña mala: no delata qué
// usuarios existen.
const INVALID = "Usuario o contraseña incorrectos.";

/**
 * Supabase Auth siempre firma con email. El equipo entra con su usuario
 * (SamuelZY, CamiloZY, …), así que aquí se traduce usuario → email:
 *
 *   1. src/lib/team.ts — los cuatro del equipo, sin tocar la base
 *   2. profiles.username — por si se agrega gente desde la BD (migración 015)
 *   3. si trae "@", se toma como email directo (salida de emergencia)
 */
async function resolveEmail(identifier: string): Promise<string | null> {
  if (identifier.includes("@")) return identifier;

  const member = memberByUsername(identifier);
  if (member) return member.email;

  // profiles está bajo RLS y aquí todavía no hay sesión: service role.
  const admin = createAdminClient();
  const { data: profile, error } = await admin
    .from("profiles")
    .select("id")
    .ilike("username", identifier)
    .maybeSingle();

  // Si la columna username aún no existe (migración 015 sin aplicar), error
  // y se responde como credencial inválida en vez de reventar.
  if (error || !profile) return null;

  const { data: userRes } = await admin.auth.admin.getUserById(profile.id);
  return userRes?.user?.email ?? null;
}

export async function POST(request: Request) {
  const parsed = loginSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: INVALID }, { status: 400 });
  }

  const email = await resolveEmail(parsed.data.username.trim());
  if (!email) return NextResponse.json({ error: INVALID }, { status: 401 });

  // signInWithPassword desde el cliente de servidor deja las cookies de sesión
  // puestas en la respuesta, igual que hacía el login por email.
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email,
    password: parsed.data.password,
  });

  if (error) return NextResponse.json({ error: INVALID }, { status: 401 });

  return NextResponse.json({ ok: true });
}
