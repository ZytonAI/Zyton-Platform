import { createClient } from "@/lib/supabase/server";
import { TopBar } from "@/components/layout/TopBar";
import { AgentConfigClient } from "@/components/agents/AgentConfigClient";
import type { AgentConfig } from "@/types";

const DEFAULT_AGENT_VALUES = {
  enabled: false,
  name: "Asistente ZytonAI",
  system_prompt:
    "Eres un asistente de ventas amable y profesional de ZytonAI. Responde de forma concisa y útil. Si el cliente tiene preguntas sobre precios o detalles específicos que no conoces, ofrece coordinar una llamada con el equipo.",
  model: "claude-haiku-4-5-20251001",
};

export default async function AgentsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data } = await supabase
    .from("ai_agents")
    .select("*")
    .eq("owner_id", user!.id)
    .single();

  const agentConfig: AgentConfig = data ?? {
    id: "",
    owner_id: user!.id,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...DEFAULT_AGENT_VALUES,
  };

  return (
    <>
      <TopBar title="Agentes IA" userEmail={user?.email} />
      <AgentConfigClient initialConfig={agentConfig} />
    </>
  );
}
