import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getSession } from "@/lib/auth/session";
import { isOwner } from "@/lib/permissions";
import { getWorkspaceSession } from "@/lib/wa-session";
import { disconnectBridge } from "@/lib/wa-bridge";

export async function POST() {
  const supabase = await createClient();
  const { user, role } = await getSession();
  if (!user) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  // El número lo comparten los cuatro: cerrarlo deja sin chat a todo el equipo
  if (!isOwner(role)) {
    return NextResponse.json(
      { error: "Solo el Dueño puede cerrar la sesión de WhatsApp del equipo." },
      { status: 403 }
    );
  }

  try {
    await disconnectBridge();

    // Se desconecta la sesión del workspace (la comparten los cuatro)
    const session = await getWorkspaceSession(supabase);
    if (session) {
      await supabase
        .from("wa_sessions")
        .update({ status: "disconnected", phone: null, updated_at: new Date().toISOString() })
        .eq("id", session.id);
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error desconocido";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
