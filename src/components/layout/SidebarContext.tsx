"use client";

import { createContext, useContext, useState, useSyncExternalStore } from "react";

interface SidebarContextType {
  /** Drawer de móvil */
  open: boolean;
  toggle: () => void;
  close: () => void;
  /** En escritorio: barra reducida a solo iconos */
  collapsed: boolean;
  toggleCollapsed: () => void;
}

const SidebarContext = createContext<SidebarContextType>({
  open: false,
  toggle: () => {},
  close: () => {},
  collapsed: false,
  toggleCollapsed: () => {},
});

/**
 * Si la barra quedó reducida se recuerda en el navegador. Se lee con
 * useSyncExternalStore para que el servidor pinte siempre la barra ancha y el
 * navegador corrija después, sin desajustes de hidratación.
 */
const COLLAPSED_KEY = "sidebar:collapsed";
const COLLAPSED_EVENT = "sidebar:collapsed-change";

function subscribeCollapsed(onChange: () => void) {
  window.addEventListener(COLLAPSED_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(COLLAPSED_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

function readCollapsed() {
  try {
    return localStorage.getItem(COLLAPSED_KEY) === "1";
  } catch {
    // Navegador sin storage (modo privado): se queda ancha
    return false;
  }
}

function storeCollapsed(value: boolean) {
  try {
    if (value) localStorage.setItem(COLLAPSED_KEY, "1");
    else localStorage.removeItem(COLLAPSED_KEY);
  } catch {
    // Sin storage no se recuerda, pero la sesión actual sí responde
  }
  window.dispatchEvent(new Event(COLLAPSED_EVENT));
}

export function SidebarProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const collapsed = useSyncExternalStore(subscribeCollapsed, readCollapsed, () => false);

  return (
    <SidebarContext.Provider
      value={{
        open,
        toggle: () => setOpen((v) => !v),
        close: () => setOpen(false),
        collapsed,
        toggleCollapsed: () => storeCollapsed(!collapsed),
      }}
    >
      {children}
    </SidebarContext.Provider>
  );
}

export function useSidebar() {
  return useContext(SidebarContext);
}
