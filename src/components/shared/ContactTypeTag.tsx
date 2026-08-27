"use client";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CONTACT_TYPES, esContactType, type ContactType } from "@/lib/kpi";
import { cn } from "@/lib/utils";

/** Valor del <Select> cuando no hay etiqueta — Radix no acepta "" */
const NONE = "none";

interface SelectProps {
  value: string | null | undefined;
  onChange: (value: ContactType | null) => void;
  disabled?: boolean;
  placeholder?: string;
}

/**
 * Cómo fue el contacto: en frío o con investigación previa del negocio.
 * Es la etiqueta que alimenta el KPI de la quincena (src/lib/kpi.ts).
 */
export function ContactTypeSelect({
  value,
  onChange,
  disabled,
  placeholder = "Sin etiquetar",
}: SelectProps) {
  return (
    <Select
      value={esContactType(value) ? value : NONE}
      onValueChange={(v) => onChange(v === NONE ? null : (v as ContactType))}
      disabled={disabled}
    >
      <SelectTrigger>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NONE}>{placeholder}</SelectItem>
        {(Object.keys(CONTACT_TYPES) as ContactType[]).map((t) => (
          <SelectItem key={t} value={t}>
            <span className="flex items-center gap-2">
              <span className={cn("w-2 h-2 rounded-full shrink-0", CONTACT_TYPES[t].dot)} />
              {CONTACT_TYPES[t].corto}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** Badge del tipo de contacto. Sin etiqueta no pinta nada. */
export function ContactTypeBadge({
  value,
  className,
}: {
  value: string | null | undefined;
  className?: string;
}) {
  if (!esContactType(value)) return null;
  const t = CONTACT_TYPES[value];

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold tracking-tight ring-1",
        t.badge,
        className
      )}
      title={t.label}
    >
      <span className={cn("w-1.5 h-1.5 rounded-full shrink-0", t.dot)} />
      {t.corto}
    </span>
  );
}
