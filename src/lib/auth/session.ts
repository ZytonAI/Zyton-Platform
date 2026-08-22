import { createClient } from "@/lib/supabase/server";
import { memberByEmail, roleForEmail, type TeamMember } from "@/lib/team";
import { DEFAULT_ROLE, isOwner, type Role } from "@/lib/permissions";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

/**
 * Sesión + rol para código de servidor (páginas y API routes).
 *
 * El rol se deriva del email con src/lib/team.ts — sin ir a la base, así no
 * cuesta un round-trip por request. La base guarda el mismo dato en
 * profiles.role, que es lo que usan las políticas RLS (migración 017).
 */
export async function getSession(): Promise<{
  user: User | null;
  role: Role;
  /** El miembro del equipo, si el email está en src/lib/team.ts */
  member: TeamMember | undefined;
}> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return {
    user,
    role: user ? roleForEmail(user.email) : DEFAULT_ROLE,
    member: memberByEmail(user?.email),
  };
}

/**
 * Guard para las API routes que solo puede tocar el Dueño (facturas/cobros).
 * Devuelve la respuesta de error, o null si puede seguir.
 */
export async function denyIfNotOwner(): Promise<NextResponse | null> {
  const { user, role } = await getSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isOwner(role)) {
    return NextResponse.json(
      { error: "Solo el Dueño puede ver o editar los cobros." },
      { status: 403 }
    );
  }
  return null;
}

/**
 * Rol a partir del id de usuario, para código que corre sin cookies de sesión
 * (webhook de Telegram, crons). Necesita un cliente con service role.
 */
export async function roleForUserId(db: SupabaseClient, userId: string): Promise<Role> {
  try {
    const { data } = await db.auth.admin.getUserById(userId);
    return roleForEmail(data?.user?.email);
  } catch {
    return DEFAULT_ROLE;
  }
}
