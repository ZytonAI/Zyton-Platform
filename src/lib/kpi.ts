import { TEAM_MEMBERS, type TeamMember, type TeamSlug } from "@/lib/team";

/**
 * KPI comercial: 30 contactos por persona cada quincena.
 *
 *   25 en frío           — se escribe sin haber mirado el negocio antes
 *    5 con investigación — se revisó el negocio antes de escribir
 *
 * El dato vive en `leads.contact_type` y `leads.contacted_at` (migración 022).
 */

export type ContactType = "frio" | "investigado";

export const META_QUINCENA = {
  total: 30,
  frio: 25,
  investigado: 5,
} as const;

export const CONTACT_TYPES: Record<ContactType, { label: string; corto: string; meta: number; dot: string; badge: string }> = {
  frio: {
    label: "Contacto en frío",
    corto: "En frío",
    meta: META_QUINCENA.frio,
    dot: "bg-sky-500",
    badge: "bg-sky-50 text-sky-600 ring-sky-100 dark:bg-sky-500/15 dark:text-sky-300 dark:ring-sky-500/25",
  },
  investigado: {
    label: "Contacto con investigación",
    corto: "Con investigación",
    meta: META_QUINCENA.investigado,
    dot: "bg-violet-500",
    badge: "bg-violet-50 text-violet-600 ring-violet-100 dark:bg-violet-500/15 dark:text-violet-300 dark:ring-violet-500/25",
  },
};

export const CONTACT_TYPE_VALUES = Object.keys(CONTACT_TYPES) as [ContactType, ...ContactType[]];

// ── La quincena ──────────────────────────────────────────────
// Del 1 al 15 y del 16 a fin de mes, hora de Colombia. Colombia no tiene
// horario de verano, así que el desfase es siempre -05:00.
const OFFSET_COLOMBIA = "-05:00";
const ZONA_COLOMBIA = "America/Bogota";

const MESES = [
  "ene", "feb", "mar", "abr", "may", "jun",
  "jul", "ago", "sep", "oct", "nov", "dic",
];

/** Y/M/D tal como se ven en Colombia, sin importar dónde corra el servidor. */
function hoyEnColombia(ahora: Date): { anio: number; mes: number; dia: number } {
  const [anio, mes, dia] = new Intl.DateTimeFormat("en-CA", {
    timeZone: ZONA_COLOMBIA,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .format(ahora)
    .split("-")
    .map(Number);
  return { anio, mes, dia };
}

function medianoche(anio: number, mes: number, dia: number): string {
  const m = String(mes).padStart(2, "0");
  const d = String(dia).padStart(2, "0");
  return `${anio}-${m}-${d}T00:00:00${OFFSET_COLOMBIA}`;
}

export interface Quincena {
  /** Inicio inclusivo, ISO con zona */
  desde: string;
  /** Fin exclusivo, ISO con zona */
  hasta: string;
  /** "16 – 31 ago" */
  etiqueta: string;
  /** Días que quedan, contando hoy */
  diasRestantes: number;
}

/** La quincena en curso. */
export function quincenaActual(ahora: Date = new Date()): Quincena {
  const { anio, mes, dia } = hoyEnColombia(ahora);
  const primeraMitad = dia <= 15;

  const desde = medianoche(anio, mes, primeraMitad ? 1 : 16);
  const hasta = primeraMitad
    ? medianoche(anio, mes, 16)
    : mes === 12
      ? medianoche(anio + 1, 1, 1)
      : medianoche(anio, mes + 1, 1);

  // Último día de la quincena, para la etiqueta: el día anterior a `hasta`
  const ultimoDia = primeraMitad ? 15 : new Date(Date.UTC(anio, mes, 0)).getUTCDate();

  return {
    desde,
    hasta,
    etiqueta: `${primeraMitad ? 1 : 16} – ${ultimoDia} ${MESES[mes - 1]}`,
    diasRestantes: ultimoDia - dia + 1,
  };
}

// ── El corte por persona ─────────────────────────────────────

export interface FilaKpi {
  member: TeamMember;
  /** Lo que cuenta para la meta: solo los contactos etiquetados */
  total: number;
  frio: number;
  investigado: number;
  /**
   * Contactados en la quincena a los que no les pusieron etiqueta. NO suman
   * para la meta — están aquí para avisar que falta clasificarlos.
   */
  sinEtiqueta: number;
  /** Avance sobre los 30, tope 100 */
  pct: number;
  cumplido: boolean;
}

export interface LeadContactado {
  contacted_by: string | null;
  contact_type: string | null;
}

/**
 * Cuántos contactos lleva cada quien en la quincena.
 *
 * Lo que cuenta es la ETIQUETA, no la fecha: un contacto sin etiquetar no
 * suma ni en el total ni en ninguna de las dos metas, así que quitarle la
 * etiqueta a un lead lo descuenta de las dos cuentas a la vez. Los leads sin
 * `contacted_by` no son de nadie y no suman para ninguna meta.
 */
export function kpiPorPersona(leads: LeadContactado[]): FilaKpi[] {
  return TEAM_MEMBERS.map((member) => {
    const suyos = leads.filter((l) => l.contacted_by === member.slug);
    const frio = suyos.filter((l) => l.contact_type === "frio").length;
    const investigado = suyos.filter((l) => l.contact_type === "investigado").length;
    const total = frio + investigado;
    return {
      member,
      total,
      frio,
      investigado,
      sinEtiqueta: suyos.length - total,
      pct: Math.min(100, Math.round((total / META_QUINCENA.total) * 100)),
      cumplido:
        investigado >= META_QUINCENA.investigado && frio >= META_QUINCENA.frio,
    };
  });
}

/** Slugs con tipo, para el desplegable de la ficha del lead. */
export function esContactType(v: unknown): v is ContactType {
  return v === "frio" || v === "investigado";
}

export type { TeamSlug };
