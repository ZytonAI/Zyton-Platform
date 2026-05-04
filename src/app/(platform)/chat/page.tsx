import { TopBar } from "@/components/layout/TopBar";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent } from "@/components/ui/card";
import { MessageCircle } from "lucide-react";

export default async function ChatPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <>
      <TopBar title="Chat — WhatsApp" userEmail={user?.email} />
      <div className="p-6">
        <Card className="border-0 shadow-sm">
          <CardContent className="flex flex-col items-center justify-center py-24 text-center">
            <div className="w-16 h-16 rounded-2xl bg-amber-50 flex items-center justify-center mb-4">
              <MessageCircle className="w-8 h-8 text-amber-600" />
            </div>
            <h3 className="font-semibold text-lg text-gray-900">
              WhatsApp integrado
            </h3>
            <p className="text-muted-foreground mt-2 max-w-sm">
              Conecta tu WhatsApp escaneando un QR y gestiona tus conversaciones
              desde aquí. Disponible en Stage 3.
            </p>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
