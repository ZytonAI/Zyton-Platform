"use client";

import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Paperclip, Download, Trash2, Upload } from "lucide-react";
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

export function FileAttachments({ attachments, entityType, entityId, onUpload, onDelete }: Props) {
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
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

  async function handleDownload(id: string, fileName: string, contentType?: string | null) {
    const res = await fetch(`/api/attachments/${id}`);
    const { url } = await res.json();
    // HTML reports open in new tab so user can print → Save as PDF
    if (contentType === "text/html" || fileName.endsWith(".html")) {
      window.open(url, "_blank");
    } else {
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
        <input ref={inputRef} type="file" className="hidden" onChange={handleFileChange} />
      </div>

      {attachments.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-3">
          Sin archivos adjuntos
        </p>
      ) : (
        <div className="space-y-2">
          {attachments.map((file) => (
            <div key={file.id} className="flex items-center gap-3 p-2.5 rounded-lg border bg-gray-50">
              <Paperclip className="w-4 h-4 text-muted-foreground shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{file.file_name}</p>
                <p className="text-xs text-muted-foreground">
                  {file.content_type === "text/html"
                    ? "Informe — abrir e imprimir como PDF"
                    : formatSize(file.size_bytes)}
                </p>
              </div>
              <div className="flex gap-1 shrink-0">
                <Button size="icon" variant="ghost" className="w-7 h-7"
                  onClick={() => handleDownload(file.id, file.file_name, file.content_type)}>
                  <Download className="w-3.5 h-3.5" />
                </Button>
                <Button size="icon" variant="ghost" className="w-7 h-7 text-destructive hover:text-destructive" onClick={() => handleDelete(file.id)}>
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
