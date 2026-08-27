"use client";

import { useState } from "react";
import { toast } from "sonner";
import {
  Search, Play, Loader2, CheckCircle2, Phone, AlertCircle, MapPin,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { MemberSelect } from "@/components/shared/MemberTag";
import { useMySlug } from "@/components/layout/SessionContext";
import { Label } from "@/components/ui/label";
import type { AgentEvent, Lead } from "@/types";

// ─── SSE helper ──────────────────────────────────────────────
async function* readSSE(url: string, body: object): AsyncGenerator<AgentEvent> {
  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!resp.ok || !resp.body) {
    yield { type: "error", message: await resp.text() };
    return;
  }
  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (line.startsWith("data: ")) {
        try { yield JSON.parse(line.slice(6)) as AgentEvent; } catch { /* skip */ }
      }
    }
  }
}

// ─── Status log ───────────────────────────────────────────────
function StatusLog({ logs, running }: { logs: string[]; running: boolean }) {
  if (!logs.length) return null;
  return (
    <div className="mt-3 space-y-1 max-h-40 overflow-y-auto">
      {logs.map((msg, i) => (
        <div key={i} className="flex items-start gap-2 text-xs text-muted-foreground">
          <span className="mt-0.5 shrink-0">
            {running && i === logs.length - 1
              ? <Loader2 className="w-3 h-3 animate-spin text-blue-500" />
              : <CheckCircle2 className="w-3 h-3 text-emerald-500" />}
          </span>
          <span>{msg}</span>
        </div>
      ))}
    </div>
  );
}

// ─── RAÚL — Lead Finder ───────────────────────────────────────
function RaulAgent() {
  const [tipo, setTipo] = useState("");
  const [ciudad, setCiudad] = useState("");
  // Los leads nuevos quedan a nombre de alguien; por defecto, de quien lanza
  // la búsqueda. Sin esto entran sin dueño y no aparecen en la vista de nadie.
  const mySlug = useMySlug();
  const [assignTo, setAssignTo] = useState<string | null>(mySlug);
  const [running, setRunning] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  const [results, setResults] = useState<Lead[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    if (!tipo.trim() || !ciudad.trim()) { toast.error("Completa tipo y ciudad"); return; }
    setRunning(true); setLogs([]); setResults([]); setError(null);
    try {
      for await (const event of readSSE("/api/agents/raul", { tipo, ciudad, assign_to: assignTo })) {
        if (event.type === "status") {
          setLogs((p) => [...p, event.message ?? ""]);
        } else if (event.type === "result") {
          setResults(event.leads ?? []);
          const e = event as { saved?: number; sinContacto?: number; sinWeb?: number; conWeb?: number };
          setLogs((p) => [
            ...p,
            `✓ ${e.saved} leads guardados — ${e.conWeb} con web, ${e.sinWeb} sin web`,
            e.sinContacto ? `ℹ ${e.sinContacto} omitidos por no tener número de contacto` : "",
          ].filter(Boolean));
          toast.success(`${e.saved} leads guardados en el CRM`);
        } else if (event.type === "error") {
          setError(event.message ?? "Error"); toast.error(event.message);
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg); toast.error(msg);
    } finally { setRunning(false); }
  }

  return (
    <Card className="border-0 shadow-sm w-full max-w-xl">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-100 dark:bg-blue-500/15 flex items-center justify-center">
            <Search className="w-5 h-5 text-blue-600 dark:text-blue-400" />
          </div>
          <div>
            <CardTitle className="text-base">Raúl</CardTitle>
            <p className="text-xs text-muted-foreground">Lead Finder · Google Places via Apify</p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="tipo" className="text-xs">Tipo de negocio</Label>
            <Input id="tipo" value={tipo} onChange={(e) => setTipo(e.target.value)}
              placeholder="dentistas, restaurantes, gimnasios..." disabled={running} className="h-9 text-sm" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ciudad" className="text-xs">Ciudad</Label>
            <Input id="ciudad" value={ciudad} onChange={(e) => setCiudad(e.target.value)}
              placeholder="Medellín Colombia" disabled={running} className="h-9 text-sm" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Asignar a</Label>
            <MemberSelect value={assignTo} onChange={setAssignTo} disabled={running} />
            <p className="text-[11px] text-muted-foreground">
              Queda como responsable de contactarlos y verá sus chats de WhatsApp.
            </p>
          </div>
        </div>

        <Button onClick={run} disabled={running} className="w-full gap-2" size="sm">
          {running ? <><Loader2 className="w-4 h-4 animate-spin" /> Buscando...</>
                   : <><Play className="w-4 h-4" /> Buscar leads</>}
        </Button>

        {error && (
          <div className="flex items-start gap-2 text-xs text-destructive bg-destructive/10 rounded-lg p-3">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" /><span>{error}</span>
          </div>
        )}

        <StatusLog logs={logs} running={running} />

        {results.length > 0 && (
          <div className="space-y-2 mt-1">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              {results.length} lead{results.length !== 1 ? "s" : ""} guardado{results.length !== 1 ? "s" : ""}
            </p>
            <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
              {results.map((lead) => (
                <div key={lead.id} className="border rounded-lg p-2.5 text-xs space-y-1">
                  <p className="font-semibold text-sm text-foreground truncate">{lead.name}</p>
                  {lead.phone && (
                    <div className="flex items-center gap-1.5 text-muted-foreground">
                      <Phone className="w-3 h-3" /> {lead.phone}
                    </div>
                  )}
                  {lead.notes && (
                    <div className="flex items-center gap-1.5 text-muted-foreground">
                      <MapPin className="w-3 h-3" />{lead.notes}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Main ─────────────────────────────────────────────────────
export function AgentsPageClient() {
  return (
    <div className="p-6 space-y-5 max-w-6xl">
      <RaulAgent />
      <p className="text-xs text-muted-foreground max-w-xl">
        Raúl busca negocios en Google Places y los guarda como leads nuevos, a nombre
        de quien se le indique. Desde ahí se trabajan en la sección Leads.
      </p>
    </div>
  );
}
