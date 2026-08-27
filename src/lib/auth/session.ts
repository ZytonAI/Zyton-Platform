import { createClient } from "@/lib/supabase/server";
import { memberByEmail, memberBySlug, roleForEmail, type TeamMember, type TeamSlug } from "@/lib/team";
import { DEFAULT_ROLE, isOwner, type Role } from "@/lib/permissions";
import { VIEW_AS_COOKIE } from "@/lib/view-as";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export interface Session {
  user: User | null;
  /** Rol con el que se renderiza la app — el prestado si está "viendo como" */
  role: Role;
  /** El miembro del equipo con el que se renderiza la app */
  member: TeamMember | undefined;
  /** El rol de verdad de quien está firmado, sin la vista prestada */
  realRole: Role;
  /** El miembro de verdad de quien está firmado */
  realMember: TeamMember | undefined;
  /** A quién está viendo el Dueño, o null si está en su propia vista */
  viewingAs: TeamSlug | null;
}

/**
 * Sesión + rol para código de servidor (páginas y API routes).
 *
 * El rol se deriva del email con src/lib/team.ts — sin ir a la base, así no
 * cuesta un round-trip por request. La base guarda el mismo dato en
 * profiles.role, que es lo que usan las políticas RLS (migración 017).
 *
 * Si el Dueño está "viendo como" alguien (src/lib/view-as.ts), `role` y
 * `member` son los de esa persona y `realRole` / `realMember` los suyos.
 * La sesión de Supabase no cambia: RLS y `owner_id` siguen siendo los del
 * Dueño, así que lo personal del otro no queda expuesto.
 */
export async function getSession(): Promise<Session> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const realRole = user ? roleForEmail(user.email) : DEFAULT_ROLE;
  const realMember = memberByEmail(user?.email);

  // Solo el Dueño de verdad puede pedir prestada otra vista: una cookie
  // puesta a mano por alguien más no hace nada.
  let target: TeamMember | undefined;
  if (user && isOwner(realRole)) {
    const slug = (await cookies()).get(VIEW_AS_COOKIE)?.value;
    const candidato = memberBySlug(slug);
    if (candidato && candidato.slug !== realMember?.slug) target = candidato;
  }

  return {
    user,
    role: target?.role ?? realRole,
    member: target ?? realMember,
    realRole,
    realMember,
    viewingAs: target?.slug ?? null,
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
