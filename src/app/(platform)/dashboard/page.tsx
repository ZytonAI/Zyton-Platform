import { createClient } from "@/lib/supabase/server";
import { TopBar } from "@/components/layout/TopBar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, Briefcase, TrendingUp, MessageCircle } from "lucide-react";

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const stats = [
    {
      title: "Leads totales",
      value: "—",
      description: "Próximamente",
      icon: Users,
      color: "text-blue-600",
      bg: "bg-blue-50",
    },
    {
      title: "Clientes activos",
      value: "—",
      description: "Próximamente",
      icon: Briefcase,
      color: "text-emerald-600",
      bg: "bg-emerald-50",
    },
    {
      title: "Tasa de conversión",
      value: "—",
      description: "Próximamente",
      icon: TrendingUp,
      color: "text-violet-600",
      bg: "bg-violet-50",
    },
    {
      title: "Mensajes WhatsApp",
      value: "—",
      description: "Próximamente",
      icon: MessageCircle,
      color: "text-amber-600",
      bg: "bg-amber-50",
    },
  ];

  return (
    <>
      <TopBar title="Dashboard" userEmail={user?.email} />
      <div className="p-6 space-y-6">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">
            Bienvenido a Zyton Platform
          </h2>
          <p className="text-muted-foreground mt-1">
            Tu hub centralizado para gestionar leads, clientes y comunicaciones.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {stats.map((stat) => (
            <Card key={stat.title} className="border-0 shadow-sm">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    {stat.title}
                  </CardTitle>
                  <div className={`p-2 rounded-lg ${stat.bg}`}>
                    <stat.icon className={`w-4 h-4 ${stat.color}`} />
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold text-gray-900">{stat.value}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {stat.description}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>

        <Card className="border-0 shadow-sm">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
              <span className="text-primary font-bold text-2xl">Z</span>
            </div>
            <h3 className="font-semibold text-lg text-gray-900">
              Stage 1 completado
            </h3>
            <p className="text-muted-foreground mt-2 max-w-sm">
              La fundación está lista. Próximo paso: Stage 2 — CRM de Leads y Clientes.
            </p>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
