"use client";

import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { FileText, Video, Download, Trash2, Upload, Play, Loader2 } from "lucide-react";
import type { FileAttachment } from "@/types";
import { toast } from "sonner";

interface Props {
  attachments: FileAttachment[];
  entityType: "lead" | "client";
  entityId: string;
  onUpload: (attachment: FileAttachment) => void;
  onDelete: (id: string) => void;
}

function formatSize(bytes: number | null) {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function isVideo(file: FileAttachment) {
  return (
    file.content_type?.startsWith("video/") ||
    ["mp4", "mov", "webm", "avi", "mkv"].some((ext) =>
      file.file_name.toLowerCase().endsWith(`.${ext}`)
    )
  );
}

function isHtml(file: FileAttachment) {
  return file.content_type === "text/html" || file.file_name.toLowerCase().endsWith(".html");
}

export function FileAttachments({ attachments, entityType, entityId, onUpload, onDelete }: Props) {
  const [uploading, setUploading] = useState(false);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [videoUrls, setVideoUrls] = useState<Record<string, string>>({});
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const maxMB = file.type.startsWith("video/") ? 50 : 100;
    if (file.size > maxMB * 1024 * 1024) {
      toast.error(`El archivo es demasiado grande (máx. ${maxMB} MB)`);
      if (inputRef.current) inputRef.current.value = "";
      return;
    }

    setUploading(true);
    try {
      const res = await fetch("/api/attachments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entity_type: entityType,
          entity_id: entityId,
          file_name: file.name,
          content_type: file.type,
          size_bytes: file.size,
        }),
      });

      const { attachment, signedUrl } = await res.json();
      if (!res.ok) throw new Error("Error creando URL de subida");

      await fetch(signedUrl, {
        method: "PUT",
        headers: { "Content-Type": file.type },
        body: file,
      });

      onUpload(attachment);
      toast.success("Archivo subido correctamente");
    } catch {
      toast.error("Error al subir el archivo");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function handlePlay(file: FileAttachment) {
    if (videoUrls[file.id]) {
      setPlayingId(file.id);
      return;
    }
    setPlayingId(`loading-${file.id}`);
    const res = await fetch(`/api/attachments/${file.id}`);
    const { url } = await res.json();
    setVideoUrls((prev) => ({ ...prev, [file.id]: url }));
    setPlayingId(file.id);
  }

  async function handleDownload(id: string, fileName: string, contentType?: string | null) {
    if (contentType === "text/html" || fileName.endsWith(".html")) {
      window.open(`/api/attachments/${id}/view`, "_blank");
    } else {
      const res = await fetch(`/api/attachments/${id}`);
      const { url } = await res.json();
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      a.click();
    }
  }

  async function handleDelete(id: string) {
    await fetch(`/api/attachments/${id}`, { method: "DELETE" });
    onDelete(id);
    toast.success("Archivo eliminado");
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-gray-700">
          Archivos adjuntos ({attachments.length})
        </p>
        <Button
          size="sm"
          variant="outline"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="gap-2"
        >
          <Upload className="w-3.5 h-3.5" />
          {uploading ? "Subiendo..." : "Subir archivo"}
        </Button>
        <input
          ref={inputRef}
          type="file"
          className="hidden"
          accept="video/*,application/pdf,text/html,image/*,.pdf,.html"
          onChange={handleFileChange}
        />
      </div>

      {attachments.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-3">Sin archivos adjuntos</p>
      ) : (
        <div className="space-y-2">
          {attachments.map((file) => {
            const video = isVideo(file);
            const html = isHtml(file);
            const isLoadingVideo = playingId === `loading-${file.id}`;
            const isPlaying = playingId === file.id;

            return (
              <div key={file.id} className="rounded-xl border bg-gray-50 overflow-hidden">
                <div className="flex items-center gap-3 p-2.5">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${video ? "bg-purple-100" : "bg-red-50"}`}>
                    {video
                      ? <Video className="w-4 h-4 text-purple-500" />
                      : <FileText className="w-4 h-4 text-red-400" />
                    }
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{file.file_name}</p>
                    <p className="text-xs text-muted-foreground">
                      {html
                        ? "Informe — abrir e imprimir como PDF"
                        : video
                        ? `Video · ${formatSize(file.size_bytes)}`
                        : formatSize(file.size_bytes)}
                    </p>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    {video && (
                      <Button
                        size="icon"
                        variant="ghost"
                        className="w-7 h-7 text-purple-500 hover:text-purple-700"
                        onClick={() => handlePlay(file)}
                        disabled={isLoadingVideo}
                        title="Reproducir"
                      >
                        {isLoadingVideo
                          ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          : <Play className="w-3.5 h-3.5" />
                        }
                      </Button>
                    )}
                    <Button
                      size="icon"
                      variant="ghost"
                      className="w-7 h-7"
                      onClick={() => handleDownload(file.id, file.file_name, file.content_type)}
                      title="Descargar"
                    >
                      <Download className="w-3.5 h-3.5" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="w-7 h-7 text-destructive hover:text-destructive"
                      onClick={() => handleDelete(file.id)}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>

                {/* Video player inline */}
                {video && isPlaying && videoUrls[file.id] && (
                  <div className="px-3 pb-3">
                    <video
                      src={videoUrls[file.id]}
                      controls
                      autoPlay
                      className="w-full rounded-lg max-h-64 bg-black"
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
