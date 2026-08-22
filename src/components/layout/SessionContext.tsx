"use client";

import { createContext, useContext } from "react";
import { DEFAULT_ROLE, isOwner, type Role } from "@/lib/permissions";
import { memberBySlug, type TeamMember, type TeamSlug } from "@/lib/team";
import type { Directory } from "@/lib/directory";

interface SessionValue {
  /** Rol de quien está firmado */
  role: Role;
  /** Su slug del equipo (samuel, camilo, …) */
  slug: TeamSlug | null;
  /** owner_id → slug, para pintar quién hizo cada cosa */
  directory: Directory;
}

const SessionContext = createContext<SessionValue>({
  role: DEFAULT_ROLE,
  slug: null,
  directory: {},
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
