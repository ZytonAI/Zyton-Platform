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
  Wand2,
  Copy,
  Check,
  FileText,
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

        {results.length > 0 && (() => {
          const accionables = results.filter(
            (l) => l.website === "Sin página web" || l.analyzed
          );
          const pendientes = results.length - accionables.length;
          return (
            <div className="space-y-2 mt-1">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  {accionables.length} accionables
                </p>
                {pendientes > 0 && (
                  <span className="text-xs text-muted-foreground">
                    {pendientes} esperando a Elisa
                  </span>
                )}
              </div>
              {accionables.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-3">
                  Todos los leads tienen web — Elisa los analizará.
                </p>
              ) : (
                <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                  {accionables.map((lead) => (
                    <div key={lead.id} className="border rounded-lg p-2.5 text-xs space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-sm text-gray-900 truncate">{lead.name}</span>
                        {lead.analyzed ? (
                          <span className="shrink-0 text-xs bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded">
                            Con informe
                          </span>
                        ) : (
                          <span className="shrink-0 text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded">
                            Sin web
                          </span>
                        )}
                      </div>
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
              )}
            </div>
          );
        })()}
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

function ElisaAgent({ refreshTrigger, onDone }: { refreshTrigger: number; onDone?: () => void }) {
  const [stats, setStats] = useState<{ pending: number; done: number; noWeb: number } | null>(null);
  const [running, setRunning] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  const [results, setResults] = useState<ElisaResult[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [allDone, setAllDone] = useState(false);

  const loadStats = useCallback(async () => {
    try {
      const supabase = createClient();

      // 3 queries independientes — sin reusar el builder para evitar bugs de chaining
      const [pendingRes, doneRes, totalPendingRes] = await Promise.all([
        supabase.from("leads").select("*", { count: "exact", head: true })
          .eq("source", "raul").eq("analyzed", false)
          .not("website", "is", null).neq("website", "Sin página web"),
        supabase.from("leads").select("*", { count: "exact", head: true })
          .eq("source", "raul").eq("analyzed", true),
        supabase.from("leads").select("*", { count: "exact", head: true })
          .eq("source", "raul").eq("analyzed", false),
      ]);

      const pending = pendingRes.count ?? 0;
      const done = doneRes.count ?? 0;
      const noWeb = Math.max(0, (totalPendingRes.count ?? 0) - pending);

      setStats({ pending, done, noWeb });
    } catch {
      setStats({ pending: 0, done: 0, noWeb: 0 });
    }
  }, []);

  useEffect(() => { loadStats(); }, [loadStats, refreshTrigger]);

  async function run() {
    setRunning(true); setLogs([]); setResults([]); setError(null); setAllDone(false);
    try {
      for await (const event of readSSE("/api/agents/elisa", {}) as AsyncGenerator<AgentEvent>) {
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
          onDone?.();
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
  const noLeads = stats !== null && stats.pending === 0 && stats.done === 0 && stats.noWeb === 0;
  const allNoWeb = stats !== null && stats.pending === 0 && stats.noWeb > 0 && stats.done === 0;

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
          <div className="flex gap-2">
            <div className="flex-1 bg-violet-50 rounded-lg p-3 text-center">
              <p className="text-2xl font-bold text-violet-700">{stats.pending}</p>
              <p className="text-xs text-muted-foreground mt-0.5">Con web</p>
            </div>
            <div className="flex-1 bg-amber-50 rounded-lg p-3 text-center">
              <p className="text-2xl font-bold text-amber-600">{stats.noWeb}</p>
              <p className="text-xs text-muted-foreground mt-0.5">Sin web</p>
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
        ) : allNoWeb ? (
          <div className="flex items-start gap-2 text-xs text-amber-700 bg-amber-50 rounded-lg p-3">
            <Globe className="w-4 h-4 shrink-0 mt-0.5" />
            <span>
              Los {stats!.noWeb} leads encontrados no tienen página web. Prueba buscar otro tipo de negocio (ej: clínicas, hoteles, restaurantes con mayor presencia online).
            </span>
          </div>
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

// ─── DAVOO — Design Prompt Generator ─────────────────────────
interface DavooResult {
  id: string;
  name: string;
  prompt: string;
  fileName: string;
}

function DavooAgent({ elisaDoneTrigger }: { elisaDoneTrigger: number }) {
  const [stats, setStats] = useState<{ ready: number; done: number } | null>(null);
  const [running, setRunning] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  const [results, setResults] = useState<DavooResult[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [allDone, setAllDone] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const loadStats = useCallback(async () => {
    try {
      const supabase = createClient();
      const [readyRes, doneRes] = await Promise.all([
        supabase
          .from("leads")
          .select("*", { count: "exact", head: true })
          .eq("analyzed", true)
          .not("website", "is", null)
          .neq("website", "Sin página web"),
        supabase
          .from("file_attachments")
          .select("*", { count: "exact", head: true })
          .eq("content_type", "text/markdown"),
      ]);
      setStats({ ready: readyRes.count ?? 0, done: doneRes.count ?? 0 });
    } catch {
      setStats({ ready: 0, done: 0 });
    }
  }, []);

  useEffect(() => { loadStats(); }, [loadStats, elisaDoneTrigger]);

  async function copyPrompt(result: DavooResult) {
    await navigator.clipboard.writeText(result.prompt);
    setCopiedId(result.id);
    toast.success("Prompt copiado al portapapeles");
    setTimeout(() => setCopiedId(null), 2000);
  }

  function downloadPrompt(result: DavooResult) {
    const safeFileName = result.fileName.replace(/[^a-zA-ZáéíóúÁÉÍÓÚñÑüÜ0-9 ._-]/g, "-");
    const a = document.createElement("a");
    a.href = `data:text/plain;charset=utf-8,${encodeURIComponent(result.prompt)}`;
    a.download = safeFileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  async function run() {
    setRunning(true); setLogs([]); setResults([]); setError(null); setAllDone(false);
    try {
      for await (const event of readSSE("/api/agents/davoo", {}) as AsyncGenerator<AgentEvent>) {
        if (event.type === "status" || event.type === "progress") {
          setLogs((p) => [...p, event.message ?? ""]);
        } else if (event.type === "result") {
          const e = event as { generated?: number; skipped?: number; results?: DavooResult[]; allDone?: boolean };
          if (e.allDone) {
            setAllDone(true);
            setLogs((p) => [...p, "✓ Sin pendientes — todos los prompts ya fueron generados"]);
          } else {
            setResults(e.results ?? []);
            setLogs((p) => [...p, `✓ ${e.generated} prompts generados, ${e.skipped} omitidos`]);
            toast.success(`${e.generated} prompts de diseño creados`);
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

  const pending = stats ? Math.max(0, stats.ready - stats.done) : 0;
  const noPending = stats !== null && pending === 0;
  const noElisaLeads = stats !== null && stats.ready === 0;

  return (
    <Card className="border-0 shadow-sm flex-1">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-orange-100 flex items-center justify-center">
            <Wand2 className="w-5 h-5 text-orange-600" />
          </div>
          <div>
            <CardTitle className="text-base">Davoo</CardTitle>
            <p className="text-xs text-muted-foreground">Design Prompt Generator · GPT-4o → Prompt para Claude</p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {stats && (
          <div className="flex gap-2">
            <div className="flex-1 bg-orange-50 rounded-lg p-3 text-center">
              <p className="text-2xl font-bold text-orange-700">{pending}</p>
              <p className="text-xs text-muted-foreground mt-0.5">Pendientes</p>
            </div>
            <div className="flex-1 bg-emerald-50 rounded-lg p-3 text-center">
              <p className="text-2xl font-bold text-emerald-700">{stats.done}</p>
              <p className="text-xs text-muted-foreground mt-0.5">Generados</p>
            </div>
            <div className="flex-1 bg-slate-50 rounded-lg p-3 text-center">
              <p className="text-2xl font-bold text-slate-700">{stats.ready}</p>
              <p className="text-xs text-muted-foreground mt-0.5">Listos de Elisa</p>
            </div>
          </div>
        )}

        {noElisaLeads ? (
          <p className="text-xs text-muted-foreground text-center py-2">
            Elisa aún no ha generado informes. Ejecútala primero.
          </p>
        ) : noPending && !running && allDone ? (
          <div className="flex items-center gap-2 text-xs text-emerald-600 bg-emerald-50 rounded-lg p-3">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            Todos los prompts de diseño ya fueron generados.
          </div>
        ) : null}

        <Button
          onClick={run}
          disabled={running || (noPending && stats !== null)}
          className="w-full gap-2 bg-orange-500 hover:bg-orange-600"
          size="sm"
        >
          {running
            ? <><Loader2 className="w-4 h-4 animate-spin" /> Generando prompts...</>
            : <><Wand2 className="w-4 h-4" /> Generar prompts de diseño</>}
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
              Prompts generados
            </p>
            <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
              {results.map((r) => (
                <div key={r.id} className="border rounded-lg p-2.5 text-xs space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <FileText className="w-3.5 h-3.5 text-orange-500 shrink-0" />
                      <span className="font-semibold text-sm text-gray-900 truncate">{r.name}</span>
                    </div>
                    <span className="text-xs text-muted-foreground shrink-0">
                      {(new TextEncoder().encode(r.prompt).byteLength / 1024).toFixed(1)} KB
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1 h-7 text-xs gap-1"
                      onClick={() => copyPrompt(r)}
                    >
                      {copiedId === r.id
                        ? <><Check className="w-3 h-3 text-emerald-500" /> Copiado</>
                        : <><Copy className="w-3 h-3" /> Copiar prompt</>}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1 h-7 text-xs gap-1"
                      onClick={() => downloadPrompt(r)}
                    >
                      <ExternalLink className="w-3 h-3" /> Descargar .md
                    </Button>
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
  const [elisaDoneTrigger, setElisaDoneTrigger] = useState(0);

  return (
    <div className="p-6 space-y-6 max-w-6xl">
      <div className="flex items-center gap-3 text-sm text-muted-foreground flex-wrap">
        <span className="flex items-center gap-1.5 font-medium text-gray-700">
          <Search className="w-4 h-4 text-blue-500" /> Raúl
        </span>
        <ChevronRight className="w-4 h-4" />
        <span className="flex items-center gap-1.5 font-medium text-gray-700">
          <Sparkles className="w-4 h-4 text-violet-500" /> Elisa
        </span>
        <ChevronRight className="w-4 h-4" />
        <span className="flex items-center gap-1.5 font-medium text-gray-700">
          <Wand2 className="w-4 h-4 text-orange-500" /> Davoo
        </span>
        <ChevronRight className="w-4 h-4" />
        <span className="text-gray-500">Lead en CRM + Informe + Prompt de Rediseño</span>
      </div>

      <div className="flex gap-5 items-start">
        <RaulAgent onLeadsAdded={() => setRefreshTrigger((n) => n + 1)} />
        <ElisaAgent
          refreshTrigger={refreshTrigger}
          onDone={() => setElisaDoneTrigger((n) => n + 1)}
        />
        <DavooAgent elisaDoneTrigger={elisaDoneTrigger} />
      </div>

      <p className="text-xs text-muted-foreground">
        Raúl busca negocios en Google Places → Elisa analiza sus webs y genera informes →
        Davoo lee cada informe, re-escanea el sitio y crea un prompt personalizado para rediseñarlo con Claude.
      </p>
    </div>
  );
}
