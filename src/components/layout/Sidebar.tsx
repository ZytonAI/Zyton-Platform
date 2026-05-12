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
} from "lucide-react";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { useSidebar } from "./SidebarContext";
import { Sheet, SheetContent } from "@/components/ui/sheet";

const navItems = [
  { href: "/dashboard", label: "Dashboard",  icon: LayoutDashboard },
  { href: "/leads",     label: "Leads",       icon: Users },
  { href: "/clients",   label: "Clientes",    icon: Briefcase },
  { href: "/wiki",      label: "Wiki",         icon: BookOpen },
  { href: "/chat",      label: "Chat",        icon: MessageCircle },
  { href: "/agents",    label: "Agentes",     icon: Bot },
  { href: "/invoices",  label: "Facturas",    icon: Receipt },
  { href: "/events",    label: "Calendario",  icon: CalendarDays },
];

function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const router = useRouter();

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <>
      {/* Brand */}
      <div className="px-5 py-6 border-b border-sidebar-border shrink-0">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-11 h-11 rounded-xl bg-white/10 ring-1 ring-white/10 shrink-0 overflow-hidden">
            <Image src="/logo.png" alt="Zyton logo" width={36} height={36} className="object-contain" />
          </div>
          <div>
            <p className="font-bold text-sm text-white tracking-tight leading-none">Zyton Platform</p>
            <p className="text-[11px] text-white/40 mt-0.5 font-medium tracking-widest uppercase">ZytonAI</p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-5 space-y-0.5 overflow-y-auto">
        {navItems.map(({ href, label, icon: Icon }) => {
          const isActive = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <Link
              key={href}
              href={href}
              onClick={onNavigate}
              className={cn(
                "relative flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150",
                isActive
                  ? "bg-white/[0.12] text-white shadow-sm"
                  : "text-white/55 hover:bg-white/[0.07] hover:text-white/90"
              )}
            >
              {isActive && (
                <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 bg-blue-400 rounded-full" />
              )}
              <Icon className={cn("w-[18px] h-[18px] shrink-0 transition-colors", isActive ? "text-blue-300" : "")} />
              <span className="tracking-tight">{label}</span>
            </Link>
          );
        })}
      </nav>

      {/* Logout */}
      <div className="px-3 py-4 border-t border-sidebar-border shrink-0">
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-white/40 hover:text-white/80 hover:bg-white/[0.07] transition-all duration-150"
        >
          <LogOut className="w-[18px] h-[18px] shrink-0" />
          <span className="tracking-tight">Cerrar sesión</span>
        </button>
      </div>
    </>
  );
}

export function Sidebar() {
  const { open, close } = useSidebar();

  return (
    <>
      {/* Desktop: siempre visible, en el flujo del layout */}
      <aside className="hidden md:flex flex-col w-64 shrink-0 min-h-screen bg-sidebar text-sidebar-foreground border-r border-sidebar-border shadow-[4px_0_24px_rgba(0,0,0,0.18)]">
        <SidebarNav />
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
