"use client";

import { createContext, useContext } from "react";
import { DEFAULT_ROLE, isOwner, type Role } from "@/lib/permissions";
import { memberBySlug, type TeamMember, type TeamSlug } from "@/lib/team";
import type { Directory } from "@/lib/directory";

interface SessionValue {
  /** Rol con el que se renderiza la app — el prestado si el Dueño está "viendo como" */
  role: Role;
  /** El slug del equipo con el que se renderiza (samuel, camilo, …) */
  slug: TeamSlug | null;
  /** owner_id → slug, para pintar quién hizo cada cosa */
  directory: Directory;
  /** A quién está viendo el Dueño, o null si está en su propia vista */
  viewingAs: TeamSlug | null;
  /** El rol de verdad de quien está firmado — el que decide si puede "ver como" */
  realRole: Role;
}

const SessionContext = createContext<SessionValue>({
  role: DEFAULT_ROLE,
  slug: null,
  directory: {},
  viewingAs: null,
  realRole: DEFAULT_ROLE,
});

/**
 * Quién está usando la plataforma, puesto por el layout para que cualquier
 * componente cliente sepa qué esconder y de quién es cada registro.
 *
 * Es solo para la interfaz: lo que de verdad bloquea son los guards de
 * servidor (src/lib/auth/session.ts) y las políticas RLS.
 */
export function SessionProvider({
  value,
  children,
}: {
  value: SessionValue;
  children: React.ReactNode;
}) {
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionValue {
  return useContext(SessionContext);
}

export function useRole(): Role {
  return useContext(SessionContext).role;
}

export function useIsOwner(): boolean {
  return isOwner(useContext(SessionContext).role);
}

/**
 * A quién está viendo el Dueño con la vista prestada (src/lib/view-as.ts),
 * o null si cada quien está en la suya.
 */
export function useViewingAs(): TeamSlug | null {
  return useContext(SessionContext).viewingAs;
}

/**
 * ¿Quien está firmado es el Dueño de verdad? Es lo que decide quién puede
 * entrar y salir de la vista de otra persona — `useIsOwner` responde por el
 * rol prestado, que mientras tanto es el del Socio Estratégico.
 */
export function useIsRealOwner(): boolean {
  return isOwner(useContext(SessionContext).realRole);
}

/** Slug de quien está firmado — null si su email no está en el equipo. */
export function useMySlug(): TeamSlug | null {
  return useContext(SessionContext).slug;
}

/** El miembro del equipo dueño de un registro, a partir de su owner_id. */
export function useMemberById(ownerId: string | null | undefined): TeamMember | undefined {
  const { directory } = useContext(SessionContext);
  if (!ownerId) return undefined;
  return memberBySlug(directory[ownerId]);
}
