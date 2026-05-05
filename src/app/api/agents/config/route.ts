import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

const DEFAULT_AGENT = {
  enabled: false,
  name: "Asistente ZytonAI",
  system_prompt:
    "Eres un asistente de ventas amable y profesional de ZytonAI. Responde de forma concisa y útil. Si el cliente tiene preguntas sobre precios o detalles específicos que no conoces, ofrece coordinar una llamada con el equipo.",
  model: "claude-haiku-4-5-20251001",
};

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("ai_agents")
    .select("*")
    .eq("owner_id", user.id)
    .single();

  if (error && error.code !== "PGRST116") {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!data) {
    // Crear config por defecto
    const { data: created, error: createErr } = await supabase
      .from("ai_agents")
      .insert({ owner_id: user.id, ...DEFAULT_AGENT })
      .select()
      .single();
    if (createErr) return NextResponse.json({ error: createErr.message }, { status: 500 });
    return NextResponse.json(created);
  }

  return NextResponse.json(data);
}

export async function PUT(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const { enabled, name, system_prompt, model } = body;

  const { data, error } = await supabase
    .from("ai_agents")
    .upsert(
      {
        owner_id: user.id,
        enabled: enabled ?? false,
        name: name?.trim() || DEFAULT_AGENT.name,
        system_prompt: system_prompt?.trim() || DEFAULT_AGENT.system_prompt,
        model: model || DEFAULT_AGENT.model,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "owner_id" }
    )
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
