import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSession } from "@/lib/auth/session";
import { fetchDirectory } from "@/lib/directory";
import { Sidebar } from "@/components/layout/Sidebar";
import { SidebarProvider } from "@/components/layout/SidebarContext";
import { SessionProvider } from "@/components/layout/SessionContext";
import { ViewAsBanner } from "@/components/layout/ViewAs";
import { Toaster } from "@/components/ui/sonner";
import { DianaWidget } from "@/components/diana/DianaWidget";

export default async function PlatformLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, role, member, realRole, viewingAs } = await getSession();

  if (!user) {
    redirect("/login");
  }

  // owner_id → persona, para que las vistas puedan decir quién hizo cada cosa
  const supabase = await createClient();
  const directory = await fetchDirectory(supabase);

  return (
    <SessionProvider value={{ role, slug: member?.slug ?? null, directory, viewingAs, realRole }}>
      <SidebarProvider>
        <div className="flex h-screen bg-muted overflow-hidden">
          <Sidebar />
          <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
            {/* Cuando el Dueño mira con los ojos de otro, que se note siempre */}
            <ViewAsBanner />
            <main className="flex-1 overflow-auto min-h-0">{children}</main>
          </div>
          <Toaster richColors position="top-right" />
          <DianaWidget />
        </div>
      </SidebarProvider>
    </SessionProvider>
  );
}
