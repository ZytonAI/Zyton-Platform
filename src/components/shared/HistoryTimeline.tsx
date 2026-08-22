"use client";

import type { HistoryEvent } from "@/types";
import { Clock } from "lucide-react";
import { useMemberById } from "@/components/layout/SessionContext";
import { cn } from "@/lib/utils";

interface Props {
  events: HistoryEvent[];
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString("es-ES", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

const EVENT_ICONS: Record<string, string> = {
  created: "🟢",
  status_change: "🔄",
  converted: "⭐",
  note_added: "📝",
  file_uploaded: "📎",
};

export function HistoryTimeline({ events }: Props) {
  if (events.length === 0) {
    return (
      <p className="text-sm text-muted-foreground text-center py-4">
        Sin historial aún
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {events.map((event) => (
        <HistoryRow key={event.id} event={event} />
      ))}
    </div>
  );
}

/** Una entrada del historial: qué pasó, quién lo hizo y cuándo. */
function HistoryRow({ event }: { event: HistoryEvent }) {
  const author = useMemberById(event.owner_id);

  return (
    <div className="flex gap-3">
      <div className="text-base shrink-0 mt-0.5">
        {EVENT_ICONS[event.event_type] ?? "📌"}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-foreground whitespace-pre-wrap">{event.description}</p>
        <div className="flex items-center gap-2 mt-0.5 text-xs text-muted-foreground">
          {author && (
            <span className="inline-flex items-center gap-1 font-medium text-foreground/70">
              <span className={cn("w-1.5 h-1.5 rounded-full", author.dot)} />
              {author.name}
            </span>
          )}
          <span className="inline-flex items-center gap-1">
            <Clock className="w-3 h-3" />
            {formatDate(event.created_at)}
          </span>
        </div>
      </div>
    </div>
  );
}
