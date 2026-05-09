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
        <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-sidebar-primary">
          <span className="text-white font-bold text-base">Z</span>
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
