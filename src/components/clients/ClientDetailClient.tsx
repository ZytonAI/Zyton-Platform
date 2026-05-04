"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { HistoryTimeline } from "@/components/shared/HistoryTimeline";
import { FileAttachments } from "@/components/shared/FileAttachments";
import { ClientForm } from "./ClientForm";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { ArrowLeft, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import type { Client, HistoryEvent, FileAttachment } from "@/types";

interface Props {
  client: Client;
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

function formatDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("es-ES", { day: "2-digit", month: "short", year: "numeric" });
}

export function ClientDetailClient({ client: initialClient, history: initialHistory, attachments: initialAttachments }: Props) {
  const router = useRouter();
  const [client, setClient] = useState(initialClient);
  const [history, setHistory] = useState(initialHistory);
  const [attachments, setAttachments] = useState(initialAttachments);
  const [showEdit, setShowEdit] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);

  async function handleDelete() {
    setDeleteLoading(true);
    const res = await fetch(`/api/clients/${client.id}`, { method: "DELETE" });
    if (res.ok) {
      toast.success("Cliente eliminado");
      router.push("/clients");
    } else {
      setDeleteLoading(false);
    }
  }

  return (
    <div className="p-6 space-y-6 max-w-4xl">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => router.push("/clients")} className="gap-2">
          <ArrowLeft className="w-4 h-4" /> Volver
        </Button>
        <div className="flex-1" />
        <Button variant="outline" size="sm" onClick={() => setShowEdit(true)} className="gap-2">
          <Pencil className="w-4 h-4" /> Editar
        </Button>
        <Button variant="outline" size="sm" onClick={() => setShowDelete(true)} className="gap-2 text-destructive border-destructive/30 hover:bg-destructive/10">
          <Trash2 className="w-4 h-4" /> Eliminar
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">{client.name}</CardTitle>
                <StatusBadge status={client.status} type="client" />
              </div>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-4">
              <Field label="Email" value={client.email} />
              <Field label="Teléfono" value={client.phone} />
              <Field label="Empresa" value={client.company} />
              <Field label="Inicio contrato" value={formatDate(client.contract_start)} />
              <Field label="Fin contrato" value={formatDate(client.contract_end)} />
              {client.notes && (
                <div className="col-span-2">
                  <p className="text-xs text-muted-foreground">Notas</p>
                  <p className="text-sm mt-0.5 whitespace-pre-wrap">{client.notes}</p>
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
                entityType="client"
                entityId={client.id}
                onUpload={(a) => setAttachments((prev) => [a, ...prev])}
                onDelete={(id) => setAttachments((prev) => prev.filter((a) => a.id !== id))}
              />
            </CardContent>
          </Card>
        </div>

        <Card className="border-0 shadow-sm h-fit">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Historial</CardTitle>
          </CardHeader>
          <CardContent>
            <HistoryTimeline events={history} />
          </CardContent>
        </Card>
      </div>

      <ClientForm
        open={showEdit}
        onClose={() => setShowEdit(false)}
        onSave={(updated) => { setClient(updated); toast.success("Cliente actualizado"); }}
        initialData={client}
      />

      <ConfirmDialog
        open={showDelete}
        title="Eliminar cliente"
        description={`¿Eliminar a "${client.name}"? Esta acción no se puede deshacer.`}
        onConfirm={handleDelete}
        onCancel={() => setShowDelete(false)}
        loading={deleteLoading}
      />
    </div>
  );
}
