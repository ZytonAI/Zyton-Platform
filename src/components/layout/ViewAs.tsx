"use client";

import { useState } from "react";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { TEAM_MEMBERS, memberBySlug, type TeamSlug } from "@/lib/team";
import { ROLE_LABELS } from "@/lib/permissions";
import { useIsRealOwner, useViewingAs } from "./SessionContext";
import { cn } from "@/lib/utils";

/**
 * Pedir (o devolver) la vista de otra persona. Recarga entera a propósito:
 * casi todo lo que cambia se pinta en el servidor, así no queda nada del
 * render anterior mezclado con el nuevo.
 */
async function cambiarVista(slug: TeamSlug | null): Promise<boolean> {
  const res = await fetch("/api/view-as", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ slug }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    toast.error(typeof err.error === "string" ? err.error : "No se pudo cambiar la vista");
    return false;
  }
  window.location.href = "/dashboard";
  return true;
}

/**
 * Selector del pie del menú lateral — solo para el Dueño de verdad.
 * Mientras la vista está prestada `useIsOwner` dice que no, así que esto
 * mira el rol real.
 */
export function ViewAsControl({ collapsed = false }: { collapsed?: boolean }) {
  const esDueno = useIsRealOwner();
  const viendoA = useViewingAs();
  const [cambiando, setCambiando] = useState(false);

  if (!esDueno) return null;

  const viendo = memberBySlug(viendoA);

  async function elegir(slug: TeamSlug | null) {
    setCambiando(true);
    const ok = await cambiarVista(slug);
    if (!ok) setCambiando(false);
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        disabled={cambiando}
        title={viendo ? `Viendo como ${viendo.name}` : "Ver la plataforma como otra persona"}
        className={cn(
          "w-full flex items-center py-2.5 rounded-xl text-sm font-medium transition-all duration-150 outline-none",
          viendo
            ? "text-amber-300/90 hover:bg-white/[0.07]"
            : "text-white/40 hover:text-white/80 hover:bg-white/[0.07]",
          collapsed ? "justify-center px-0" : "gap-3 px-3"
        )}
      >
        {cambiando
          ? <Loader2 className="w-[18px] h-[18px] shrink-0 animate-spin" />
          : <Eye className="w-[18px] h-[18px] shrink-0" />}
        {!collapsed && (
          <span className="tracking-tight truncate">
            {viendo ? `Viendo: ${viendo.name}` : "Ver como"}
          </span>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" side="right" className="w-60">
        {/* El label es parte del grupo: Base UI lo exige (si no, error #31) */}
        <DropdownMenuGroup>
          <DropdownMenuLabel>Ver la plataforma como</DropdownMenuLabel>
          {TEAM_MEMBERS.filter((m) => m.role !== "owner").map((m) => (
            <DropdownMenuItem
              key={m.slug}
              disabled={cambiando || m.slug === viendoA}
              onClick={() => elegir(m.slug)}
            >
              <span className={cn("w-2 h-2 rounded-full mr-2 shrink-0", m.dot)} />
              <span className="flex-1 truncate">{m.name}</span>
              <span className="text-[10px] text-muted-foreground">{ROLE_LABELS[m.role]}</span>
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
        {viendo && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem disabled={cambiando} onClick={() => elegir(null)}>
              <EyeOff className="w-4 h-4 mr-2" /> Volver a mi vista
            </DropdownMenuItem>
          </>
        )}
        <DropdownMenuSeparator />
        <p className="px-1.5 py-1 text-[11px] leading-snug text-muted-foreground">
          Solo cambia lo que se muestra: no entras a su cuenta ni ves sus cosas personales.
        </p>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * Franja que deja claro que lo que se está viendo no es lo propio. Va arriba
 * del contenido, en todas las páginas: sin esto es fácil olvidarse y escribir
 * algo que queda a nombre de otra persona.
 */
export function ViewAsBanner() {
  const viendoA = useViewingAs();
  const [saliendo, setSaliendo] = useState(false);
  const viendo = memberBySlug(viendoA);

  if (!viendo) return null;

  async function salir() {
    setSaliendo(true);
    const ok = await cambiarVista(null);
    if (!ok) setSaliendo(false);
  }

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 sm:px-7 py-2 bg-amber-100 dark:bg-amber-500/15 border-b border-amber-300/70 dark:border-amber-500/30 text-amber-900 dark:text-amber-200 shrink-0">
      <Eye className="w-4 h-4 shrink-0" />
      <p className="text-xs font-medium">
        Estás viendo la plataforma como{" "}
        <span className="font-bold">{viendo.name}</span>{" "}
        <span className="font-normal opacity-80">({ROLE_LABELS[viendo.role]})</span>.
        Lo que crees o edites queda a su nombre.
      </p>
      <button
        onClick={salir}
        disabled={saliendo}
        className="ml-auto inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-amber-900/10 dark:bg-amber-200/10 hover:bg-amber-900/20 dark:hover:bg-amber-200/20 transition-colors disabled:opacity-60"
      >
        {saliendo ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <EyeOff className="w-3.5 h-3.5" />}
        Volver a mi vista
      </button>
    </div>
  );
}
