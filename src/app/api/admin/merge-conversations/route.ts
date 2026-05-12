import { createAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";

export async function POST() {
  const supabase = createAdminClient();

  const { data: convs } = await supabase
    .from("conversations")
    .select("id, owner_id, contact_phone, wa_chat_id, lead_id, last_message_at");

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
      if (!suffixI || suffixI.length < 10) continue;

      for (let j = i + 1; j < list.length; j++) {
        if (dropped.has(list[j].id)) continue;
        const suffixJ = list[j].contact_phone?.slice(-10);

        // Mismo sufijo de 10 dígitos pero teléfonos distintos → duplicado
        if (suffixI === suffixJ && list[i].contact_phone !== list[j].contact_phone) {
          // Mantener el que tiene lead_id; si empate, el de teléfono más largo (con código de país)
          let keepId: string, dropId: string;

          if (list[i].lead_id && !list[j].lead_id) {
            keepId = list[i].id; dropId = list[j].id;
          } else if (list[j].lead_id && !list[i].lead_id) {
            keepId = list[j].id; dropId = list[i].id;
          } else if ((list[i].contact_phone?.length ?? 0) >= (list[j].contact_phone?.length ?? 0)) {
            keepId = list[i].id; dropId = list[j].id;
          } else {
            keepId = list[j].id; dropId = list[i].id;
          }

          // Mover mensajes al conversation que se conserva
          await supabase
            .from("messages")
            .update({ conversation_id: keepId })
            .eq("conversation_id", dropId);

          // Eliminar conversación duplicada
          await supabase.from("conversations").delete().eq("id", dropId);

          dropped.add(dropId);
          merged++;
        }
      }
    }
  }

  return NextResponse.json({ merged });
}
