import { TopBar } from "@/components/layout/TopBar";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent } from "@/components/ui/card";
import { Bot } from "lucide-react";

export default async function AgentsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <>
      <TopBar title="Agentes IA" userEmail={user?.email} />
      <div className="p-6">
        <Card className="border-0 shadow-sm">
          <CardContent className="flex flex-col items-center justify-center py-24 text-center">
            <div className="w-16 h-16 rounded-2xl bg-violet-50 flex items-center justify-center mb-4">
              <Bot className="w-8 h-8 text-violet-600" />
            </div>
            <h3 className="font-semibold text-lg text-gray-900">
              Agentes de automatización
            </h3>
            <p className="text-muted-foreground mt-2 max-w-sm">
              Configura agentes de IA para automatizar áreas de tu negocio.
              Disponible en Stage 4.
            </p>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
