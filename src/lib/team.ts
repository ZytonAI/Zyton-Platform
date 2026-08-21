/**
 * El equipo de ZytonAI. Es la fuente única de verdad para el tablero To Do,
 * los avatares y cualquier vista que agrupe trabajo por persona.
 *
 * Al agregar o quitar a alguien: actualizar también el CHECK de `assignee`
 * en supabase/migrations/014_tasks.sql y la lista TEAM de scripts/create-users.mjs.
 */
export const TEAM_MEMBERS = [
  {
    slug: "samuel",
    name: "Samuel",
    email: "zyton.automation@gmail.com",
    initials: "S",
    // Clases Tailwind del acento de su columna en el tablero
    dot: "bg-blue-500",
    header: "bg-blue-50 border-blue-200",
    avatar: "from-blue-500 to-blue-700",
  },
  {
    slug: "camilo",
    name: "Camilo",
    email: "camilo@zytonai.com",
    initials: "C",
    dot: "bg-violet-500",
    header: "bg-violet-50 border-violet-200",
    avatar: "from-violet-500 to-violet-700",
  },
  {
    slug: "santiago",
    name: "Santiago",
    email: "santiago@zytonai.com",
    initials: "S",
    dot: "bg-emerald-500",
    header: "bg-emerald-50 border-emerald-200",
    avatar: "from-emerald-500 to-emerald-700",
  },
  {
    slug: "daniel",
    name: "Daniel",
    email: "daniel@zytonai.com",
    initials: "D",
    dot: "bg-amber-500",
    header: "bg-amber-50 border-amber-200",
    avatar: "from-amber-500 to-amber-700",
  },
] as const;

export type TeamMember = (typeof TEAM_MEMBERS)[number];
export type TeamSlug = TeamMember["slug"];

export const TEAM_SLUGS = TEAM_MEMBERS.map((m) => m.slug) as unknown as [TeamSlug, ...TeamSlug[]];

export function memberBySlug(slug: string): TeamMember | undefined {
  return TEAM_MEMBERS.find((m) => m.slug === slug);
}

export function memberByEmail(email?: string | null): TeamMember | undefined {
  if (!email) return undefined;
  return TEAM_MEMBERS.find((m) => m.email.toLowerCase() === email.toLowerCase());
}
