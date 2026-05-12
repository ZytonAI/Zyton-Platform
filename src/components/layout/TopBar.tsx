"use client";

import { Menu } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useSidebar } from "./SidebarContext";

interface TopBarProps {
  title: string;
  userEmail?: string;
}

export function TopBar({ title, userEmail }: TopBarProps) {
  const initials = userEmail ? userEmail[0].toUpperCase() : "U";
  const { toggle } = useSidebar();

  return (
    <header className="h-16 bg-white/80 backdrop-blur-sm border-b border-gray-200/70 flex items-center justify-between px-4 sm:px-7 shrink-0 shadow-[0_1px_8px_rgba(0,0,0,0.06)]">
      <div className="flex items-center gap-3">
        <button
          onClick={toggle}
          className="md:hidden p-1.5 -ml-1 rounded-lg text-gray-500 hover:bg-gray-100 transition-colors"
          aria-label="Abrir menú"
        >
          <Menu className="w-5 h-5" />
        </button>
        <h1 className="text-[15px] font-semibold text-gray-900 tracking-tight">{title}</h1>
      </div>
      <div className="flex items-center gap-3">
        {userEmail && (
          <span className="text-xs text-gray-400 hidden sm:block font-medium tracking-tight">
            {userEmail}
          </span>
        )}
        <Avatar className="w-8 h-8 ring-2 ring-primary/20">
          <AvatarFallback className="bg-gradient-to-br from-blue-500 to-blue-700 text-white text-xs font-bold">
            {initials}
          </AvatarFallback>
        </Avatar>
      </div>
    </header>
  );
}
