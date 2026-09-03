import { isOwner, type Role } from "@/lib/permissions";
import type { TeamMember, TeamSlug } from "@/lib/team";
import type { MemberTag } from "@/types";

/**
 * Con quién está hablando Diana, y qué le toca ver.
 *
 * Diana corre con el service client (se salta RLS), así que todo lo que la
 * base haría sola hay que hacerlo aquí a mano. Son dos filtros distintos y
 * conviene no confundirlos:
 *
 *   • el ROL   — qué temas existen para esta persona (los cobros son del
 *                Dueño; ver src/lib/permissions.ts).
 *   • la PERSONA — de todo lo que sí puede ver, qué es suyo: los leads que
 *                contactó, los clientes que cerró, sus chats.
 *
 * El workspace es compartido — en /leads los cuatro ven lo mismo — pero
 * Diana es asistente personal, no un tablero: por defecto responde sobre lo
 * de quien pregunta. Si le piden el consolidado del equipo explícitamente,
 * lo trae (alcance "equipo"). El Dueño ve todo por defecto.
 *
 * Escribir es más estricto que leer: un Socio solo cambia lo suyo o lo que
 * no tiene dueño, aunque pueda mirar lo del resto.
 */
export interface DianaActor {
  /** UUID de Supabase Auth — con esto se guarda el historial y lo que crea */
  ownerId: string;
  /** Slug del equipo, o null si quien escribe no está en src/lib/team.ts */
  slug: TeamSlug | null;
  /** Para que Diana lo llame por su nombre */
  nombre: string;
  role: Role;
}

/** Qué tanto abarca una consulta de lectura. */
export type Alcance = "mios" | "equipo";

export function actorDesde(
  ownerId: string,
  member: TeamMember | undefined,
  role: Role
): DianaActor {
  return {
    ownerId,
    slug: member?.slug ?? null,
    nombre: member?.name ?? "el equipo",
    role,
  };
}

/**
 * ¿Esta lectura trae todo el workspace?
 *
 * El Dueño siempre; un Socio solo cuando pide el consolidado del equipo.
 */
export function leeTodo(actor: DianaActor, alcance: Alcance | undefined): boolean {
  return isOwner(actor.role) || alcance === "equipo";
}

/**
 * Filtro `or()` de PostgREST para "lo de esta persona".
 *
 * Lo que no tiene dueño entra: un lead sin etiquetar todavía no es de nadie,
 * igual que un chat sin asignar lo ven los cuatro (ver conversation-scope.ts).
 * Si la persona no está en la lista del equipo no hay slug con qué comparar,
 * y entonces solo ve lo que no es de nadie — el lado seguro.
 */
export function filtroMio(columna: string, slug: TeamSlug | null): string {
  return slug
    ? `${columna}.eq.${slug},${columna}.is.null`
    : `${columna}.is.null`;
}

/**
 * ¿Puede modificar un registro con esta etiqueta? El Dueño sí siempre; un
 * Socio solo lo suyo o lo que no tiene dueño.
 */
export function puedeTocar(actor: DianaActor, etiqueta: MemberTag): boolean {
  if (isOwner(actor.role)) return true;
  return etiqueta === null || etiqueta === actor.slug;
}

/**
 * ¿Puede tocar este evento del calendario?
 *
 * Mismo criterio que la RLS de calendar_events (migración 018): los del
 * equipo son de todos, los personales solo de quien los creó.
 */
export function puedeTocarEvento(
  actor: DianaActor,
  evento: { owner_id?: string | null; visibility?: string | null }
): boolean {
  if (evento.owner_id === actor.ownerId) return true;
  // Sin la migración 018 no había eventos personales: todos eran del equipo.
  return (evento.visibility ?? "team") === "team";
}
