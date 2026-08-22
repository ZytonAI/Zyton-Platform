/**
 * El equipo de ZytonAI. Es la fuente única de verdad para el tablero To Do,
 * los avatares y cualquier vista que agrupe trabajo por persona.
 *
 * Al agregar o quitar a alguien: actualizar también el CHECK de `assignee`
 * en supabase/migrations/014_tasks.sql, la lista TEAM de scripts/create-users.mjs
 * y los usuarios de supabase/migrations/015_usernames.sql.
 *
 * `username` es con lo que se entra al login; `email` es lo que Supabase Auth
 * guarda por debajo (nunca se escribe en la pantalla de login).
 *
 * `role` decide qué ve cada quien (ver src/lib/permissions.ts). Al cambiarlo
 * hay que reflejarlo en profiles.role — migración 017_roles.sql.
 */
import { DEFAULT_ROLE, type Role } from "@/lib/permissions";

export const TEAM_MEMBERS = [
  {
    slug: "samuel",
    username: "SamuelZY",
    name: "Samuel",
    email: "zyton.automation@gmail.com",
    role: "owner" as Role,
    initials: "S",
    // Clases Tailwind del acento de su columna en el tablero
    dot: "bg-blue-500",
    header: "bg-blue-50 border-blue-200",
    avatar: "from-blue-500 to-blue-700",
  },
  {
    slug: "camilo",
    username: "CamiloZY",
    name: "Camilo",
    email: "camilo@zytonai.com",
    role: "partner" as Role,
    initials: "C",
    dot: "bg-violet-500",
    header: "bg-violet-50 border-violet-200",
    avatar: "from-violet-500 to-violet-700",
  },
  {
    slug: "santiago",
    username: "SantiagoZY",
    name: "Santiago",
    email: "santiago@zytonai.com",
    role: "partner" as Role,
    initials: "S",
    dot: "bg-emerald-500",
    header: "bg-emerald-50 border-emerald-200",
    avatar: "from-emerald-500 to-emerald-700",
  },
  {
    slug: "daniel",
    username: "DanielZY",
    name: "Daniel",
    email: "daniel@zytonai.com",
    role: "partner" as Role,
    initials: "D",
    dot: "bg-amber-500",
    header: "bg-amber-50 border-amber-200",
    avatar: "from-amber-500 to-amber-700",
  },
] as const;

export type TeamMember = (typeof TEAM_MEMBERS)[number];
export type TeamSlug = TeamMember["slug"];

export const TEAM_SLUGS = TEAM_MEMBERS.map((m) => m.slug) as unknown as [TeamSlug, ...TeamSlug[]];

export function memberBySlug(slug: string | null | undefined): TeamMember | undefined {
  if (!slug) return undefined;
  return TEAM_MEMBERS.find((m) => m.slug === slug);
}

export function memberByEmail(email?: string | null): TeamMember | undefined {
  if (!email) return undefined;
  return TEAM_MEMBERS.find((m) => m.email.toLowerCase() === email.toLowerCase());
}

export function memberByUsername(username?: string | null): TeamMember | undefined {
  if (!username) return undefined;
  return TEAM_MEMBERS.find((m) => m.username.toLowerCase() === username.toLowerCase());
}

/**
 * Rol de una persona a partir de su email de Supabase Auth. Quien no esté en
 * la lista del equipo entra como Socio Estratégico (el rol más restringido),
 * nunca como Dueño.
 */
export function roleForEmail(email?: string | null): Role {
  return memberByEmail(email)?.role ?? DEFAULT_ROLE;
}
