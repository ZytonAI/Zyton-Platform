import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { isOwner } from "@/lib/permissions";
import { reconnectBridge } from "@/lib/wa-bridge";

export async function POST() {
  const { user, role } = await getSession();
  if (!user) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  // Reconectar es levantar un QR nuevo, y el QR solo se le muestra al Dueño
  // (ver /api/whatsapp/status). Dejar que un Socio lo dispare solo servía para
  // reiniciar el bridge del equipo sin poder terminar el trabajo.
  if (!isOwner(role)) {
    return NextResponse.json(
      { error: "Solo el Dueño puede vincular el WhatsApp del equipo." },
      { status: 403 }
    );
  }

  try {
    const result = await reconnectBridge();
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error desconocido";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
