import { createClient } from "@/lib/supabase/server";
import { TopBar } from "@/components/layout/TopBar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, Briefcase, TrendingUp, MessageCircle } from "lucide-react";

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [leadsRes, clientsRes, messagesRes, convertedRes] = await Promise.all([
    supabase
      .from("leads")
      .select("id", { count: "exact", head: true })
      .eq("owner_id", user!.id),
    supabase
      .from("clients")
      .select("id", { count: "exact", head: true })
      .eq("owner_id", user!.id)
      .eq("status", "active"),
    supabase
      .from("messages")
      .select("id", { count: "exact", head: true })
      .eq("owner_id", user!.id),
    supabase
      .from("leads")
      .select("id", { count: "exact", head: true })
      .eq("owner_id", user!.id)
      .eq("status", "converted"),
  ]);

  const totalLeads = leadsRes.count ?? 0;
  const activeClients = clientsRes.count ?? 0;
  const totalMessages = messagesRes.count ?? 0;
  const convertedLeads = convertedRes.count ?? 0;
  const conversionRate =
    totalLeads > 0 ? Math.round((convertedLeads / totalLeads) * 100) : 0;

  const stats = [
    {
      title: "Leads totales",
      value: totalLeads.toString(),
      description: `${convertedLeads} convertidos`,
      icon: Users,
      color: "text-blue-600",
      bg: "bg-blue-50",
    },
    {
      title: "Clientes activos",
      value: activeClients.toString(),
      description: "Estado: activo",
      icon: Briefcase,
      color: "text-emerald-600",
      bg: "bg-emerald-50",
    },
    {
      title: "Tasa de conversión",
      value: `${conversionRate}%`,
      description: `${convertedLeads} de ${totalLeads} leads`,
      icon: TrendingUp,
      color: "text-violet-600",
      bg: "bg-violet-50",
    },
    {
      title: "Mensajes WhatsApp",
      value: totalMessages.toString(),
      description: "Total acumulado",
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
      </div>
    </>
  );
}
