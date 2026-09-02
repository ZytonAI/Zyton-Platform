import { createClient } from "@/lib/supabase/server";
import { getSession } from "@/lib/auth/session";
import { canManageBilling } from "@/lib/permissions";
import { TEAM_MEMBERS } from "@/lib/team";
import { TopBar } from "@/components/layout/TopBar";
import { EquipoPanel, type TotalesMiembro } from "@/components/dashboard/EquipoPanel";
import { kpiPorPersona, quincenaActual, type LeadContactado } from "@/lib/kpi";
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
    <div className="flex items-end gap-1.5 h-20">
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
  const { user, role } = await getSession();
  const supabase = await createClient();

  // Los Socios Estratégicos no ven cobros: se les omiten las tarjetas, el
  // gráfico de ingresos y los accesos a Facturas (ver src/lib/permissions.ts).
  const showBilling = canManageBilling(role);

  const { now, eightWeeksAgo, sixMonthsAgoStr, in30days, todayStr, startOfTodayIso } = getDateRanges();
  const quincena = quincenaActual();

  const [
    leadsRes, clientsRes, messagesRes, convertedRes,
    upcomingInvoicesRes, upcomingEventsRes,
    recentLeadsRes, leadTagsRes, kpiLeadsRes, clientTagsRes,
    invoicesHistoryRes, expiringContractsRes, overdueRes,
  ] = await Promise.all([
    supabase
      .from("leads")
      .select("id", { count: "exact", head: true }),
    supabase
      .from("clients")
      .select("id", { count: "exact", head: true })
      .eq("status", "active"),
    supabase
      .from("messages")
      .select("id", { count: "exact", head: true }),
    supabase
      .from("leads")
      .select("id", { count: "exact", head: true })
      .eq("status", "converted"),
    supabase
      .from("invoices")
      .select("id, title, amount, due_date, status, type")
      .in("status", ["pending", "overdue"])
      .order("due_date", { ascending: true })
      .limit(3),
    supabase
      .from("calendar_events")
      .select("id, title, event_date, type, status")
      .eq("status", "pending")
      .gte("event_date", startOfTodayIso)
      .order("event_date", { ascending: true })
      .limit(3),
    supabase
      .from("leads")
      .select("created_at")
      .gte("created_at", eightWeeksAgo)
      .limit(2000),
    // Etiquetas de equipo, para el corte por persona
    supabase.from("leads").select("status, contacted_by, closed_by, contacted_at").limit(5000),
    // Contactos de la quincena en curso, para el KPI
    supabase
      .from("leads")
      .select("contacted_by, contact_type")
      .gte("contacted_at", quincena.desde)
      .lt("contacted_at", quincena.hasta)
      .limit(5000),
    supabase.from("clients").select("status, closed_by").limit(2000),
    supabase
      .from("invoices")
      .select("amount, status, due_date, type")
      .gte("due_date", sixMonthsAgoStr)
      .limit(2000),
    supabase
      .from("clients")
      .select("id, name, contract_end")
      .eq("status", "active")
      .not("contract_end", "is", null)
      .gte("contract_end", todayStr)
      .lte("contract_end", in30days)
      .order("contract_end", { ascending: true })
      .limit(5),
    supabase
      .from("invoices")
      .select("id", { count: "exact", head: true })
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

  // ── Cómo va cada quien ──
  // Si la migración 018 no está aplicada las columnas no existen y la query
  // falla; en ese caso se omite el bloque en vez de romper el dashboard.
  type LeadTag = {
    status: string;
    contacted_by: string | null;
    closed_by: string | null;
    contacted_at: string | null;
  };
  type ClientTag = { status: string; closed_by: string | null };
  const leadTags = (leadTagsRes.error ? [] : (leadTagsRes.data ?? [])) as LeadTag[];
  const clientTags = (clientTagsRes.error ? [] : (clientTagsRes.data ?? [])) as ClientTag[];

  const perMember: TotalesMiembro[] = TEAM_MEMBERS.map((member) => {
    // `contacted_by` dice quién TRABAJA el lead, no quién lo contactó: Raúl se
    // lo pone a todo lo que encuentra, así que contar por ahí daba 110
    // "contactados" a quien había escrito a 5. Quien de verdad fue contactado
    // es el que tiene fecha — la sella la base al etiquetarlo o al abrirle el
    // chat (migraciones 022 y 023).
    const asignados = leadTags.filter((l) => l.contacted_by === member.slug);
    const contactados = asignados.filter((l) => l.contacted_at);
    const won = leadTags.filter((l) => l.closed_by === member.slug && l.status === "converted");
    const activeClients = clientTags.filter(
      (c) => c.closed_by === member.slug && c.status === "active"
    );
    return {
      member,
      asignados: asignados.length,
      contacted: contactados.length,
      won: won.length,
      clients: activeClients.length,
      // El cierre se mide sobre lo contactado de verdad, no sobre la cartera
      rate: contactados.length > 0 ? Math.round((won.length / contactados.length) * 100) : 0,
    };
  });

  // ── Meta de la quincena ──
  // Sin la migración 022 las columnas no existen y la query falla; el bloque
  // se pinta igual, en ceros, con el aviso de que falta correrla.
  const faltaKpiMigracion = !!kpiLeadsRes.error;
  const kpiFilas = kpiPorPersona(
    (faltaKpiMigracion ? [] : (kpiLeadsRes.data ?? [])) as LeadContactado[]
  );

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
    // El dinero es solo del Dueño
    ...(showBilling
      ? [{
          title: "Ingresos del mes",
          value: formatAmount(incomeThisMonth),
          description: incomePendingThisMonth > 0 ? `${formatAmount(incomePendingThisMonth)} por cobrar` : "Todo cobrado",
          icon: DollarSign,
          color: "text-sky-600 dark:text-sky-400",
          bg: "bg-sky-50 dark:bg-sky-500/15",
        }]
      : []),
  ];

  const needsAttention = (showBilling && overdueCount > 0) || expiringContracts.length > 0;

  return (
    <>
      <TopBar title="Dashboard" userEmail={user?.email} />
      <div className="p-4 sm:p-5 space-y-3.5">
        {/* Acciones rápidas — el saludo no ocupa una franja entera */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-[13px] text-muted-foreground">
            Leads, clientes y comunicaciones de ZytonAI en un solo lugar.
          </p>
          <div className="flex gap-2">
            <Button render={<Link href="/leads" />} size="sm" variant="outline" className="gap-1.5 h-8 rounded-lg text-xs">
              <Plus className="w-3.5 h-3.5" /> Nuevo lead
            </Button>
            {showBilling && (
              <Button render={<Link href="/invoices" />} size="sm" variant="outline" className="gap-1.5 h-8 rounded-lg text-xs">
                <Receipt className="w-3.5 h-3.5" /> Facturas
              </Button>
            )}
            <Button render={<Link href="/chat" />} size="sm" className="gap-1.5 h-8 rounded-lg text-xs">
              <MessageCircle className="w-3.5 h-3.5" /> Ir al chat
            </Button>
          </div>
        </div>

        {/* Requiere atención — una franja, no una tarjeta */}
        {needsAttention && (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-3 py-2 rounded-xl ring-1 ring-amber-200 dark:ring-amber-500/30 bg-amber-50/60 dark:bg-amber-500/[0.07]">
            <span className="flex items-center gap-1.5 text-amber-700 dark:text-amber-300 font-semibold text-xs shrink-0">
              <AlertTriangle className="w-3.5 h-3.5" /> Requiere atención
            </span>
            {showBilling && overdueCount > 0 && (
              <Link href="/invoices" className="text-xs text-foreground hover:underline">
                {overdueCount} factura{overdueCount !== 1 ? "s" : ""} vencida{overdueCount !== 1 ? "s" : ""} sin pagar
              </Link>
            )}
            {expiringContracts.map((c) => (
              <Link key={c.id} href={`/clients/${c.id}`} className="text-xs text-foreground hover:underline">
                Contrato de {c.name} vence el{" "}
                {new Date(c.contract_end + "T00:00:00").toLocaleDateString("es-ES", { day: "2-digit", month: "short" })}
              </Link>
            ))}
          </div>
        )}

        {/* Métricas — una sola fila en pantalla ancha */}
        <div className={`grid grid-cols-2 lg:grid-cols-4 gap-2.5 ${showBilling ? "xl:grid-cols-5" : ""}`}>
          {stats.map((stat) => (
            <div
              key={stat.title}
              className="rounded-xl bg-card ring-1 ring-foreground/10 shadow-sm p-3"
            >
              <div className="flex items-center gap-2">
                <div className={`p-1.5 rounded-lg shrink-0 ${stat.bg}`}>
                  <stat.icon className={`w-3.5 h-3.5 ${stat.color}`} />
                </div>
                <span className="text-[11px] font-medium text-muted-foreground truncate">
                  {stat.title}
                </span>
              </div>
              <p className="text-xl font-bold text-foreground mt-1.5 tabular-nums leading-none">
                {stat.value}
              </p>
              <p className="text-[10px] text-muted-foreground mt-1 truncate">{stat.description}</p>
            </div>
          ))}
        </div>

        {/* El equipo: la meta de la quincena y el acumulado, en una tarjeta */}
        <EquipoPanel
          filas={kpiFilas}
          totales={perMember}
          quincena={quincena}
          faltaMigracion={faltaKpiMigracion}
        />

        {/* Gráficos y listas comparten una misma rejilla de dos columnas, así
            no se van apilando en franjas de ancho completo */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          <Card size="sm" className="border-0 shadow-sm gap-2">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-xs font-semibold text-muted-foreground">
                  Leads nuevos por semana
                </CardTitle>
                <Users className="w-3.5 h-3.5 text-blue-500" />
              </div>
            </CardHeader>
            <CardContent>
              <MiniBars data={weekBuckets} accentClass="bg-primary" />
            </CardContent>
          </Card>

          {showBilling && (
            <Card size="sm" className="border-0 shadow-sm gap-2">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-xs font-semibold text-muted-foreground">
                    Ingresos vs gastos por mes
                  </CardTitle>
                  <DollarSign className="w-3.5 h-3.5 text-sky-500" />
                </div>
              </CardHeader>
              <CardContent>
                <MiniBars data={monthBuckets} accentClass="bg-sky-500" secondaryClass="bg-orange-400/70" />
                <div className="flex items-center gap-3 mt-1.5">
                  <span className="flex items-center gap-1.5 text-[10px] text-muted-foreground font-medium">
                    <span className="w-2 h-2 rounded-sm bg-sky-500 inline-block" /> Ingresos (cobrado)
                  </span>
                  <span className="flex items-center gap-1.5 text-[10px] text-muted-foreground font-medium">
                    <span className="w-2 h-2 rounded-sm bg-orange-400/70 inline-block" /> Gastos (pagado)
                  </span>
                </div>
              </CardContent>
            </Card>
          )}

          {showBilling && (
            <Card size="sm" className="border-0 shadow-sm gap-2">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-xs font-semibold text-muted-foreground">
                    Próximas facturas
                  </CardTitle>
                  <Receipt className="w-3.5 h-3.5 text-orange-500" />
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                {upcomingInvoices.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Sin facturas pendientes</p>
                ) : (
                  upcomingInvoices.map((inv) => (
                    <div key={inv.id} className="flex items-center justify-between gap-2 text-xs">
                      <span className="truncate font-medium min-w-0 flex-1">{inv.title}</span>
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
                        <span className="font-mono text-[11px] tabular-nums">{formatAmount(Number(inv.amount))}</span>
                        <span className="text-muted-foreground text-[11px] tabular-nums">
                          {new Date(inv.due_date + "T00:00:00").toLocaleDateString("es-ES", {
                            day: "2-digit",
                            month: "short",
                          })}
                        </span>
                        <span
                          className={`text-[11px] font-medium ${
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
          )}

          <Card size="sm" className="border-0 shadow-sm gap-2">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-xs font-semibold text-muted-foreground">
                  Próximos eventos
                </CardTitle>
                <CalendarDays className="w-3.5 h-3.5 text-blue-500" />
              </div>
            </CardHeader>
            <CardContent className="space-y-2">
              {upcomingEvents.length === 0 ? (
                <p className="text-xs text-muted-foreground">Sin eventos próximos</p>
              ) : (
                upcomingEvents.map((ev) => (
                  <div key={ev.id} className="flex items-center justify-between gap-2 text-xs">
                    <span className="truncate font-medium min-w-0 flex-1">{ev.title}</span>
                    <span className="text-muted-foreground text-[11px] shrink-0 tabular-nums">
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
