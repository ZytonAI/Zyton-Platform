"use client";

import { useState } from "react";
import { toast } from "sonner";
import {
  Search, Play, Loader2, CheckCircle2, Phone, AlertCircle, MapPin, Filter, ChevronDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { MemberSelect } from "@/components/shared/MemberTag";
import { useMySlug } from "@/components/layout/SessionContext";
import { Label } from "@/components/ui/label";
import type { AgentEvent, Lead, LeadDescartado } from "@/types";

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

// ─── Puntaje del filtro ───────────────────────────────────────
function ScoreBadge({ score }: { score: number }) {
  const tono =
    score >= 75 ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400"
    : score >= 60 ? "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400"
    : "bg-muted text-muted-foreground";
  return (
    <span className={`shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-semibold tabular-nums ${tono}`}>
      {score}
    </span>
  );
}

// ─── Los que el filtro no dejó pasar ──────────────────────────
function Descartados({ items }: { items: LeadDescartado[] }) {
  const [abierto, setAbierto] = useState(false);
  if (!items.length) return null;

  return (
    <div className="border rounded-lg">
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        className="w-full flex items-center gap-2 p-2.5 text-xs text-muted-foreground hover:bg-muted/50 rounded-lg transition-colors"
      >
        <Filter className="w-3.5 h-3.5 shrink-0" />
        <span className="font-medium">{items.length} descartados por el filtro</span>
        <ChevronDown className={`w-3.5 h-3.5 ml-auto transition-transform ${abierto ? "rotate-180" : ""}`} />
      </button>
      {abierto && (
        <div className="px-2.5 pb-2.5 space-y-1.5 max-h-56 overflow-y-auto">
          {items.map((d, i) => (
            <div key={i} className="flex items-start gap-2 text-xs">
              <ScoreBadge score={d.score} />
              <span className="min-w-0">
                <span className="font-medium text-foreground">{d.nombre}</span>
                <span className="text-muted-foreground"> — {d.motivo}</span>
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── RAÚL — Lead Finder ───────────────────────────────────────
function RaulAgent() {
  const [tipo, setTipo] = useState("");
  const [ciudad, setCiudad] = useState("");
  // Buscar por barrio en vez de por ciudad entera: Google Maps corta cada
  // búsqueda en pocos resultados, y en una ciudad grande esos resultados son
  // siempre el centro y las cadenas. Barrio por barrio se llega a los negocios
  // que la búsqueda general nunca muestra.
  const [barrio, setBarrio] = useState("");
  const [cantidad, setCantidad] = useState("40");
  const [umbral, setUmbral] = useState("50");
  const [admitirSinWeb, setAdmitirSinWeb] = useState(true);
  // Los leads nuevos quedan a nombre de alguien; por defecto, de quien lanza
  // la búsqueda. Sin esto entran sin dueño y no aparecen en la vista de nadie.
  const mySlug = useMySlug();
  const [assignTo, setAssignTo] = useState<string | null>(mySlug);
  const [running, setRunning] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  const [results, setResults] = useState<Lead[]>([]);
  const [descartados, setDescartados] = useState<LeadDescartado[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    if (!tipo.trim() || !ciudad.trim()) { toast.error("Completa tipo y ciudad"); return; }
    setRunning(true); setLogs([]); setResults([]); setDescartados([]); setError(null);
    try {
      const body = {
        tipo, ciudad, barrio,
        cantidad: Number(cantidad),
        umbral: Number(umbral),
        admitir_sin_web: admitirSinWeb,
        assign_to: assignTo,
      };
      for await (const event of readSSE("/api/agents/raul", body)) {
        if (event.type === "status") {
          setLogs((p) => [...p, event.message ?? ""]);
        } else if (event.type === "result") {
          setResults(event.leads ?? []);
          setDescartados(event.descartados ?? []);
          setLogs((p) => [
            ...p,
            `✓ ${event.saved} de ${event.revisados} pasaron el filtro y quedaron en el CRM`,
            `   ${event.conWeb} con web, ${event.sinWeb} sin web`,
            event.sinContacto ? `ℹ ${event.sinContacto} omitidos por no tener número de contacto` : "",
          ].filter(Boolean));
          toast.success(`${event.saved} leads guardados en el CRM`);
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
    <Card className="border-0 shadow-sm w-full">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-100 dark:bg-blue-500/15 flex items-center justify-center">
            <Search className="w-5 h-5 text-blue-600 dark:text-blue-400" />
          </div>
          <div>
            <CardTitle className="text-base">Raúl</CardTitle>
            <p className="text-xs text-muted-foreground">Lead Finder · Google Places + filtro de IA</p>
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

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="ciudad" className="text-xs">Ciudad</Label>
              <Input id="ciudad" value={ciudad} onChange={(e) => setCiudad(e.target.value)}
                placeholder="Bogotá Colombia" disabled={running} className="h-9 text-sm" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="barrio" className="text-xs">
                Barrio o zona <span className="text-muted-foreground font-normal">(opcional)</span>
              </Label>
              <Input id="barrio" value={barrio} onChange={(e) => setBarrio(e.target.value)}
                placeholder="Modelia, Chapinero..." disabled={running} className="h-9 text-sm" />
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground -mt-1">
            Buscar barrio por barrio saca negocios que la búsqueda por ciudad nunca muestra:
            Maps corta cada consulta y en una ciudad grande solo devuelve el centro y las cadenas.
          </p>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Cuántos revisar</Label>
              <Select value={cantidad} onValueChange={(v) => v && setCantidad(v)} disabled={running}>
                <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="25">25 negocios</SelectItem>
                  <SelectItem value="40">40 negocios</SelectItem>
                  <SelectItem value="60">60 negocios</SelectItem>
                  <SelectItem value="100">100 negocios</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Exigencia del filtro</Label>
              <Select value={umbral} onValueChange={(v) => v && setUmbral(v)} disabled={running}>
                <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="35">Relajada — entran más</SelectItem>
                  <SelectItem value="50">Normal</SelectItem>
                  <SelectItem value="65">Estricta — solo los mejores</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex items-center justify-between gap-3 rounded-lg border p-2.5">
            <div className="min-w-0">
              <Label htmlFor="sinweb" className="text-xs">Incluir negocios sin página web</Label>
              <p className="text-[11px] text-muted-foreground">
                Apágalo si solo te interesan los que ya tienen algo que rehacer.
              </p>
            </div>
            <Switch id="sinweb" checked={admitirSinWeb} onCheckedChange={setAdmitirSinWeb} disabled={running} />
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
                  <div className="flex items-start gap-2">
                    <p className="font-semibold text-sm text-foreground truncate min-w-0">{lead.name}</p>
                    {lead.fit_score != null && <ScoreBadge score={lead.fit_score} />}
                  </div>
                  {lead.fit_reason && (
                    <p className="text-muted-foreground italic">{lead.fit_reason}</p>
                  )}
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

        <Descartados items={descartados} />
      </CardContent>
    </Card>
  );
}

// ─── Main ─────────────────────────────────────────────────────
export function AgentsPageClient() {
  return (
    // Raúl es lo único que queda en esta página: centrada se ve como una
    // herramienta, y no como una columna huérfana pegada a la izquierda.
    <div className="p-6 space-y-5 w-full max-w-xl mx-auto">
      <RaulAgent />
      <p className="text-xs text-muted-foreground">
        Raúl busca negocios en Google Places, abre la web de cada uno y le pasa lo que
        encuentra a un filtro de IA. Solo los que encajan con el cliente ideal de ZytonAI
        —pequeños, locales, activos y con presencia digital floja— llegan a la sección Leads.
      </p>
    </div>
  );
}
