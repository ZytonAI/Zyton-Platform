"use client";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TEAM_MEMBERS, memberBySlug } from "@/lib/team";
import { cn } from "@/lib/utils";

/** Valor del <Select> cuando la etiqueta está vacía — Radix no acepta "" */
const NONE = "none";

interface SelectProps {
  value: string | null | undefined;
  onChange: (value: string | null) => void;
  /** Texto cuando no hay nadie asignado */
  placeholder?: string;
  disabled?: boolean;
}

/**
 * Desplegable con los miembros del equipo. Se usa para las etiquetas de
 * "quién contactó / cerró / va a programar" en leads y clientes.
 */
export function MemberSelect({ value, onChange, placeholder = "Sin asignar", disabled }: SelectProps) {
  return (
    <Select
      value={value ?? NONE}
      onValueChange={(v) => onChange(v === NONE ? null : v)}
      disabled={disabled}
    >
      <SelectTrigger>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NONE}>{placeholder}</SelectItem>
        {TEAM_MEMBERS.map((m) => (
          <SelectItem key={m.slug} value={m.slug}>
            <span className="flex items-center gap-2">
              <span className={cn("w-2 h-2 rounded-full shrink-0", m.dot)} />
              {m.name}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

interface TagProps {
  /** Slug del miembro (samuel, camilo, …) */
  slug: string | null | undefined;
  /** Qué rol representa la etiqueta: "Contactó", "Cerró", "Programa" */
  label?: string;
  className?: string;
}

/**
 * Badge con el color de la persona. Si no hay nadie asignado no pinta nada,
 * para no llenar las listas de ruido.
 */
export function MemberBadge({ slug, label, className }: TagProps) {
  const member = memberBySlug(slug ?? "");
  if (!member) return null;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium",
        "bg-muted/60 border-border text-foreground/80",
        className
      )}
      title={label ? `${label}: ${member.name}` : member.name}
    >
      <span className={cn("w-1.5 h-1.5 rounded-full shrink-0", member.dot)} />
      {label && <span className="text-muted-foreground">{label}</span>}
      {member.name}
    </span>
  );
}

/** Las tres etiquetas de un lead / las dos de un cliente, en fila. */
export function MemberBadges({
  tags,
  className,
}: {
  tags: { label: string; slug: string | null | undefined }[];
  className?: string;
}) {
  const visible = tags.filter((t) => memberBySlug(t.slug ?? ""));
  if (visible.length === 0) return null;

  return (
    <div className={cn("flex flex-wrap items-center gap-1.5", className)}>
      {visible.map((t) => (
        <MemberBadge key={t.label} slug={t.slug} label={t.label} />
      ))}
    </div>
  );
}
