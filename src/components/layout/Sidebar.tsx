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
import { Button } from "@/components/ui/button";

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
    <aside className="flex flex-col w-64 min-h-screen bg-sidebar text-sidebar-foreground border-r border-sidebar-border">
      {/* Brand */}
      <div className="flex items-center gap-3 px-5 py-5 border-b border-sidebar-border">
        <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-white/10 shrink-0">
          <svg viewBox="0 0 50 26" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-7 h-7">
            <path d="M14 1L3 15h10l-2 10L24 11H14L17 1H14Z" fill="#3B8BF5"/>
            <path d="M14 1L3 15h10l-2 10L24 11H14L17 1H14Z" fill="url(#bolt1)" />
            <path d="M36 1L25 15h10l-2 10L46 11H36L39 1H36Z" fill="#3B8BF5"/>
            <path d="M36 1L25 15h10l-2 10L46 11H36L39 1H36Z" fill="url(#bolt2)" />
            <defs>
              <linearGradient id="bolt1" x1="14" y1="1" x2="14" y2="25" gradientUnits="userSpaceOnUse">
                <stop stopColor="#60AAFF"/>
                <stop offset="1" stopColor="#1A6BF5"/>
              </linearGradient>
              <linearGradient id="bolt2" x1="36" y1="1" x2="36" y2="25" gradientUnits="userSpaceOnUse">
                <stop stopColor="#60AAFF"/>
                <stop offset="1" stopColor="#1A6BF5"/>
              </linearGradient>
            </defs>
          </svg>
        </div>
        <div>
          <p className="font-bold text-sm text-white leading-tight">Zyton Platform</p>
          <p className="text-xs text-sidebar-foreground/60">ZytonAI</p>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-1">
        {navItems.map(({ href, label, icon: Icon }) => {
          const isActive = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                isActive
                  ? "bg-sidebar-accent text-white"
                  : "text-sidebar-foreground/80 hover:bg-sidebar-accent/60 hover:text-white"
              )}
            >
              <Icon className="w-5 h-5 shrink-0" />
              {label}
            </Link>
          );
        })}
      </nav>

      {/* Logout */}
      <div className="px-3 py-4 border-t border-sidebar-border">
        <Button
          variant="ghost"
          onClick={handleLogout}
          className="w-full justify-start gap-3 text-sidebar-foreground/80 hover:text-white hover:bg-sidebar-accent/60 px-3"
        >
          <LogOut className="w-5 h-5 shrink-0" />
          Cerrar sesión
        </Button>
      </div>
    </aside>
  );
}
