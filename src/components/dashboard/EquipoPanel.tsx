import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CONTACT_TYPES, META_QUINCENA, type FilaKpi, type Quincena } from "@/lib/kpi";
import type { TeamMember } from "@/lib/team";
import { CheckCircle2, Target } from "lucide-react";
import { cn } from "@/lib/utils";

/** Cómo va el acumulado histórico de una persona, aparte de la quincena. */
export interface TotalesMiembro {
  member: TeamMember;
  contacted: number;
  won: number;
  clients: number;
  rate: number;
}

function Barra({ hecho, meta, className }: { hecho: number; meta: number; className: string }) {
  return (
    <div className="h-1.5 rounded-full bg-muted overflow-hidden">
      <div
        className={cn("h-full rounded-full", className)}
        style={{ width: `${Math.min(100, Math.round((hecho / meta) * 100))}%` }}
      />
    </div>
  );
}

/** Una sub-meta en una sola línea: etiqueta, cuenta y barra a la derecha. */
function SubMeta({ hecho, meta, label, dot }: { hecho: number; meta: number; label: string; dot: string }) {
  return (
    <div className="flex items-center gap-2 text-[10px]">
      <span className={cn("w-1.5 h-1.5 rounded-full shrink-0", dot)} />
      <span className="text-muted-foreground font-medium shrink-0">{label}</span>
      <span className="font-semibold tabular-nums shrink-0">
        {hecho}
        <span className="text-muted-foreground font-normal">/{meta}</span>
      </span>
      <div className="flex-1 min-w-8">
        <Barra hecho={hecho} meta={meta} className={dot} />
      </div>
    </div>
  );
}

/**
 * El equipo en una sola tarjeta: la meta de la quincena arriba y el acumulado
 * de siempre abajo. Antes eran dos bloques con las mismas cuatro personas,
 * uno debajo del otro, y se comían media pantalla.
 *
 * Lo ven los cuatro — la meta es del equipo, no un dato de dinero.
 */
export function EquipoPanel({
  filas,
  totales,
  quincena,
  faltaMigracion = false,
}: {
  filas: FilaKpi[];
  totales: TotalesMiembro[];
  quincena: Quincena;
  /** Sin la migración 022 no hay columnas que contar */
  faltaMigracion?: boolean;
}) {
  const porSlug = new Map(totales.map((t) => [t.member.slug, t]));

  return (
    <Card size="sm" className="border-0 shadow-sm gap-2">
      <CardHeader>
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <CardTitle className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
            <Target className="w-3.5 h-3.5" />
            Meta de la quincena · {META_QUINCENA.total} contactos por persona
          </CardTitle>
          <p className="text-[11px] text-muted-foreground tabular-nums">
            {quincena.etiqueta} ·{" "}
            {quincena.diasRestantes === 1 ? "último día" : `quedan ${quincena.diasRestantes} días`}
          </p>
        </div>
        {faltaMigracion && (
          <p className="text-[11px] text-amber-600 dark:text-amber-400 mt-1">
            Falta correr la migración 022 en Supabase — hasta entonces no hay nada que contar.
          </p>
        )}
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
          {filas.map(({ member, total, frio, investigado, sinEtiqueta, cumplido }) => {
            const t = porSlug.get(member.slug);
            return (
              <div
                key={member.slug}
                className={cn(
                  "rounded-xl p-3 ring-1 space-y-2",
                  cumplido
                    ? "ring-emerald-300/70 dark:ring-emerald-500/30 bg-emerald-50/40 dark:bg-emerald-500/[0.06]"
                    : "ring-black/[0.05] dark:ring-white/[0.08]"
                )}
              >
                <div className="flex items-center gap-1.5">
                  <span className={cn("w-2 h-2 rounded-full shrink-0", member.dot)} />
                  <span className="text-[13px] font-semibold truncate">{member.name}</span>
                  {cumplido && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />}
                  <span className="ml-auto text-sm font-bold tabular-nums shrink-0">
                    {total}
                    <span className="text-muted-foreground font-medium text-[11px]">
                      /{META_QUINCENA.total}
                    </span>
                  </span>
                </div>

                <Barra hecho={total} meta={META_QUINCENA.total} className={member.dot} />

                <div className="space-y-1">
                  <SubMeta
                    hecho={frio}
                    meta={CONTACT_TYPES.frio.meta}
                    label={CONTACT_TYPES.frio.corto}
                    dot={CONTACT_TYPES.frio.dot}
                  />
                  <SubMeta
                    hecho={investigado}
                    meta={CONTACT_TYPES.investigado.meta}
                    label={CONTACT_TYPES.investigado.corto}
                    dot={CONTACT_TYPES.investigado.dot}
                  />
                </div>

                {sinEtiqueta > 0 && (
                  <p
                    className="text-[10px] text-amber-600 dark:text-amber-400 font-medium"
                    title="Contactados pero sin clasificar como en frío o con investigación. Hasta que se etiqueten no suman para la meta."
                  >
                    {sinEtiqueta} sin etiquetar · no cuentan
                  </p>
                )}

                {/* Acumulado de siempre — el corte histórico, no la quincena */}
                {t && (
                  <dl className="flex items-center gap-x-2.5 gap-y-0.5 flex-wrap pt-2 border-t border-border/60 text-[10px] text-muted-foreground">
                    <div className="flex items-center gap-1">
                      <dt>Contactados</dt>
                      <dd className="font-semibold text-foreground tabular-nums">{t.contacted}</dd>
                    </div>
                    <div className="flex items-center gap-1">
                      <dt>Cerrados</dt>
                      <dd className="font-semibold text-foreground tabular-nums">{t.won}</dd>
                    </div>
                    <div className="flex items-center gap-1">
                      <dt>Clientes</dt>
                      <dd className="font-semibold text-foreground tabular-nums">{t.clients}</dd>
                    </div>
                    <span className="ml-auto font-semibold text-foreground tabular-nums">{t.rate}%</span>
                  </dl>
                )}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
