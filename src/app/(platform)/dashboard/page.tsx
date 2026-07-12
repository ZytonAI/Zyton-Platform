import { createClient } from "@/lib/supabase/server";
import { TopBar } from "@/components/layout/TopBar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Users, Briefcase, TrendingUp, MessageCircle, Receipt, CalendarDays,
  Plus, AlertTriangle, DollarSign,
} from "lucide-react";
import Link from "next/link";

function formatAmount(n: number) {
  return `$${n.toLocaleString("es-CO", { maximumFractionDigits: 0 })}`;
}

// Rangos de fechas para las queries del dashboard (componente server:
// se calculan una vez por request, fuera del análisis del compilador de React)
function getDateRanges() {
  const now = Date.now();
  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 5);
  sixMonthsAgo.setDate(1);
  const startOfToday = new Date();
  startOfToday.setUTCHours(0, 0, 0, 0);
  return {
    now,
    eightWeeksAgo: new Date(now - 8 * 7 * 86_400_000).toISOString(),
    sixMonthsAgoStr: sixMonthsAgo.toISOString().split("T")[0],
    in30days: new Date(now + 30 * 86_400_000).toISOString().split("T")[0],
    todayStr: new Date(now).toISOString().split("T")[0],
    startOfTodayIso: startOfToday.toISOString(),
  };
}

/** Cubetas semanales (últimas 8) de leads creados */
function buildWeekBuckets(now: number, recentLeads: { created_at: string }[]) {
  const buckets: { label: string; value: number }[] = [];
  for (let w = 7; w >= 0; w--) {
    const start = new Date(now - (w + 1) * 7 * 86_400_000);
    const end = new Date(now - w * 7 * 86_400_000);
    const count = recentLeads.filter((l) => {
      const t = new Date(l.created_at).getTime();
      return t >= start.getTime() && t < end.getTime();
    }).length;
    buckets.push({
      label: end.toLocaleDateString("es-ES", { day: "2-digit", month: "short" }),
      value: count,
    });
  }
  return buckets;
}

/** Cubetas mensuales (últimos 6): ingresos cobrados (receivable) vs gastos pagados (payable) */
function buildMonthBuckets(invoices: { amount: number; status: string; due_date: string; type: string }[]) {
  const buckets: { label: string; value: number; secondary: number }[] = [];
  for (let m = 5; m >= 0; m--) {
    const d = new Date();
    d.setMonth(d.getMonth() - m);
    const key = d.toISOString().slice(0, 7);
    const monthInvoices = invoices.filter((i) => i.due_date.startsWith(key) && i.status === "paid");
    buckets.push({
      label: d.toLocaleDateString("es-ES", { month: "short" }),
      value: monthInvoices.filter((i) => i.type === "receivable").reduce((a, i) => a + Number(i.amount), 0),
      secondary: monthInvoices.filter((i) => i.type === "payable").reduce((a, i) => a + Number(i.amount), 0),
    });
  }
  return buckets;
}

/** Mini gráfico de barras sin dependencias (server-rendered) */
function MiniBars({
  data, accentClass = "bg-primary", secondaryClass = "bg-muted-foreground/25",
}: {
  data: { label: string; value: number; secondary?: number }[];
  accentClass?: string;
  secondaryClass?: string;
}) {
  const max = Math.max(1, ...data.map((d) => Math.max(d.value, d.secondary ?? 0)));
  return (
    <div className="flex items-end gap-2 h-28">
      {data.map((d, i) => (
        <div key={i} className="flex-1 flex flex-col items-center gap-1 min-w-0">
          <div className="w-full flex items-end justify-center gap-0.5 flex-1">
            <div
              className={`w-full max-w-6 rounded-t-md ${accentClass} transition-all`}
              style={{ height: `${Math.max(3, (d.value / max) * 100)}%` }}
              title={`${d.label}: ${d.value}`}
            />
            {d.secondary !== undefined && (
              <div
                className={`w-full max-w-6 rounded-t-md ${secondaryClass} transition-all`}
                style={{ height: `${Math.max(3, (d.secondary / max) * 100)}%` }}
                title={`${d.label}: ${d.secondary}`}
              />
            )}
          </div>
          <span className="text-[9px] text-muted-foreground font-medium truncate w-full text-center">
            {d.label}
          </span>
        </div>
      ))}
    </div>
  );
}

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { now, eightWeeksAgo, sixMonthsAgoStr, in30days, todayStr, startOfTodayIso } = getDateRanges();

  const [
    leadsRes, clientsRes, messagesRes, convertedRes,
    upcomingInvoicesRes, upcomingEventsRes,
    recentLeadsRes, invoicesHistoryRes, expiringContractsRes, overdueRes,
  ] = await Promise.all([
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
      .select("id, title, amount, due_date, status, type")
      .eq("owner_id", user!.id)
      .in("status", ["pending", "overdue"])
      .order("due_date", { ascending: true })
      .limit(3),
    supabase
      .from("calendar_events")
      .select("id, title, event_date, type, status")
      .eq("owner_id", user!.id)
      .eq("status", "pending")
      .gte("event_date", startOfTodayIso)
      .order("event_date", { ascending: true })
      .limit(3),
    supabase
      .from("leads")
      .select("created_at")
      .eq("owner_id", user!.id)
      .gte("created_at", eightWeeksAgo)
      .limit(2000),
    supabase
      .from("invoices")
      .select("amount, status, due_date, type")
      .eq("owner_id", user!.id)
      .gte("due_date", sixMonthsAgoStr)
      .limit(2000),
    supabase
      .from("clients")
      .select("id, name, contract_end")
      .eq("owner_id", user!.id)
      .eq("status", "active")
      .not("contract_end", "is", null)
      .gte("contract_end", todayStr)
      .lte("contract_end", in30days)
      .order("contract_end", { ascending: true })
      .limit(5),
    supabase
      .from("invoices")
      .select("id", { count: "exact", head: true })
      .eq("owner_id", user!.id)
      .neq("status", "paid")
      .lt("due_date", todayStr),
  ]);

  const totalLeads = leadsRes.count ?? 0;
  const activeClients = clientsRes.count ?? 0;
  const totalMessages = messagesRes.count ?? 0;
  const convertedLeads = convertedRes.count ?? 0;
  const conversionRate =
    totalLeads > 0 ? Math.round((convertedLeads / totalLeads) * 100) : 0;
  const upcomingInvoices = upcomingInvoicesRes.data ?? [];
  const upcomingEvents = upcomingEventsRes.data ?? [];
  const expiringContracts = expiringContractsRes.data ?? [];
  const overdueCount = overdueRes.count ?? 0;

  // ── Leads por semana (últimas 8) ──
  const weekBuckets = buildWeekBuckets(now, recentLeadsRes.data ?? []);
  const leadsThisWeek = weekBuckets[weekBuckets.length - 1]?.value ?? 0;

  // ── Ingresos vs gastos por mes (últimos 6) ──
  const monthBuckets = buildMonthBuckets(invoicesHistoryRes.data ?? []);
  const incomeThisMonth = monthBuckets[monthBuckets.length - 1]?.value ?? 0;
  const thisMonthKey = new Date().toISOString().slice(0, 7);
  const incomePendingThisMonth = (invoicesHistoryRes.data ?? [])
    .filter((i) => i.type === "receivable" && i.status !== "paid" && i.due_date.startsWith(thisMonthKey))
    .reduce((a, i) => a + Number(i.amount), 0);

  const stats = [
    {
      title: "Leads totales",
      value: totalLeads.toString(),
      description: leadsThisWeek > 0 ? `+${leadsThisWeek} esta semana` : `${convertedLeads} convertidos`,
      icon: Users,
      color: "text-blue-600 dark:text-blue-400",
      bg: "bg-blue-50 dark:bg-blue-500/15",
    },
    {
      title: "Clientes activos",
      value: activeClients.toString(),
      description: expiringContracts.length > 0 ? `${expiringContracts.length} contrato(s) por vencer` : "Estado: activo",
      icon: Briefcase,
      color: "text-emerald-600 dark:text-emerald-400",
      bg: "bg-emerald-50 dark:bg-emerald-500/15",
    },
    {
      title: "Tasa de conversión",
      value: `${conversionRate}%`,
      description: `${convertedLeads} de ${totalLeads} leads`,
      icon: TrendingUp,
      color: "text-violet-600 dark:text-violet-400",
      bg: "bg-violet-50 dark:bg-violet-500/15",
    },
    {
      title: "Mensajes WhatsApp",
      value: totalMessages.toString(),
      description: "Total acumulado",
      icon: MessageCircle,
      color: "text-amber-600 dark:text-amber-400",
      bg: "bg-amber-50 dark:bg-amber-500/15",
    },
    {
      title: "Ingresos del mes",
      value: formatAmount(incomeThisMonth),
      description: incomePendingThisMonth > 0 ? `${formatAmount(incomePendingThisMonth)} por cobrar` : "Todo cobrado",
      icon: DollarSign,
      color: "text-sky-600 dark:text-sky-400",
      bg: "bg-sky-50 dark:bg-sky-500/15",
    },
  ];

  const needsAttention = overdueCount > 0 || expiringContracts.length > 0;

  return (
    <>
      <TopBar title="Dashboard" userEmail={user?.email} />
      <div className="p-6 space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold text-foreground">
              Bienvenido a Zyton Platform
            </h2>
            <p className="text-muted-foreground mt-1">
              Tu hub centralizado para gestionar leads, clientes y comunicaciones.
            </p>
          </div>
          {/* Acciones rápidas */}
          <div className="flex gap-2">
            <Button render={<Link href="/leads" />} size="sm" variant="outline" className="gap-1.5 rounded-xl">
              <Plus className="w-4 h-4" /> Nuevo lead
            </Button>
            <Button render={<Link href="/invoices" />} size="sm" variant="outline" className="gap-1.5 rounded-xl">
              <Receipt className="w-4 h-4" /> Facturas
            </Button>
            <Button render={<Link href="/chat" />} size="sm" className="gap-1.5 rounded-xl">
              <MessageCircle className="w-4 h-4" /> Ir al chat
            </Button>
          </div>
        </div>

        {/* Card de atención */}
        {needsAttention && (
          <Card className="border-0 shadow-sm ring-1 ring-amber-200 dark:ring-amber-500/30 bg-amber-50/50 dark:bg-amber-500/[0.07]">
            <CardContent className="py-4 flex flex-wrap items-center gap-x-6 gap-y-2">
              <div className="flex items-center gap-2 text-amber-700 dark:text-amber-300 font-semibold text-sm">
                <AlertTriangle className="w-4 h-4" /> Requiere atención
              </div>
              {overdueCount > 0 && (
                <Link href="/invoices" className="text-sm text-foreground hover:underline">
                  {overdueCount} factura{overdueCount !== 1 ? "s" : ""} vencida{overdueCount !== 1 ? "s" : ""} sin pagar
                </Link>
              )}
              {expiringContracts.map((c) => (
                <Link key={c.id} href={`/clients/${c.id}`} className="text-sm text-foreground hover:underline">
                  Contrato de {c.name} vence el{" "}
                  {new Date(c.contract_end + "T00:00:00").toLocaleDateString("es-ES", { day: "2-digit", month: "short" })}
                </Link>
              ))}
            </CardContent>
          </Card>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4">
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
                <p className="text-2xl font-bold text-foreground">{stat.value}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {stat.description}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* ── Mini gráficos ── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Leads nuevos por semana
                </CardTitle>
                <Users className="w-4 h-4 text-blue-500" />
              </div>
            </CardHeader>
            <CardContent>
              <MiniBars data={weekBuckets} accentClass="bg-primary" />
            </CardContent>
          </Card>

          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Ingresos vs gastos por mes
                </CardTitle>
                <DollarSign className="w-4 h-4 text-sky-500" />
              </div>
            </CardHeader>
            <CardContent>
              <MiniBars data={monthBuckets} accentClass="bg-sky-500" secondaryClass="bg-orange-400/70" />
              <div className="flex items-center gap-4 mt-2">
                <span className="flex items-center gap-1.5 text-[10px] text-muted-foreground font-medium">
                  <span className="w-2.5 h-2.5 rounded-sm bg-sky-500 inline-block" /> Ingresos (cobrado)
                </span>
                <span className="flex items-center gap-1.5 text-[10px] text-muted-foreground font-medium">
                  <span className="w-2.5 h-2.5 rounded-sm bg-orange-400/70 inline-block" /> Gastos (pagado)
                </span>
              </div>
            </CardContent>
          </Card>
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
                    <span className="truncate font-medium max-w-[40%]">{inv.title}</span>
                    <div className="flex items-center gap-2 shrink-0">
                      <span
                        className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                          inv.type === "receivable"
                            ? "bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300"
                            : "bg-orange-100 text-orange-700 dark:bg-orange-500/15 dark:text-orange-300"
                        }`}
                      >
                        {inv.type === "receivable" ? "Cobro" : "Pago"}
                      </span>
                      <span className="font-mono text-xs tabular-nums">{formatAmount(Number(inv.amount))}</span>
                      <span className="text-muted-foreground text-xs">
                        {new Date(inv.due_date + "T00:00:00").toLocaleDateString("es-ES", {
                          day: "2-digit",
                          month: "short",
                        })}
                      </span>
                      <span
                        className={`text-xs font-medium ${
                          inv.status === "overdue" || inv.due_date < todayStr
                            ? "text-red-600 dark:text-red-400"
                            : "text-amber-600 dark:text-amber-400"
                        }`}
                      >
                        {inv.status === "overdue" || inv.due_date < todayStr ? "Vencida" : "Pendiente"}
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
