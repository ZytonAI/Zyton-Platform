"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";
import {
  Search,
  Globe,
  Play,
  ChevronRight,
  ExternalLink,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Phone,
  MapPin,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { AgentEvent, Lead, WebAnalysis } from "@/types";

// ─── SSE reader helper ───────────────────────────────────────
async function* readSSE(
  url: string,
  body: object
): AsyncGenerator<AgentEvent> {
  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!resp.ok || !resp.body) {
    const err = await resp.text();
    yield { type: "error", message: err };
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
        try {
          yield JSON.parse(line.slice(6)) as AgentEvent;
        } catch {
          // skip malformed
        }
      }
    }
  }
}

// ─── Status log display ───────────────────────────────────────
function StatusLog({ logs }: { logs: string[] }) {
  if (!logs.length) return null;
  return (
    <div className="mt-4 space-y-1">
      {logs.map((msg, i) => (
        <div key={i} className="flex items-start gap-2 text-xs text-muted-foreground">
          <span className="mt-0.5 shrink-0">
            {i === logs.length - 1 ? (
              <Loader2 className="w-3 h-3 animate-spin text-blue-500" />
            ) : (
              <CheckCircle2 className="w-3 h-3 text-emerald-500" />
            )}
          </span>
          <span>{msg}</span>
        </div>
      ))}
    </div>
  );
}

// ─── RAÚL — Lead Finder ───────────────────────────────────────
function RaulAgent({ onLeadSelected }: { onLeadSelected: (lead: Lead) => void }) {
  const [tipo, setTipo] = useState("");
  const [ciudad, setCiudad] = useState("");
  const [running, setRunning] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  const [results, setResults] = useState<Lead[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    if (!tipo.trim() || !ciudad.trim()) {
      toast.error("Completa tipo de negocio y ciudad");
      return;
    }
    setRunning(true);
    setLogs([]);
    setResults([]);
    setError(null);

    try {
      for await (const event of readSSE("/api/agents/raul", { tipo, ciudad })) {
        if (event.type === "status") {
          setLogs((prev) => [...prev, event.message ?? ""]);
        } else if (event.type === "result") {
          setResults(event.leads ?? []);
          setLogs((prev) => [...prev, `✓ ${event.saved} leads guardados en el CRM`]);
          toast.success(`${event.saved} leads encontrados y guardados`);
        } else if (event.type === "error") {
          setError(event.message ?? "Error desconocido");
          toast.error(event.message);
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      toast.error(msg);
    } finally {
      setRunning(false);
    }
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
            <Input
              id="tipo"
              value={tipo}
              onChange={(e) => setTipo(e.target.value)}
              placeholder="dentistas, restaurantes, gimnasios..."
              disabled={running}
              className="h-9 text-sm"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ciudad" className="text-xs">Ciudad</Label>
            <Input
              id="ciudad"
              value={ciudad}
              onChange={(e) => setCiudad(e.target.value)}
              placeholder="Medellín Colombia"
              disabled={running}
              className="h-9 text-sm"
            />
          </div>
        </div>

        <Button onClick={run} disabled={running} className="w-full gap-2" size="sm">
          {running ? (
            <><Loader2 className="w-4 h-4 animate-spin" /> Buscando...</>
          ) : (
            <><Play className="w-4 h-4" /> Buscar leads</>
          )}
        </Button>

        {error && (
          <div className="flex items-start gap-2 text-xs text-destructive bg-destructive/10 rounded-lg p-3">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        <StatusLog logs={logs} />

        {results.length > 0 && (
          <div className="space-y-2 mt-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              {results.length} leads encontrados
            </p>
            <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
              {results.map((lead) => (
                <div
                  key={lead.id}
                  className="border rounded-lg p-3 text-xs space-y-1 hover:bg-muted/40 transition-colors"
                >
                  <div className="font-semibold text-sm text-gray-900 truncate">{lead.name}</div>
                  {lead.phone && (
                    <div className="flex items-center gap-1.5 text-muted-foreground">
                      <Phone className="w-3 h-3" /> {lead.phone}
                    </div>
                  )}
                  {lead.website && (
                    <div className="flex items-center gap-1.5 text-muted-foreground truncate">
                      <Globe className="w-3 h-3 shrink-0" />
                      <span className="truncate">{lead.website}</span>
                    </div>
                  )}
                  {lead.notes && (
                    <div className="flex items-center gap-1.5 text-muted-foreground">
                      <MapPin className="w-3 h-3" /> {lead.notes}
                    </div>
                  )}
                  {lead.website && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full h-7 text-xs mt-1"
                      onClick={() => onLeadSelected(lead)}
                    >
                      Analizar sitio web
                    </Button>
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

// ─── ANALIZADOR WEB ───────────────────────────────────────────
function AnalyzerAgent({ prefillUrl }: { prefillUrl?: string }) {
  const [url, setUrl] = useState(prefillUrl ?? "");
  const [ciudad, setCiudad] = useState("");
  const [running, setRunning] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  const [analysis, setAnalysis] = useState<WebAnalysis | null>(null);
  const [html, setHtml] = useState<string | null>(null);
  const [reportUrl, setReportUrl] = useState<string | null>(null);
  const [leadId, setLeadId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (prefillUrl) setUrl(prefillUrl);
  }, [prefillUrl]);

  async function run() {
    if (!url.trim()) {
      toast.error("Ingresa la URL del sitio web");
      return;
    }
    setRunning(true);
    setLogs([]);
    setAnalysis(null);
    setHtml(null);
    setReportUrl(null);
    setLeadId(null);
    setError(null);

    try {
      for await (const event of readSSE("/api/agents/analyzer", { url, ciudad })) {
        if (event.type === "status") {
          setLogs((prev) => [...prev, event.message ?? ""]);
        } else if (event.type === "result") {
          setAnalysis(event.analysis ?? null);
          setHtml(event.html ?? null);
          setReportUrl(event.report_url ?? null);
          setLeadId(event.lead_id ?? null);
          setLogs((prev) => [...prev, "✓ Análisis completado"]);
          toast.success("Análisis generado y lead creado");
        } else if (event.type === "error") {
          setError(event.message ?? "Error desconocido");
          toast.error(event.message);
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      toast.error(msg);
    } finally {
      setRunning(false);
    }
  }

  function openHtml() {
    if (!html) return;
    const blob = new Blob([html], { type: "text/html" });
    const blobUrl = URL.createObjectURL(blob);
    window.open(blobUrl, "_blank");
  }

  return (
    <Card className="border-0 shadow-sm flex-1">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-purple-100 flex items-center justify-center">
            <Globe className="w-5 h-5 text-purple-600" />
          </div>
          <div>
            <CardTitle className="text-base">Analizador Web</CardTitle>
            <p className="text-xs text-muted-foreground">Scrape + Claude AI → Informe PDF</p>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="url" className="text-xs">URL del sitio web</Label>
            <Input
              id="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://negocio.com"
              disabled={running}
              className="h-9 text-sm"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ciudad-an" className="text-xs">Ciudad (para el informe)</Label>
            <Input
              id="ciudad-an"
              value={ciudad}
              onChange={(e) => setCiudad(e.target.value)}
              placeholder="Medellín"
              disabled={running}
              className="h-9 text-sm"
            />
          </div>
        </div>

        <Button onClick={run} disabled={running} className="w-full gap-2 bg-purple-600 hover:bg-purple-700" size="sm">
          {running ? (
            <><Loader2 className="w-4 h-4 animate-spin" /> Analizando...</>
          ) : (
            <><Play className="w-4 h-4" /> Analizar sitio</>
          )}
        </Button>

        {error && (
          <div className="flex items-start gap-2 text-xs text-destructive bg-destructive/10 rounded-lg p-3">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        <StatusLog logs={logs} />

        {analysis && (
          <div className="space-y-3 mt-2">
            {/* Score */}
            <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
              <div>
                <p className="text-xs text-muted-foreground">Puntaje web</p>
                <p className="text-2xl font-bold text-gray-900">{analysis.puntaje_web}/100</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-muted-foreground">Velocidad estimada</p>
                <p className="text-lg font-semibold text-gray-700">{analysis.velocidad}</p>
              </div>
            </div>

            {/* Metrics bars */}
            <div className="space-y-2">
              {analysis.metricas.map((m) => (
                <div key={m.label}>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="font-medium">{m.label}</span>
                    <span className="text-muted-foreground">{m.actual} / {m.benchmark}</span>
                  </div>
                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-purple-500 rounded-full transition-all"
                      style={{ width: `${m.actual}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>

            {/* Oportunidades */}
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                Oportunidades
              </p>
              <ul className="space-y-1.5">
                {analysis.oportunidades.map((o, i) => (
                  <li key={i} className="text-xs text-gray-700 flex items-start gap-2">
                    <span className="mt-1 w-1.5 h-1.5 rounded-full bg-purple-500 shrink-0" />
                    {o}
                  </li>
                ))}
              </ul>
            </div>

            {/* Actions */}
            <div className="flex gap-2 pt-1">
              <Button
                variant="outline"
                size="sm"
                className="flex-1 gap-1.5 text-xs"
                onClick={openHtml}
                disabled={!html}
              >
                <ExternalLink className="w-3.5 h-3.5" /> Ver informe
              </Button>
              {reportUrl && (
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1 gap-1.5 text-xs"
                  onClick={() => window.open(reportUrl, "_blank")}
                >
                  <ExternalLink className="w-3.5 h-3.5" /> Descargar
                </Button>
              )}
              {leadId && (
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1 gap-1.5 text-xs"
                  onClick={() => window.open(`/leads/${leadId}`, "_blank")}
                >
                  Ver lead
                </Button>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Main page ────────────────────────────────────────────────
export function AgentsPageClient() {
  const [selectedLeadUrl, setSelectedLeadUrl] = useState<string | undefined>();

  return (
    <div className="p-6 space-y-6 max-w-5xl">
      {/* Pipeline header */}
      <div className="flex items-center gap-3 text-sm text-muted-foreground">
        <span className="flex items-center gap-1.5 font-medium text-gray-700">
          <Search className="w-4 h-4 text-blue-500" /> Raúl
        </span>
        <ChevronRight className="w-4 h-4" />
        <span className="flex items-center gap-1.5 font-medium text-gray-700">
          <Globe className="w-4 h-4 text-purple-500" /> Analizador Web
        </span>
        <ChevronRight className="w-4 h-4" />
        <span className="text-gray-500">Lead en CRM + Informe PDF</span>
      </div>

      {/* Agents side by side */}
      <div className="flex gap-5 items-start">
        <RaulAgent onLeadSelected={(lead) => setSelectedLeadUrl(lead.website ?? undefined)} />
        <AnalyzerAgent prefillUrl={selectedLeadUrl} />
      </div>

      {/* Info note */}
      <p className="text-xs text-muted-foreground">
        Raúl busca negocios en Google Places via Apify y los guarda en Leads. El Analizador extrae info del sitio con IA, genera un informe de diagnóstico y crea el lead automáticamente con el PDF adjunto.
      </p>
    </div>
  );
}
