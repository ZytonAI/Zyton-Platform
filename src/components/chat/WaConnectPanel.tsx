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
}

export function WaConnectPanel({ onConnected }: Props) {
  const [data, setData] = useState<StatusResponse>({ status: "disconnected", qr: null, phone: null });
  const [loading, setLoading] = useState(true);

  const poll = useCallback(async () => {
    try {
      const res = await fetch("/api/whatsapp/status");
      if (res.ok) {
        const json: StatusResponse = await res.json();
        setData(json);
        if (json.status === "connected") onConnected();
      }
    } finally {
      setLoading(false);
    }
  }, [onConnected]);

  useEffect(() => {
    poll();
    const interval = setInterval(poll, 5000);
    return () => clearInterval(interval);
  }, [poll]);

  return (
    <div className="flex flex-col items-center justify-center h-full gap-6 text-center px-6">
      {loading ? (
        <Loader2 className="w-10 h-10 animate-spin text-primary" />
      ) : data.status === "connecting" && data.qr ? (
        <>
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
            <Image src={data.qr!} alt="QR WhatsApp" width={220} height={220} unoptimized />
          </div>
          <p className="text-xs text-muted-foreground">El QR se actualiza cada 20 segundos</p>
        </>
      ) : data.status === "connecting" ? (
        <>
          <Loader2 className="w-10 h-10 animate-spin text-primary" />
          <p className="text-muted-foreground">Conectando con WhatsApp...</p>
        </>
      ) : (
        <>
          <div className="w-14 h-14 rounded-2xl bg-red-50 flex items-center justify-center">
            <WifiOff className="w-7 h-7 text-red-500" />
          </div>
          <div>
            <h2 className="text-xl font-semibold text-gray-900">WhatsApp desconectado</h2>
            <p className="text-sm text-muted-foreground mt-1">
              El servicio de WhatsApp no está disponible. Verifica que el servicio en tu VPS esté corriendo.
            </p>
          </div>
          <Button variant="outline" onClick={poll} className="gap-2">
            <RefreshCw className="w-4 h-4" /> Reintentar
          </Button>
        </>
      )}
    </div>
  );
}
