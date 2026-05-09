"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import {
  Search,
  Sparkles,
  Play,
  ChevronRight,
  ExternalLink,
  Loader2,
  CheckCircle2,
  Phone,
  Globe,
  AlertCircle,
  MapPin,
  BarChart2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/client";
import type { AgentEvent, Lead, WebAnalysis } from "@/types";

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
function RaulAgent({ onLeadsAdded }: { onLeadsAdded: () => void }) {
  const [tipo, setTipo] = useState("");
  const [ciudad, setCiudad] = useState("");
  const [running, setRunning] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  const [results, setResults] = useState<Lead[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    if (!tipo.trim() || !ciudad.trim()) { toast.error("Completa tipo y ciudad"); return; }
    setRunning(true); setLogs([]); setResults([]); setError(null);
    try {
      for await (const event of readSSE("/api/agents/raul", { tipo, ciudad })) {
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
          onLeadsAdded();
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
    <Card className="border-0 shadow-sm flex-1">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center">
            <Search className="w-5 h-5 text-blue-600" />
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
              {results.length} leads encontrados
            </p>
            <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
              {results.map((lead) => (
                <div key={lead.id} className="border rounded-lg p-2.5 text-xs space-y-1">
                  <div className="font-semibold text-sm text-gray-900 truncate">{lead.name}</div>
                  {lead.phone && (
                    <div className="flex items-center gap-1.5 text-muted-foreground">
                      <Phone className="w-3 h-3" /> {lead.phone}
                    </div>
                  )}
                  {lead.website && (
                    <div className={`flex items-center gap-1.5 truncate ${lead.website === "Sin página web" ? "text-amber-500" : "text-muted-foreground"}`}>
                      <Globe className="w-3 h-3 shrink-0" />{lead.website}
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

// ─── ELISA — Web Analyzer ─────────────────────────────────────
interface ElisaResult {
  id: string;
  name: string;
  puntaje: number;
  report_url: string | null;
  html: string;
}

function ElisaAgent({ refreshTrigger }: { refreshTrigger: number }) {
  const [stats, setStats] = useState<{ pending: number; done: number } | null>(null);
  const [running, setRunning] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  const [results, setResults] = useState<ElisaResult[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [allDone, setAllDone] = useState(false);

  const loadStats = useCallback(async () => {
    const supabase = createClient();
    const base = supabase.from("leads").select("*", { count: "exact", head: true })
      .eq("source", "raul");

    const [{ count: pending }, { count: done }] = await Promise.all([
      base.eq("analyzed", false).not("website", "is", null).neq("website", "Sin página web"),
      base.eq("analyzed", true),
    ]);

    setStats({ pending: pending ?? 0, done: done ?? 0 });
  }, []);

  useEffect(() => { loadStats(); }, [loadStats, refreshTrigger]);

  async function run() {
    setRunning(true); setLogs([]); setResults([]); setError(null); setAllDone(false);
    try {
      for await (const event of readSSE("/api/agents/elisa", {})) {
        if (event.type === "status" || event.type === "progress") {
          setLogs((p) => [...p, event.message ?? ""]);
        } else if (event.type === "result") {
          const e = event as { analyzed?: number; skipped?: number; results?: ElisaResult[]; allDone?: boolean };
          if (e.allDone) {
            setAllDone(true);
            setLogs((p) => [...p, "✓ Todos los leads ya estaban analizados"]);
          } else {
            setResults(e.results ?? []);
            setLogs((p) => [...p, `✓ ${e.analyzed} analizados, ${e.skipped} omitidos`]);
            toast.success(`${e.analyzed} informes generados`);
          }
          await loadStats();
        } else if (event.type === "error") {
          setError(event.message ?? "Error"); toast.error(event.message);
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg); toast.error(msg);
    } finally { setRunning(false); }
  }

  const noPending = stats !== null && stats.pending === 0;
  const noLeads = stats !== null && stats.pending === 0 && stats.done === 0;

  return (
    <Card className="border-0 shadow-sm flex-1">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-violet-100 flex items-center justify-center">
            <Sparkles className="w-5 h-5 text-violet-600" />
          </div>
          <div>
            <CardTitle className="text-base">Elisa</CardTitle>
            <p className="text-xs text-muted-foreground">Web Analyzer · GPT-4o mini → Informe PDF</p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Stats */}
        {stats && (
          <div className="flex gap-3">
            <div className="flex-1 bg-violet-50 rounded-lg p-3 text-center">
              <p className="text-2xl font-bold text-violet-700">{stats.pending}</p>
              <p className="text-xs text-muted-foreground mt-0.5">Pendientes</p>
            </div>
            <div className="flex-1 bg-emerald-50 rounded-lg p-3 text-center">
              <p className="text-2xl font-bold text-emerald-700">{stats.done}</p>
              <p className="text-xs text-muted-foreground mt-0.5">Analizados</p>
            </div>
          </div>
        )}

        {/* Status messages */}
        {noLeads ? (
          <p className="text-xs text-muted-foreground text-center py-2">
            Raúl aún no ha generado leads. Ejecútalo primero.
          </p>
        ) : noPending && !running ? (
          <div className="flex items-center gap-2 text-xs text-emerald-600 bg-emerald-50 rounded-lg p-3">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            Todos los leads están analizados.
          </div>
        ) : null}

        <Button
          onClick={run}
          disabled={running || noPending || noLeads}
          className="w-full gap-2 bg-violet-600 hover:bg-violet-700"
          size="sm"
        >
          {running
            ? <><Loader2 className="w-4 h-4 animate-spin" /> Analizando...</>
            : <><Play className="w-4 h-4" /> Generar informes</>}
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
              Informes generados
            </p>
            <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
              {results.map((r) => (
                <div key={r.id} className="border rounded-lg p-2.5 text-xs space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-sm text-gray-900 truncate">{r.name}</span>
                    <span className="flex items-center gap-1 text-muted-foreground shrink-0">
                      <BarChart2 className="w-3 h-3" /> {r.puntaje}/100
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" className="flex-1 h-7 text-xs gap-1"
                      onClick={() => {
                        const blob = new Blob([r.html], { type: "text/html" });
                        window.open(URL.createObjectURL(blob), "_blank");
                      }}>
                      <ExternalLink className="w-3 h-3" /> Ver informe
                    </Button>
                    {r.report_url && (
                      <Button variant="outline" size="sm" className="flex-1 h-7 text-xs gap-1"
                        onClick={() => window.open(`/leads/${r.id}`, "_blank")}>
                        Ver lead
                      </Button>
                    )}
                  </div>
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
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  return (
    <div className="p-6 space-y-6 max-w-5xl">
      <div className="flex items-center gap-3 text-sm text-muted-foreground">
        <span className="flex items-center gap-1.5 font-medium text-gray-700">
          <Search className="w-4 h-4 text-blue-500" /> Raúl
        </span>
        <ChevronRight className="w-4 h-4" />
        <span className="flex items-center gap-1.5 font-medium text-gray-700">
          <Sparkles className="w-4 h-4 text-violet-500" /> Elisa
        </span>
        <ChevronRight className="w-4 h-4" />
        <span className="text-gray-500">Lead en CRM + Informe HTML/PDF</span>
      </div>

      <div className="flex gap-5 items-start">
        <RaulAgent onLeadsAdded={() => setRefreshTrigger((n) => n + 1)} />
        <ElisaAgent refreshTrigger={refreshTrigger} />
      </div>

      <p className="text-xs text-muted-foreground">
        Raúl busca negocios con número de contacto en Google Places (sin contacto = omitido, sin web = guardado sin análisis).
        Elisa analiza automáticamente los leads con página web que no hayan sido procesados, genera el informe con IA y lo adjunta al lead.
      </p>
    </div>
  );
}
