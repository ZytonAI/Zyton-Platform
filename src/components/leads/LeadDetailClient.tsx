"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { HistoryTimeline } from "@/components/shared/HistoryTimeline";
import { AddNote } from "@/components/shared/AddNote";
import { FileAttachments } from "@/components/shared/FileAttachments";
import { LeadForm } from "./LeadForm";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { ArrowLeft, Pencil, Trash2, Star } from "lucide-react";
import { toast } from "sonner";
import type { Lead, HistoryEvent, FileAttachment } from "@/types";

interface Props {
  lead: Lead;
  history: HistoryEvent[];
  attachments: FileAttachment[];
}

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm font-medium mt-0.5">{value || "—"}</p>
    </div>
  );
}

export function LeadDetailClient({ lead: initialLead, history: initialHistory, attachments: initialAttachments }: Props) {
  const router = useRouter();
  const [lead, setLead] = useState(initialLead);
  const [history, setHistory] = useState(initialHistory);
  const [attachments, setAttachments] = useState(initialAttachments);
  const [showEdit, setShowEdit] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [converting, setConverting] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);

  async function handleConvert() {
    setConverting(true);
    const res = await fetch(`/api/leads/${lead.id}/convert`, { method: "POST" });
    if (res.ok) {
      const { client } = await res.json();
      toast.success("Lead convertido a cliente");
      router.push(`/clients/${client.id}`);
    } else {
      toast.error("Error al convertir el lead");
      setConverting(false);
    }
  }

  async function handleDelete() {
    setDeleteLoading(true);
    const res = await fetch(`/api/leads/${lead.id}`, { method: "DELETE" });
    if (res.ok) {
      toast.success("Lead eliminado");
      router.push("/leads");
    } else {
      setDeleteLoading(false);
    }
  }

  return (
    <div className="p-6 space-y-6 max-w-4xl">
      {/* Actions bar */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => router.push("/leads")} className="gap-2">
          <ArrowLeft className="w-4 h-4" /> Volver
        </Button>
        <div className="flex-1" />
        {lead.status !== "converted" && (
          <Button variant="outline" size="sm" onClick={handleConvert} disabled={converting} className="gap-2 text-violet-600 border-violet-200 hover:bg-violet-50">
            <Star className="w-4 h-4" />
            {converting ? "Convirtiendo..." : "Convertir a cliente"}
          </Button>
        )}
        <Button variant="outline" size="sm" onClick={() => setShowEdit(true)} className="gap-2">
          <Pencil className="w-4 h-4" /> Editar
        </Button>
        <Button variant="outline" size="sm" onClick={() => setShowDelete(true)} className="gap-2 text-destructive border-destructive/30 hover:bg-destructive/10">
          <Trash2 className="w-4 h-4" /> Eliminar
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Lead info */}
        <div className="lg:col-span-2 space-y-4">
          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">{lead.name}</CardTitle>
                <StatusBadge status={lead.status} type="lead" />
              </div>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-4">
              <Field label="Email" value={lead.email} />
              <Field label="Teléfono" value={lead.phone} />
              <Field label="Empresa" value={lead.company} />
              <Field label="Fuente" value={lead.source} />
              {lead.notes && (
                <div className="col-span-2">
                  <p className="text-xs text-muted-foreground">Notas</p>
                  <p className="text-sm mt-0.5 whitespace-pre-wrap">{lead.notes}</p>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Archivos adjuntos</CardTitle>
            </CardHeader>
            <CardContent>
              <FileAttachments
                attachments={attachments}
                entityType="lead"
                entityId={lead.id}
                onUpload={(a) => setAttachments((prev) => [a, ...prev])}
                onDelete={(id) => setAttachments((prev) => prev.filter((a) => a.id !== id))}
              />
            </CardContent>
          </Card>
        </div>

        {/* History */}
        <Card className="border-0 shadow-sm h-fit">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Historial</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <AddNote
              entityType="lead"
              entityId={lead.id}
              onAdded={(event) => setHistory((prev) => [event, ...prev])}
            />
            <HistoryTimeline events={history} />
          </CardContent>
        </Card>
      </div>

      <LeadForm
        open={showEdit}
        onClose={() => setShowEdit(false)}
        onSave={(updated) => { setLead(updated); toast.success("Lead actualizado"); }}
        initialData={lead}
      />

      <ConfirmDialog
        open={showDelete}
        title="Eliminar lead"
        description={`¿Eliminar a "${lead.name}"? Esta acción no se puede deshacer.`}
        onConfirm={handleDelete}
        onCancel={() => setShowDelete(false)}
        loading={deleteLoading}
      />
    </div>
  );
}
