import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CONTACT_TYPES, META_QUINCENA, type FilaKpi, type Quincena } from "@/lib/kpi";
import { CheckCircle2, Target } from "lucide-react";
import { cn } from "@/lib/utils";

function Barra({ hecho, meta, className }: { hecho: number; meta: number; className: string }) {
  const pct = Math.min(100, Math.round((hecho / meta) * 100));
  return (
    <div className="h-1.5 rounded-full bg-muted overflow-hidden">
      <div className={cn("h-full rounded-full transition-all", className)} style={{ width: `${pct}%` }} />
    </div>
  );
}

function Meta({ hecho, meta, label, dot }: { hecho: number; meta: number; label: string; dot: string }) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2 text-[11px]">
        <span className="flex items-center gap-1.5 text-muted-foreground font-medium truncate">
          <span className={cn("w-1.5 h-1.5 rounded-full shrink-0", dot)} />
          {label}
        </span>
        <span className="font-semibold tabular-nums shrink-0">
          {hecho}
          <span className="text-muted-foreground font-normal">/{meta}</span>
        </span>
      </div>
      <Barra hecho={hecho} meta={meta} className={dot} />
    </div>
  );
}

/**
 * Cómo va cada quien contra la meta de la quincena: 30 contactos, de los
 * cuales 25 en frío y 5 con investigación previa del negocio.
 *
 * Lo ven los cuatro — la meta es del equipo, no un dato de dinero.
 */
export function KpiQuincena({
  filas,
  quincena,
  faltaMigracion = false,
}: {
  filas: FilaKpi[];
  quincena: Quincena;
  /** Sin la migración 022 no hay columnas que contar */
  faltaMigracion?: boolean;
}) {
  return (
    <Card className="border-0 shadow-sm">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Target className="w-4 h-4" />
              Meta de la quincena · {META_QUINCENA.total} contactos por persona
            </CardTitle>
            <p className="text-[11px] text-muted-foreground/80 mt-1">
              {META_QUINCENA.frio} en frío y {META_QUINCENA.investigado} con investigación previa del negocio.
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs font-semibold tabular-nums">{quincena.etiqueta}</p>
            <p className="text-[11px] text-muted-foreground">
              {quincena.diasRestantes === 1 ? "último día" : `quedan ${quincena.diasRestantes} días`}
            </p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {faltaMigracion && (
          <p className="text-[11px] text-amber-600 dark:text-amber-400">
            Falta correr la migración 022 en Supabase — hasta entonces no hay nada que contar.
          </p>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {filas.map(({ member, total, frio, investigado, sinEtiqueta, cumplido }) => (
            <div
              key={member.slug}
              className={cn(
                "rounded-xl p-3.5 ring-1 space-y-3",
                cumplido
                  ? "ring-emerald-300/70 dark:ring-emerald-500/30 bg-emerald-50/40 dark:bg-emerald-500/[0.06]"
                  : "ring-black/[0.05] dark:ring-white/[0.08]"
              )}
            >
              <div className="flex items-center gap-2">
                <span className={cn("w-2 h-2 rounded-full shrink-0", member.dot)} />
                <span className="text-sm font-semibold truncate">{member.name}</span>
                {cumplido && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />}
                <span className="ml-auto text-sm font-bold tabular-nums shrink-0">
                  {total}
                  <span className="text-muted-foreground font-medium text-xs">/{META_QUINCENA.total}</span>
                </span>
              </div>

              <Barra hecho={total} meta={META_QUINCENA.total} className={member.dot} />

              <div className="space-y-2">
                <Meta
                  hecho={frio}
                  meta={CONTACT_TYPES.frio.meta}
                  label={CONTACT_TYPES.frio.corto}
                  dot={CONTACT_TYPES.frio.dot}
                />
                <Meta
                  hecho={investigado}
                  meta={CONTACT_TYPES.investigado.meta}
                  label={CONTACT_TYPES.investigado.corto}
                  dot={CONTACT_TYPES.investigado.dot}
                />
              </div>

              {sinEtiqueta > 0 && (
                <p className="text-[11px] text-amber-600 dark:text-amber-400 font-medium">
                  {sinEtiqueta} sin etiquetar
                </p>
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
