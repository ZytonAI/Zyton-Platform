/**
 * Roles de la plataforma.
 *
 *   owner   — Dueño (Samuel). Ve y edita absolutamente todo.
 *   partner — Socio Estratégico (Camilo, Santiago, Daniel). Ve todo el
 *             workspace menos el dinero que entra: la sección Facturas
 *             (cobros y pagos) y el cobro configurado de cada cliente.
 *
 * El rol de cada persona vive en src/lib/team.ts y se refleja en la base
 * (profiles.role, migración 017) para que las políticas RLS lo apliquen
 * también fuera de la app.
 */
export type Role = "owner" | "partner";

export const ROLE_LABELS: Record<Role, string> = {
  owner: "Dueño",
  partner: "Socio Estratégico",
};

/** Rol por defecto de alguien que no está en la lista del equipo. */
export const DEFAULT_ROLE: Role = "partner";

/** Rutas que solo puede abrir el Dueño. */
export const OWNER_ONLY_PATHS = ["/invoices"] as const;

export function isOwner(role: Role): boolean {
  return role === "owner";
}

/** ¿Este rol puede abrir esta ruta? Cubre también las subrutas (/invoices/x). */
export function canAccessPath(role: Role, path: string): boolean {
  if (isOwner(role)) return true;
  return !OWNER_ONLY_PATHS.some((p) => path === p || path.startsWith(`${p}/`));
}

/**
 * ¿Puede ver/configurar cobros? Cubre la sección Facturas, el bloque
 * "Cobro al cliente" y las tarjetas de dinero del Dashboard.
 */
export function canManageBilling(role: Role): boolean {
  return isOwner(role);
}
