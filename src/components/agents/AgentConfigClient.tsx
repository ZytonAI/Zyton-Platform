"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Bot, Zap, ZapOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { AgentConfig } from "@/types";

const MODELS = [
  { value: "claude-haiku-4-5-20251001", label: "Claude Haiku 4.5 (rápido, económico)" },
  { value: "claude-sonnet-4-6", label: "Claude Sonnet 4.6 (equilibrado)" },
  { value: "claude-opus-4-7", label: "Claude Opus 4.7 (máxima capacidad)" },
];

interface Props {
  initialConfig: AgentConfig;
}

export function AgentConfigClient({ initialConfig }: Props) {
  const [config, setConfig] = useState(initialConfig);
  const [saving, setSaving] = useState(false);
  const [toggling, setToggling] = useState(false);

  async function save() {
    setSaving(true);
    try {
      const res = await fetch("/api/agents/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      const updated = await res.json();
      setConfig(updated);
      toast.success("Configuración guardada");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al guardar");
    } finally {
      setSaving(false);
    }
  }

  async function toggleEnabled() {
    setToggling(true);
    const newEnabled = !config.enabled;
    try {
      const res = await fetch("/api/agents/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...config, enabled: newEnabled }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      const updated = await res.json();
      setConfig(updated);
      toast.success(newEnabled ? "Agente activado" : "Agente desactivado");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al cambiar estado");
    } finally {
      setToggling(false);
    }
  }

  return (
    <div className="p-6 max-w-2xl space-y-6">
      {/* Status card */}
      <Card className={`border-0 shadow-sm ${config.enabled ? "bg-emerald-50" : "bg-gray-50"}`}>
        <CardContent className="flex items-center justify-between py-4 px-6">
          <div className="flex items-center gap-3">
            <div
              className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                config.enabled ? "bg-emerald-100" : "bg-gray-200"
              }`}
            >
              <Bot
                className={`w-5 h-5 ${config.enabled ? "text-emerald-600" : "text-gray-500"}`}
              />
            </div>
            <div>
              <p className="font-semibold text-sm text-gray-900">
                {config.enabled ? "Agente activo" : "Agente inactivo"}
              </p>
              <p className="text-xs text-muted-foreground">
                {config.enabled
                  ? "Respondiendo mensajes entrantes de WhatsApp automáticamente"
                  : "Los mensajes no se responderán automáticamente"}
              </p>
            </div>
          </div>
          <Button
            variant={config.enabled ? "destructive" : "default"}
            size="sm"
            onClick={toggleEnabled}
            disabled={toggling}
            className="gap-2"
          >
            {config.enabled ? (
              <>
                <ZapOff className="w-4 h-4" /> Desactivar
              </>
            ) : (
              <>
                <Zap className="w-4 h-4" /> Activar
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {/* Config form */}
      <Card className="border-0 shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Configuración del agente</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="name">Nombre del agente</Label>
            <Input
              id="name"
              value={config.name}
              onChange={(e) => setConfig({ ...config, name: e.target.value })}
              placeholder="Ej: Asistente ZytonAI"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="model">Modelo de IA</Label>
            <Select
              value={config.model}
              onValueChange={(v) => v && setConfig({ ...config, model: v })}
            >
              <SelectTrigger id="model">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MODELS.map((m) => (
                  <SelectItem key={m.value} value={m.value}>
                    {m.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="system_prompt">Instrucciones del agente</Label>
            <p className="text-xs text-muted-foreground">
              Define cómo se comporta el agente, qué puede y no puede decir, y el tono de la conversación.
            </p>
            <Textarea
              id="system_prompt"
              value={config.system_prompt}
              onChange={(e) => setConfig({ ...config, system_prompt: e.target.value })}
              rows={8}
              placeholder="Eres un asistente de ventas de..."
              className="resize-none font-mono text-sm"
            />
          </div>

          <Button onClick={save} disabled={saving} className="w-full">
            {saving ? "Guardando..." : "Guardar configuración"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
