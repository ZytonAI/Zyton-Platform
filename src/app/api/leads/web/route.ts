import { NextResponse } from "next/server";
import { z } from "zod";
import { createServiceClient } from "@/lib/supabase/service";
import { findDuplicate } from "@/lib/duplicates";
import { notifyMember } from "@/lib/notify-member";
import { teamOwner } from "@/lib/team";

export const dynamic = "force-dynamic";

/**
 * Entrada del formulario de contacto de la web (www.zytonai.com/#contacto).
 *
 * Antes el formulario solo decía «gracias» y no mandaba nada: cada persona que
 * escribía se perdía. Ahora la ruta de la web (`/api/contacto` en el repo de la
 * web) llama aquí con `Authorization: Bearer {WEB_LEADS_SECRET}`. Sin sesión:
 * quien llama es un servidor, no una persona del equipo.
 *
 * El lead nace sin dueño (lo toma quien lo trabaje, como cualquier otro) y a
 * nombre del Dueño en `owner_id`, que es solo autoría. Si la persona ya existe
 * como lead o cliente, no se duplica: se deja el mensaje en su historial. En
 * los dos casos le llega un Telegram al Dueño.
 */
const entrada = z.object({
  nombre: z.string().trim().min(1).max(120),
  email: z.string().trim().email().max(160),
  empresa: z.string().trim().max(160).optional().or(z.literal("")),
  telefono: z.string().trim().max(40).optional().or(z.literal("")),
  mensaje: z.string().trim().max(2000).optional().or(z.literal("")),
});

export async function POST(request: Request) {
  const secret = process.env.WEB_LEADS_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = entrada.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const d = parsed.data;
  const db = createServiceClient();

  const dueno = teamOwner();
  const { data: perfil } = await db
    .from("profiles")
    .select("id")
    .ilike("username", dueno?.username ?? "")
    .maybeSingle();
  if (!perfil) {
    return NextResponse.json({ error: "No se encontró el perfil del Dueño" }, { status: 500 });
  }

  const nota = [
    "Escribió desde el formulario de la web.",
    d.empresa ? `Empresa: ${d.empresa}` : null,
    d.mensaje ? `Mensaje: ${d.mensaje}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  const repetido = await findDuplicate(db, d.telefono, d.email);
  if (repetido?.type === "lead") {
    await db.from("lead_history").insert({
      lead_id: repetido.id,
      owner_id: perfil.id,
      event_type: "note_added",
      description: nota,
    });
    await notifyMember(
      dueno?.slug,
      `🌐 *${d.nombre}* volvió a escribir por la web (ya es lead).\n${d.mensaje ?? ""}`.trim()
    );
    return NextResponse.json({ ok: true, lead_id: repetido.id, existente: true });
  }

  const { data: lead, error } = await db
    .from("leads")
    .insert({
      owner_id: perfil.id,
      name: d.nombre,
      email: d.email,
      phone: d.telefono || null,
      company: d.empresa || null,
      status: "new",
      source: "web",
      notes: nota,
    })
    .select("id")
    .single();
  if (error || !lead) {
    return NextResponse.json({ error: error?.message ?? "No se pudo crear" }, { status: 500 });
  }

  await db.from("lead_history").insert({
    lead_id: lead.id,
    owner_id: perfil.id,
    event_type: "created",
    description: repetido ? `Lead creado desde la web (ya existía como cliente: ${repetido.name})` : "Lead creado desde la web",
  });
  await notifyMember(
    dueno?.slug,
    `🌐 Nuevo lead desde la web: *${d.nombre}*${d.empresa ? ` (${d.empresa})` : ""}\n${d.email}${d.telefono ? ` · ${d.telefono}` : ""}${d.mensaje ? `\n\n${d.mensaje}` : ""}`
  );
  return NextResponse.json({ ok: true, lead_id: lead.id }, { status: 201 });
}
