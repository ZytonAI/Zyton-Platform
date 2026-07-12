"use client";

import { useEffect, useState, useCallback } from "react";
import Image from "next/image";
import { Loader2, Wifi, WifiOff, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { WaSessionStatus } from "@/types";

interface StatusResponse {
  status: WaSessionStatus;
  qr: string | null;
  phone: string | null;
}

interface Props {
  onConnected: () => void;
  suppressConnect?: boolean;
}

export function WaConnectPanel({ onConnected, suppressConnect = false }: Props) {
  const [data, setData] = useState<StatusResponse>({ status: "disconnected", qr: null, phone: null });
  const [loading, setLoading] = useState(true);
  const [reconnecting, setReconnecting] = useState(false);

  const poll = useCallback(async () => {
    try {
      const res = await fetch("/api/whatsapp/status", { cache: "no-store" });
      if (res.ok) {
        const json: StatusResponse = await res.json();
        setData(json);
        if (json.status === "connected" && !suppressConnect) {
          onConnected();
        }
      }
    } finally {
      setLoading(false);
    }
  }, [onConnected, suppressConnect]);

  useEffect(() => {
    poll();
    const interval = setInterval(poll, 5000);
    return () => clearInterval(interval);
  }, [poll]);

  const handleReconnect = useCallback(async () => {
    setReconnecting(true);
    try {
      await fetch("/api/whatsapp/reconnect", { method: "POST" });
      await new Promise((r) => setTimeout(r, 1500));
      await poll();
    } finally {
      setReconnecting(false);
    }
  }, [poll]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-10 h-10 animate-spin text-primary" />
      </div>
    );
  }

  if (data.status === "connected") {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4">
        <Loader2 className="w-10 h-10 animate-spin text-primary" />
        <p className="text-muted-foreground">Verificando sesión...</p>
      </div>
    );
  }

  if (data.status === "connecting" && data.qr) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-6 text-center px-6">
        <div className="w-14 h-14 rounded-2xl bg-green-50 flex items-center justify-center">
          <Wifi className="w-7 h-7 text-green-600" />
        </div>
        <div>
          <h2 className="text-xl font-semibold text-gray-900">Escanea el QR con WhatsApp</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Abre WhatsApp en tu teléfono → Dispositivos vinculados → Vincular dispositivo
          </p>
        </div>
        <div className="p-3 border rounded-2xl bg-white shadow-sm">
          <Image key={data.qr} src={data.qr} alt="QR WhatsApp" width={220} height={220} unoptimized />
        </div>
        <p className="text-xs text-muted-foreground">El QR se actualiza cada 20 segundos</p>
      </div>
    );
  }

  if (data.status === "connecting") {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-6 text-center px-6">
        <Loader2 className="w-10 h-10 animate-spin text-primary" />
        <p className="text-muted-foreground">Generando código QR...</p>
        <Button variant="outline" onClick={handleReconnect} disabled={reconnecting} className="gap-2">
          <RefreshCw className={`w-4 h-4 ${reconnecting ? "animate-spin" : ""}`} />
          {reconnecting ? "Reiniciando..." : "No aparece el QR"}
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center h-full gap-6 text-center px-6">
      <div className="w-14 h-14 rounded-2xl bg-red-50 flex items-center justify-center">
        <WifiOff className="w-7 h-7 text-red-500" />
      </div>
      <div>
        <h2 className="text-xl font-semibold text-gray-900">WhatsApp desconectado</h2>
        <p className="text-sm text-muted-foreground mt-1">
          El servicio no responde. Intenta conectar o verifica que el servicio en tu VPS esté corriendo.
        </p>
      </div>
      <Button variant="outline" onClick={handleReconnect} disabled={reconnecting} className="gap-2">
        <RefreshCw className={`w-4 h-4 ${reconnecting ? "animate-spin" : ""}`} />
        {reconnecting ? "Iniciando..." : "Conectar WhatsApp"}
      </Button>
    </div>
  );
}
