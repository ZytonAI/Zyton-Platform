import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { revisarConexionWhatsapp } from "@/lib/wa-alert";

export const dynamic = "force-dynamic";

/**
 * Chequeo periódico de la sesión de WhatsApp. Lo llama el cron interno
 * (src/lib/cron.ts) con `Authorization: Bearer {CRON_SECRET}`, igual que el
 * recordatorio de facturas.
 *
 * Es lo que hace que el aviso sirva de madrugada: la ruta /status solo se
 * consulta mientras alguien tiene el chat abierto, y una caída a las 3 a.m.
 * no la vería nadie hasta la mañana siguiente.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const resultado = await revisarConexionWhatsapp(createServiceClient());
  return NextResponse.json(resultado);
}
