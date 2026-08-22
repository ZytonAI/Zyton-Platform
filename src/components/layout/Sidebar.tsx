"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  Users,
  Briefcase,
  MessageCircle,
  Bot,
  LogOut,
  Receipt,
  CalendarDays,
  BookOpen,
  ListTodo,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { useSidebar } from "./SidebarContext";
import { useRole } from "./SessionContext";
import { canAccessPath } from "@/lib/permissions";
import { Sheet, SheetContent } from "@/components/ui/sheet";

const navItems = [
  { href: "/dashboard", label: "Dashboard",  icon: LayoutDashboard },
  { href: "/todo",      label: "To Do",       icon: ListTodo },
  { href: "/leads",     label: "Leads",       icon: Users },
  { href: "/clients",   label: "Clientes",    icon: Briefcase },
  { href: "/wiki",      label: "Wiki",         icon: BookOpen },
  { href: "/chat",      label: "Chat",        icon: MessageCircle },
  { href: "/agents",    label: "Agentes",     icon: Bot },
  { href: "/invoices",  label: "Facturas",    icon: Receipt },
  { href: "/events",    label: "Calendario",  icon: CalendarDays },
];

function SidebarNav({
  onNavigate,
  collapsed = false,
  onToggleCollapsed,
}: {
  onNavigate?: () => void;
  /** Solo iconos, para ocupar menos ancho (escritorio) */
  collapsed?: boolean;
  onToggleCollapsed?: () => void;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const role = useRole();

  // Los Socios Estratégicos no ven Facturas (cobros) — ver src/lib/permissions.ts
  const visibleItems = navItems.filter((item) => canAccessPath(role, item.href));

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <>
      {/* Brand */}
      <div className={cn("py-6 border-b border-sidebar-border shrink-0", collapsed ? "px-2" : "px-5")}>
        <div className={cn("flex items-center gap-3", collapsed && "justify-center")}>
          <div className="flex items-center justify-center w-11 h-11 rounded-xl bg-white/10 ring-1 ring-white/10 shrink-0 overflow-hidden">
            <Image src="/logo.png" alt="Zyton logo" width={36} height={36} className="object-contain" />
          </div>
          {!collapsed && (
            <div>
              <p className="font-bold text-sm text-white tracking-tight leading-none">Zyton Platform</p>
              <p className="text-[11px] text-white/40 mt-0.5 font-medium tracking-widest uppercase">ZytonAI</p>
            </div>
          )}
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-5 space-y-0.5 overflow-y-auto">
        {visibleItems.map(({ href, label, icon: Icon }) => {
          const isActive = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <Link
              key={href}
              href={href}
              onClick={onNavigate}
              // Reducida no hay texto: el nombre queda en el tooltip del sistema
              title={collapsed ? label : undefined}
              className={cn(
                "relative flex items-center py-2.5 rounded-xl text-sm font-medium transition-all duration-150",
                collapsed ? "justify-center px-0" : "gap-3 px-3",
                isActive
                  ? "bg-white/[0.12] text-white shadow-sm"
                  : "text-white/55 hover:bg-white/[0.07] hover:text-white/90"
              )}
            >
              {isActive && (
                <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 bg-blue-400 rounded-full" />
              )}
              <Icon className={cn("w-[18px] h-[18px] shrink-0 transition-colors", isActive ? "text-blue-300" : "")} />
              {!collapsed && <span className="tracking-tight">{label}</span>}
            </Link>
          );
        })}
      </nav>

      {/* Pie: reducir la barra y cerrar sesión */}
      <div className="px-3 py-4 border-t border-sidebar-border shrink-0 space-y-0.5">
        {onToggleCollapsed && (
          <button
            onClick={onToggleCollapsed}
            title={collapsed ? "Expandir el menú" : "Reducir el menú a iconos"}
            aria-label={collapsed ? "Expandir el menú" : "Reducir el menú a iconos"}
            className={cn(
              "w-full flex items-center py-2.5 rounded-xl text-sm font-medium text-white/40 hover:text-white/80 hover:bg-white/[0.07] transition-all duration-150",
              collapsed ? "justify-center px-0" : "gap-3 px-3"
            )}
          >
            {collapsed
              ? <PanelLeftOpen className="w-[18px] h-[18px] shrink-0" />
              : <PanelLeftClose className="w-[18px] h-[18px] shrink-0" />}
            {!collapsed && <span className="tracking-tight">Reducir menú</span>}
          </button>
        )}

        <button
          onClick={handleLogout}
          title={collapsed ? "Cerrar sesión" : undefined}
          className={cn(
            "w-full flex items-center py-2.5 rounded-xl text-sm font-medium text-white/40 hover:text-white/80 hover:bg-white/[0.07] transition-all duration-150",
            collapsed ? "justify-center px-0" : "gap-3 px-3"
          )}
        >
          <LogOut className="w-[18px] h-[18px] shrink-0" />
          {!collapsed && <span className="tracking-tight">Cerrar sesión</span>}
        </button>
      </div>
    </>
  );
}

export function Sidebar() {
  const { open, close, collapsed, toggleCollapsed } = useSidebar();

  return (
    <>
      {/* Desktop: siempre visible, en el flujo del layout. Reducida deja solo
          los iconos para devolverle ancho al contenido. */}
      <aside
        className={cn(
          "hidden md:flex flex-col shrink-0 min-h-screen bg-sidebar text-sidebar-foreground border-r border-sidebar-border shadow-[4px_0_24px_rgba(0,0,0,0.18)]",
          "transition-[width] duration-200 ease-out",
          collapsed ? "w-[68px]" : "w-64"
        )}
      >
        <SidebarNav collapsed={collapsed} onToggleCollapsed={toggleCollapsed} />
      </aside>

      {/* Mobile: Sheet drawer desde la izquierda */}
      <Sheet open={open} onOpenChange={(o) => !o && close()}>
        <SheetContent
          side="left"
          showCloseButton={false}
          className="w-64 p-0 gap-0 flex flex-col bg-sidebar text-sidebar-foreground border-r border-sidebar-border"
        >
          <SidebarNav onNavigate={close} />
        </SheetContent>
      </Sheet>
    </>
  );
}
