"use client";

import { Menu } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useSidebar } from "./SidebarContext";
import { ThemeToggle } from "./ThemeToggle";
import { memberByEmail, memberBySlug } from "@/lib/team";
import { useRole, useViewingAs } from "./SessionContext";
import { ROLE_LABELS } from "@/lib/permissions";

interface TopBarProps {
  title: string;
  userEmail?: string;
}

export function TopBar({ title, userEmail }: TopBarProps) {
  // Se entra con usuario, no con correo: mostrar el usuario del equipo
  // (SamuelZY, CamiloZY, …) y caer al email solo si no está en la lista.
  //
  // Con la vista prestada se muestra la identidad de la otra persona, que es
  // justo lo que se quiere ver; la franja amarilla de arriba aclara de quién
  // es la sesión de verdad.
  const viewingAs = useViewingAs();
  const member = memberBySlug(viewingAs) ?? memberByEmail(userEmail);
  const label = member?.username ?? userEmail;
  const initials = (member?.name ?? userEmail ?? "U")[0].toUpperCase();
  const { toggle } = useSidebar();
  const role = useRole();

  return (
    <header className="h-16 bg-card/80 backdrop-blur-sm border-b flex items-center justify-between px-4 sm:px-7 shrink-0 shadow-[0_1px_8px_rgba(0,0,0,0.06)]">
      <div className="flex items-center gap-3">
        <button
          onClick={toggle}
          className="md:hidden p-1.5 -ml-1 rounded-lg text-muted-foreground hover:bg-muted transition-colors"
          aria-label="Abrir menú"
        >
          <Menu className="w-5 h-5" />
        </button>
        <h1 className="text-[15px] font-semibold text-foreground tracking-tight">{title}</h1>
      </div>
      <div className="flex items-center gap-2">
        <ThemeToggle />
        {label && (
          <div className="hidden sm:flex flex-col items-end leading-tight">
            <span className="text-xs text-muted-foreground font-medium tracking-tight">
              {label}
            </span>
            <span className="text-[10px] text-muted-foreground/70 font-medium tracking-tight">
              {ROLE_LABELS[role]}
            </span>
          </div>
        )}
        <Avatar className="w-8 h-8 ring-2 ring-primary/20">
          <AvatarFallback className={`bg-gradient-to-br ${member?.avatar ?? "from-blue-500 to-blue-700"} text-white text-xs font-bold`}>
            {initials}
          </AvatarFallback>
        </Avatar>
      </div>
    </header>
  );
}
