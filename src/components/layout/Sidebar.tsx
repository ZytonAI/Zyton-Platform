"use client";

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
} from "lucide-react";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";

const navItems = [
  { href: "/dashboard", label: "Dashboard",  icon: LayoutDashboard },
  { href: "/leads",     label: "Leads",       icon: Users },
  { href: "/clients",   label: "Clientes",    icon: Briefcase },
  { href: "/chat",      label: "Chat",        icon: MessageCircle },
  { href: "/agents",    label: "Agentes",     icon: Bot },
  { href: "/invoices",  label: "Facturas",    icon: Receipt },
  { href: "/events",    label: "Calendario",  icon: CalendarDays },
];

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <aside className="flex flex-col w-64 min-h-screen bg-sidebar text-sidebar-foreground border-r border-sidebar-border shadow-[4px_0_24px_rgba(0,0,0,0.18)]">

      {/* Brand */}
      <div className="px-5 py-6 border-b border-sidebar-border">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500/30 to-blue-700/20 ring-1 ring-white/10 shadow-inner shrink-0">
            <svg viewBox="0 0 50 26" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-7 h-7">
              <path d="M14 1L3 15h10l-2 10L24 11H14L17 1H14Z" fill="url(#bolt1)" />
              <path d="M36 1L25 15h10l-2 10L46 11H36L39 1H36Z" fill="url(#bolt2)" />
              <defs>
                <linearGradient id="bolt1" x1="14" y1="1" x2="14" y2="25" gradientUnits="userSpaceOnUse">
                  <stop stopColor="#93C5FD"/>
                  <stop offset="1" stopColor="#3B82F6"/>
                </linearGradient>
                <linearGradient id="bolt2" x1="36" y1="1" x2="36" y2="25" gradientUnits="userSpaceOnUse">
                  <stop stopColor="#93C5FD"/>
                  <stop offset="1" stopColor="#3B82F6"/>
                </linearGradient>
              </defs>
            </svg>
          </div>
          <div>
            <p className="font-bold text-sm text-white tracking-tight leading-none">Zyton Platform</p>
            <p className="text-[11px] text-white/40 mt-0.5 font-medium tracking-widest uppercase">ZytonAI</p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-5 space-y-0.5">
        {navItems.map(({ href, label, icon: Icon }) => {
          const isActive = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <Link
              key={href}
              href={href}
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
      <div className="px-3 py-4 border-t border-sidebar-border">
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-white/40 hover:text-white/80 hover:bg-white/[0.07] transition-all duration-150"
        >
          <LogOut className="w-[18px] h-[18px] shrink-0" />
          <span className="tracking-tight">Cerrar sesión</span>
        </button>
      </div>
    </aside>
  );
}
