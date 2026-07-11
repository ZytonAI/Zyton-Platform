import type { HistoryEvent } from "@/types";
import { Clock } from "lucide-react";

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
        <div key={event.id} className="flex gap-3">
          <div className="text-base shrink-0 mt-0.5">
            {EVENT_ICONS[event.event_type] ?? "📌"}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm text-foreground whitespace-pre-wrap">{event.description}</p>
            <div className="flex items-center gap-1 mt-0.5 text-xs text-muted-foreground">
              <Clock className="w-3 h-3" />
              {formatDate(event.created_at)}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
