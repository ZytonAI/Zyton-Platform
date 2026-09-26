import { NextResponse } from "next/server";
import { z } from "zod";
import { createServiceClient } from "@/lib/supabase/service";
import { findDuplicate } from "@/lib/duplicates";
import { notifyMember } from "@/lib/notify-member";
import { teamOwner } from "@/lib/team";
import { SOURCE_EX_CLIENTE } from "@/lib/saas";

export const dynamic = "force-dynamic";

/**
 * Altas y bajas de empresas del SaaS (app.zytonai.com), para que el CRM del
 * equipo esté al día sin pasarlas a mano.
 *
 *   alta          → cliente activo (se crea, o se reactiva si ya estaba).
 *   baja          → el cliente pasa a `churned` y vuelve a ser lead con
 *                   origen «Ex cliente» y prioridad alta, para recuperarlo.
 *   reactivacion  → el cliente vuelve a `active` y su lead queda convertido.
 *
 * Lo llama el worker del SaaS con `Authorization: Bearer {SAAS_PLATAFORMA_KEY}`
 * (la `PLATAFORMA_API_KEY` del backend del SaaS, la misma con la que esta
 * plataforma lee «Empresas SaaS»). Reintenta si esto no contesta 2xx.
 *
 * La empresa se reconoce por su subdominio, que no cambia: va en las notas del
 * cliente y del lead como `SaaS: <sub>.zytonai.com`. No hay columna propia
 * para no tocar el esquema por esto.
 */
const entrada = z.object({
  evento: z.enum(["alta", "baja", "reactivacion"]),
  motivo: z.string().max(300).nullable().optional(),
  subdominio: z.string().min(1).max(63),
  empresa: z.string().min(1).max(160),
  razon_social: z.string().max(160).nullable().optional(),
  documento: z.string().max(40).nullable().optional(),
  ciudad: z.string().max(100).nullable().optional(),
  gerente: z.string().max(160).nullable().optional(),
  email: z.string().max(160).nullable().optional(),
  plan: z.string().max(20),
  periodo: z.string().max(20),
  monto: z.number().nullable().optional(),
  motivo_cancelacion: z.string().max(300).nullable().optional(),
});

const pesos = (n: number | null | undefined) =>
  n == null ? "" : new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(n);

export async function POST(request: Request) {
  const secret = process.env.SAAS_PLATAFORMA_KEY;
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

  const marca = `SaaS: ${d.subdominio}.zytonai.com`;
  const hoy = new Date().toISOString().slice(0, 10);
  const resumen = [
    marca,
    `Plan ${d.plan} (${d.periodo})${d.monto ? ` · ${pesos(d.monto)}` : ""}`,
    d.razon_social ? `Razón social: ${d.razon_social}` : null,
    d.documento ? `Documento: ${d.documento}` : null,
    d.ciudad ? `Ciudad: ${d.ciudad}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  const { data: clientes } = await db
    .from("clients")
    .select("id, lead_id, status, notes")
    .ilike("notes", `%${marca}%`)
    .limit(1);
  const cliente = clientes?.[0] ?? null;

  const { data: leadsEx } = await db
    .from("leads")
    .select("id, status")
    .ilike("notes", `%${marca}%`)
    .limit(1);
  const leadMarcado = leadsEx?.[0] ?? null;

  // El worker del SaaS reintenta si no recibe respuesta, así que el mismo
  // evento puede llegar dos veces: repetirlo no hace nada (ni historial ni
  // Telegram de más).
  if ((d.evento === "alta" || d.evento === "reactivacion") && cliente?.status === "active") {
    return NextResponse.json({ ok: true, client_id: cliente.id, sin_cambios: true });
  }
  if (d.evento === "baja" && cliente?.status === "churned") {
    return NextResponse.json({ ok: true, client_id: cliente.id, sin_cambios: true });
  }

  if (d.evento === "alta" || d.evento === "reactivacion") {
    let clientId = cliente?.id ?? null;
    // El lead del que viene: el que ya lleva la marca (volvió un ex cliente) o
    // el que escribió con el mismo correo (por ejemplo, desde la web).
    let leadId = cliente?.lead_id ?? leadMarcado?.id ?? null;
    if (!leadId && d.email) {
      const dup = await findDuplicate(db, null, d.email);
      if (dup?.type === "lead") leadId = dup.id;
    }

    if (cliente) {
      await db
        .from("clients")
        .update({ status: "active", contract_end: null, lead_id: leadId, updated_at: new Date().toISOString() })
        .eq("id", cliente.id);
      await db.from("client_history").insert({
        client_id: cliente.id,
        owner_id: perfil.id,
        event_type: "reactivated",
        description: `Volvió a pagar el CRM (${d.plan} ${d.periodo})`,
      });
    } else {
      const { data: nuevo, error } = await db
        .from("clients")
        .insert({
          owner_id: perfil.id,
          lead_id: leadId,
          name: d.gerente || d.empresa,
          email: d.email || null,
          company: d.empresa,
          status: "active",
          contract_start: hoy,
          billing_type: "monthly",
          billing_amount: d.periodo === "mensual" ? d.monto ?? null : null,
          notes: resumen,
        })
        .select("id")
        .single();
      if (error || !nuevo) {
        return NextResponse.json({ error: error?.message ?? "No se pudo crear el cliente" }, { status: 500 });
      }
      clientId = nuevo.id;
      await db.from("client_history").insert({
        client_id: clientId,
        owner_id: perfil.id,
        event_type: "created",
        description: `Compró el CRM: plan ${d.plan} (${d.periodo})`,
      });
    }

    if (leadId) {
      await db.from("leads").update({ status: "converted" }).eq("id", leadId);
      await db.from("lead_history").insert({
        lead_id: leadId,
        owner_id: perfil.id,
        event_type: "converted",
        description: d.evento === "alta" ? "Compró el CRM y pasó a cliente" : "Volvió a pagar el CRM",
      });
    }

    await notifyMember(
      dueno?.slug,
      d.evento === "alta" && !cliente
        ? `💰 *${d.empresa}* compró el CRM: plan ${d.plan} (${d.periodo})${d.monto ? ` · ${pesos(d.monto)}` : ""}.\nYa está en Clientes.`
        : `🔁 *${d.empresa}* volvió a pagar el CRM. Está otra vez como cliente activo.`
    );
    return NextResponse.json({ ok: true, client_id: clientId, lead_id: leadId });
  }

  // --- baja ---------------------------------------------------------------
  const motivo = d.motivo || "Dejó de pagar";
  if (cliente) {
    await db
      .from("clients")
      .update({ status: "churned", contract_end: hoy, updated_at: new Date().toISOString() })
      .eq("id", cliente.id);
    await db.from("client_history").insert({
      client_id: cliente.id,
      owner_id: perfil.id,
      event_type: "churned",
      description: `Dejó de ser cliente: ${motivo}`,
      metadata: d.motivo_cancelacion ? { motivo_cancelacion: d.motivo_cancelacion } : null,
    });
  }

  const notaLead = [
    `Ex cliente del CRM: ${motivo} (${hoy}).`,
    d.motivo_cancelacion ? `Lo que dijo al cancelar: ${d.motivo_cancelacion}` : null,
    resumen,
  ]
    .filter(Boolean)
    .join("\n");

  // Se reutiliza su lead (el de origen o uno ya marcado) en vez de crear otro.
  const leadId = cliente?.lead_id ?? leadMarcado?.id ?? null;
  let leadFinal = leadId;
  if (leadId) {
    await db
      .from("leads")
      .update({ status: "new", source: SOURCE_EX_CLIENTE, priority: "alta", notes: notaLead })
      .eq("id", leadId);
  } else {
    const { data: nuevo, error } = await db
      .from("leads")
      .insert({
        owner_id: perfil.id,
        name: d.gerente || d.empresa,
        email: d.email || null,
        company: d.empresa,
        status: "new",
        source: SOURCE_EX_CLIENTE,
        priority: "alta",
        notes: notaLead,
      })
      .select("id")
      .single();
    if (error || !nuevo) {
      return NextResponse.json({ error: error?.message ?? "No se pudo crear el lead" }, { status: 500 });
    }
    leadFinal = nuevo.id;
  }
  await db.from("lead_history").insert({
    lead_id: leadFinal,
    owner_id: perfil.id,
    event_type: "status_change",
    description: `Dejó de ser cliente del CRM (${motivo}): vuelve a leads como ex cliente`,
  });
  await notifyMember(
    dueno?.slug,
    `📉 *${d.empresa}* dejó de ser cliente: ${motivo}.${d.motivo_cancelacion ? `\n«${d.motivo_cancelacion}»` : ""}\nQuedó en Leads como ex cliente.`
  );
  return NextResponse.json({ ok: true, client_id: cliente?.id ?? null, lead_id: leadFinal });
}
