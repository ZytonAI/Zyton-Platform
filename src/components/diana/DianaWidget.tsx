"use client";

import { useState, useEffect, useCallback } from "react";
import { X, Bot, Send } from "lucide-react";
import { DianaChat } from "./DianaChat";

type Tab = "chat" | "telegram";

export function DianaWidget() {
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const [tab, setTab] = useState<Tab>("chat");
  const [telegramConnected, setTelegramConnected] = useState<boolean | null>(null);
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [generatingToken, setGeneratingToken] = useState(false);
  const [copied, setCopied] = useState(false);

  // Verificar estado de Telegram al abrir
  useEffect(() => {
    if (!open) return;
    fetch("/api/diana/telegram/generate-token")
      .then((r) => r.json())
      .then((d) => setTelegramConnected(d.connected ?? false))
      .catch(() => setTelegramConnected(false));
  }, [open]);

  // Polling de tareas completadas cuando el chat está cerrado
  useEffect(() => {
    if (open) return;
    let lastCheck = Date.now();

    async function checkTasks() {
      try {
        const res = await fetch("/api/diana/chat?channel=web");
        if (!res.ok) return;
        const data = await res.json();
        const newlyDone = (data.tasks ?? []).filter(
          (t: { status: string; completed_at: string | null; notified: boolean }) =>
            t.status === "done" &&
            t.completed_at &&
            new Date(t.completed_at).getTime() > lastCheck - 15_000 &&
            !t.notified
        );
        if (newlyDone.length > 0) setUnread((prev) => prev + newlyDone.length);
        lastCheck = Date.now();
      } catch { /* silencioso */ }
    }

    const interval = setInterval(checkTasks, 10_000);
    return () => clearInterval(interval);
  }, [open]);

  async function generateToken() {
    setGeneratingToken(true);
    setLinkToken(null);
    try {
      const res = await fetch("/api/diana/telegram/generate-token", { method: "POST" });
      const data = await res.json();
      setLinkToken(data.token);
    } finally {
      setGeneratingToken(false);
    }
  }

  async function copyCommand() {
    if (!linkToken) return;
    await navigator.clipboard.writeText(`/start ${linkToken}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const handleOpen = () => { setOpen(true); setUnread(0); };
  const handleUnreadChange = useCallback((count: number) => setUnread(count), []);

  const BOT_USERNAME = "Diana_Zyton_bot";

  return (
    <>
      {open && (
        <div className="fixed bottom-20 left-4 z-50 w-80 sm:w-96 h-[540px] bg-white rounded-2xl shadow-2xl border border-gray-200 flex flex-col overflow-hidden animate-in slide-in-from-bottom-4 fade-in duration-200">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 bg-indigo-600 text-white shrink-0">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-full bg-white/20 flex items-center justify-center font-bold text-sm">
                D
              </div>
              <div>
                <p className="font-semibold text-sm leading-none">Diana</p>
                <p className="text-[10px] text-indigo-200 leading-none mt-0.5">Secretaria IA · ZytonAI</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {/* Tabs */}
              <div className="flex rounded-lg overflow-hidden bg-white/10 text-[11px] font-medium">
                <button
                  onClick={() => setTab("chat")}
                  className={`px-2.5 py-1 transition-colors ${tab === "chat" ? "bg-white/25" : "hover:bg-white/15"}`}
                >
                  Chat
                </button>
                <button
                  onClick={() => setTab("telegram")}
                  className={`px-2.5 py-1 transition-colors flex items-center gap-1 ${tab === "telegram" ? "bg-white/25" : "hover:bg-white/15"}`}
                >
                  <Send className="w-3 h-3" />
                  Telegram
                  {telegramConnected === false && (
                    <span className="w-1.5 h-1.5 rounded-full bg-yellow-300 ml-0.5" />
                  )}
                </button>
              </div>
              <button onClick={() => setOpen(false)} className="p-1 rounded-lg hover:bg-white/20 transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 min-h-0">
            {tab === "chat" ? (
              <DianaChat onUnreadChange={handleUnreadChange} />
            ) : (
              <div className="p-5 space-y-4 overflow-y-auto h-full">
                {telegramConnected === null ? (
                  <p className="text-sm text-gray-400 text-center mt-8">Verificando...</p>
                ) : telegramConnected ? (
                  <div className="text-center space-y-3 mt-6">
                    <div className="w-14 h-14 rounded-full bg-green-100 flex items-center justify-center mx-auto">
                      <span className="text-2xl">✅</span>
                    </div>
                    <p className="font-semibold text-gray-800">Telegram vinculado</p>
                    <p className="text-sm text-gray-500">
                      Diana te enviará notificaciones y puedes hablarle directamente desde Telegram.
                    </p>
                    <button
                      onClick={() => {
                        setTelegramConnected(false);
                        setLinkToken(null);
                      }}
                      className="text-xs text-gray-400 underline hover:text-gray-600"
                    >
                      Desvincular y reconectar
                    </button>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="bg-indigo-50 rounded-xl p-4 text-sm text-indigo-800 space-y-1">
                      <p className="font-semibold">Conecta Diana con Telegram</p>
                      <p className="text-indigo-600 text-xs">Recibe notificaciones y habla con Diana desde tu celular.</p>
                    </div>

                    <div className="space-y-3 text-sm text-gray-700">
                      <div className="flex gap-3 items-start">
                        <span className="w-6 h-6 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">1</span>
                        <p>Genera un token de vinculación de un solo uso:</p>
                      </div>

                      <button
                        onClick={generateToken}
                        disabled={generatingToken}
                        className="w-full py-2 px-4 rounded-xl bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors"
                      >
                        {generatingToken ? "Generando..." : linkToken ? "Regenerar token" : "Generar token"}
                      </button>

                      {linkToken && (
                        <>
                          <div className="flex gap-3 items-start">
                            <span className="w-6 h-6 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">2</span>
                            <p>Copia este comando y envíalo al bot de Telegram:</p>
                          </div>

                          <div
                            onClick={copyCommand}
                            className="cursor-pointer bg-gray-100 rounded-lg px-3 py-2 font-mono text-xs text-gray-700 border border-gray-200 hover:bg-gray-200 transition-colors flex items-center justify-between gap-2"
                          >
                            <span className="truncate">/start {linkToken}</span>
                            <span className="text-indigo-600 text-[10px] font-sans shrink-0">
                              {copied ? "✓ Copiado" : "Copiar"}
                            </span>
                          </div>

                          <div className="flex gap-3 items-start">
                            <span className="w-6 h-6 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">3</span>
                            <p>
                              Abre el bot{" "}
                              <a
                                href={`https://t.me/${BOT_USERNAME}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-indigo-600 underline font-medium"
                              >
                                @{BOT_USERNAME}
                              </a>{" "}
                              en Telegram y pega el comando.
                            </p>
                          </div>

                          <button
                            onClick={() => {
                              fetch("/api/diana/telegram/generate-token")
                                .then((r) => r.json())
                                .then((d) => {
                                  if (d.connected) {
                                    setTelegramConnected(true);
                                    setLinkToken(null);
                                  }
                                });
                            }}
                            className="w-full py-2 px-4 rounded-xl border border-gray-200 text-gray-600 text-sm hover:bg-gray-50 transition-colors"
                          >
                            Ya lo hice — verificar conexión
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Botón flotante */}
      <button
        onClick={open ? () => setOpen(false) : handleOpen}
        className="fixed bottom-4 left-4 z-50 w-12 h-12 rounded-full bg-indigo-600 text-white shadow-lg hover:bg-indigo-700 active:scale-95 transition-all flex items-center justify-center"
        aria-label="Abrir chat con Diana"
      >
        {open ? <X className="w-5 h-5" /> : <Bot className="w-5 h-5" />}
        {!open && unread > 0 && (
          <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center animate-pulse">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>
    </>
  );
}
