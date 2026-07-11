"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { StickyNote, Loader2 } from "lucide-react";
import { toast } from "sonner";
import type { HistoryEvent } from "@/types";

interface Props {
  /** "lead" o "client" — determina el endpoint */
  entityType: "lead" | "client";
  entityId: string;
  onAdded: (event: HistoryEvent) => void;
}

export function AddNote({ entityType, entityId, onAdded }: Props) {
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSubmit() {
    if (!note.trim() || saving) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/${entityType}s/${entityId}/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note: note.trim() }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error ?? "Error guardando la nota");
        return;
      }
      const saved: HistoryEvent = await res.json();
      onAdded(saved);
      setNote("");
      toast.success("Nota agregada al historial");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-2">
      <Textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Escribe una nota... (llamada, acuerdo, seguimiento)"
        rows={2}
        className="text-sm resize-none"
      />
      <Button
        size="sm"
        variant="outline"
        className="w-full gap-2"
        onClick={handleSubmit}
        disabled={!note.trim() || saving}
      >
        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <StickyNote className="w-4 h-4" />}
        {saving ? "Guardando..." : "Agregar nota"}
      </Button>
    </div>
  );
}
