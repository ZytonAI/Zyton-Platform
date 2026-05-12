import { createClient } from "@/lib/supabase/server";
import { TopBar } from "@/components/layout/TopBar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, Briefcase, TrendingUp, MessageCircle, Receipt, CalendarDays } from "lucide-react";

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [leadsRes, clientsRes, messagesRes, convertedRes, upcomingInvoicesRes, upcomingEventsRes] = await Promise.all([
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
    supabase
      .from("invoices")
      .select("id, title, amount, due_date, status")
      .eq("owner_id", user!.id)
      .in("status", ["pending", "overdue"])
      .order("due_date", { ascending: true })
      .limit(3),
    supabase
      .from("calendar_events")
      .select("id, title, event_date, type, status")
      .eq("owner_id", user!.id)
      .eq("status", "pending")
      .gte("event_date", (() => { const d = new Date(); d.setUTCHours(0, 0, 0, 0); return d.toISOString(); })())
      .order("event_date", { ascending: true })
      .limit(3),
  ]);

  const totalLeads = leadsRes.count ?? 0;
  const activeClients = clientsRes.count ?? 0;
  const totalMessages = messagesRes.count ?? 0;
  const convertedLeads = convertedRes.count ?? 0;
  const conversionRate =
    totalLeads > 0 ? Math.round((convertedLeads / totalLeads) * 100) : 0;
  const upcomingInvoices = upcomingInvoicesRes.data ?? [];
  const upcomingEvents = upcomingEventsRes.data ?? [];

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

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Próximas facturas
                </CardTitle>
                <Receipt className="w-4 h-4 text-orange-500" />
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {upcomingInvoices.length === 0 ? (
                <p className="text-sm text-muted-foreground">Sin facturas pendientes</p>
              ) : (
                upcomingInvoices.map((inv) => (
                  <div key={inv.id} className="flex items-center justify-between text-sm">
                    <span className="truncate font-medium max-w-[55%]">{inv.title}</span>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-muted-foreground text-xs">
                        {new Date(inv.due_date + "T00:00:00").toLocaleDateString("es-ES", {
                          day: "2-digit",
                          month: "short",
                        })}
                      </span>
                      <span
                        className={`text-xs font-medium ${
                          inv.status === "overdue"
                            ? "text-red-600"
                            : "text-yellow-600"
                        }`}
                      >
                        {inv.status === "overdue" ? "Vencida" : "Pendiente"}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Próximos eventos
                </CardTitle>
                <CalendarDays className="w-4 h-4 text-blue-500" />
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {upcomingEvents.length === 0 ? (
                <p className="text-sm text-muted-foreground">Sin eventos próximos</p>
              ) : (
                upcomingEvents.map((ev) => (
                  <div key={ev.id} className="flex items-center justify-between text-sm">
                    <span className="truncate font-medium max-w-[60%]">{ev.title}</span>
                    <span className="text-muted-foreground text-xs shrink-0">
                      {new Date(ev.event_date).toLocaleString("es-ES", {
                        day:    "2-digit",
                        month:  "short",
                        hour:   "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
