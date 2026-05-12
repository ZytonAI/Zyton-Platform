import { createAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";

export async function POST() {
  const supabase = createAdminClient();

  const { data: convs } = await supabase
    .from("conversations")
    .select("id, owner_id, contact_phone, wa_chat_id, lead_id, last_message_at, unread_count");

  if (!convs || convs.length === 0) return NextResponse.json({ merged: 0 });

  // Agrupar por owner_id
  const byOwner = new Map<string, typeof convs>();
  for (const c of convs) {
    const list = byOwner.get(c.owner_id) ?? [];
    list.push(c);
    byOwner.set(c.owner_id, list);
  }

  let merged = 0;

  for (const [, list] of byOwner) {
    const dropped = new Set<string>();

    for (let i = 0; i < list.length; i++) {
      if (dropped.has(list[i].id)) continue;
      const suffixI = list[i].contact_phone?.slice(-10);
      if (!suffixI || suffixI.length < 7) continue;

      for (let j = i + 1; j < list.length; j++) {
        if (dropped.has(list[j].id)) continue;
        const suffixJ = list[j].contact_phone?.slice(-10);

        // Mismo sufijo de teléfono pero números distintos → duplicado
        if (suffixI !== suffixJ || list[i].contact_phone === list[j].contact_phone) continue;

        const a = list[i];
        const b = list[j];

        // Elegir cuál conservar: prioridad al que tiene lead_id, luego al de teléfono más largo
        let keepConv: typeof a, dropConv: typeof a;

        if (a.lead_id && !b.lead_id) {
          keepConv = a; dropConv = b;
        } else if (b.lead_id && !a.lead_id) {
          keepConv = b; dropConv = a;
        } else if ((a.contact_phone?.length ?? 0) >= (b.contact_phone?.length ?? 0)) {
          keepConv = a; dropConv = b;
        } else {
          keepConv = b; dropConv = a;
        }

        // El teléfono canónico es el más largo (con código de país)
        const canonicalPhone =
          (a.contact_phone?.length ?? 0) >= (b.contact_phone?.length ?? 0)
            ? a.contact_phone
            : b.contact_phone;
        const canonicalChatId =
          (a.contact_phone?.length ?? 0) >= (b.contact_phone?.length ?? 0)
            ? a.wa_chat_id
            : b.wa_chat_id;

        // Si la conversación conservada no tiene lead_id pero la otra sí, copiar lead_id
        const finalLeadId = keepConv.lead_id ?? dropConv.lead_id ?? null;

        // Mover mensajes de la eliminada a la conservada
        await supabase
          .from("messages")
          .update({ conversation_id: keepConv.id })
          .eq("conversation_id", dropConv.id);

        // Actualizar conversación conservada con datos canónicos
        await supabase
          .from("conversations")
          .update({
            wa_chat_id: canonicalChatId,
            contact_phone: canonicalPhone,
            lead_id: finalLeadId,
            updated_at: new Date().toISOString(),
          })
          .eq("id", keepConv.id);

        // Eliminar conversación duplicada
        await supabase.from("conversations").delete().eq("id", dropConv.id);

        dropped.add(dropConv.id);
        merged++;
      }
    }
  }

  // También vincular conversaciones sin lead_id a leads por teléfono
  const { data: unlinked } = await supabase
    .from("conversations")
    .select("id, owner_id, contact_phone")
    .is("lead_id", null);

  for (const conv of unlinked ?? []) {
    const suffix = conv.contact_phone?.slice(-10);
    if (!suffix || suffix.length < 7) continue;

    const { data: lead } = await supabase
      .from("leads")
      .select("id")
      .eq("owner_id", conv.owner_id)
      .like("phone", `%${suffix}`)
      .limit(1)
      .maybeSingle();

    if (lead) {
      await supabase
        .from("conversations")
        .update({ lead_id: lead.id })
        .eq("id", conv.id);
    }
  }

  return NextResponse.json({ merged });
}
