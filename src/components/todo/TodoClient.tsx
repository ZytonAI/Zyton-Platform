"use client";

import { useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { TaskForm } from "./TaskForm";
import { TEAM_MEMBERS, memberByEmail, type TeamSlug } from "@/lib/team";
import {
  Plus,
  MoreHorizontal,
  Pencil,
  Trash2,
  Search,
  Circle,
  CircleDashed,
  CheckCircle2,
  CalendarDays,
} from "lucide-react";
import { toast } from "sonner";
import type { Task, TaskStatus } from "@/types";

const STATUS_CONFIG: Record<TaskStatus, { label: string; chip: string; Icon: typeof Circle }> = {
  todo:        { label: "Sin hacer",   chip: "bg-gray-100 text-gray-600 hover:bg-gray-200",         Icon: Circle },
  in_progress: { label: "En progreso", chip: "bg-blue-100 text-blue-700 hover:bg-blue-200",         Icon: CircleDashed },
  done:        { label: "Completado",  chip: "bg-emerald-100 text-emerald-700 hover:bg-emerald-200", Icon: CheckCircle2 },
};

const STATUS_ORDER: TaskStatus[] = ["todo", "in_progress", "done"];

function todayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function formatDue(date: string): string {
  return new Date(`${date}T12:00`).toLocaleDateString("es-ES", {
    day: "numeric",
    month: "short",
  });
}

interface Props {
  initialTasks: Task[];
  userEmail?: string;
}

export function TodoClient({ initialTasks, userEmail }: Props) {
  const [tasks, setTasks]         = useState<Task[]>(initialTasks);
  const [search, setSearch]       = useState("");
  const [hideDone, setHideDone]   = useState(false);
  const [showForm, setShowForm]   = useState(false);
  const [editTask, setEditTask]   = useState<Task | undefined>();
  const [formAssignee, setFormAssignee] = useState<TeamSlug | undefined>();
  const [deletingId, setDeletingId]     = useState<string | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const draggedId = useRef<string | null>(null);
  const [dragOver, setDragOver] = useState<TeamSlug | null>(null);

  const me = memberByEmail(userEmail);
  const today = todayKey();

  const byMember = useMemo(() => {
    const term = search.trim().toLowerCase();
    const map = new Map<string, Task[]>();
    for (const member of TEAM_MEMBERS) map.set(member.slug, []);

    for (const task of tasks) {
      if (hideDone && task.status === "done") continue;
      if (term && !`${task.title} ${task.description ?? ""}`.toLowerCase().includes(term)) continue;
      map.get(task.assignee)?.push(task);
    }

    // Pendientes primero, luego en progreso, completadas al final; por fecha dentro de cada grupo
    for (const list of map.values()) {
      list.sort((a, b) => {
        const rank = (t: Task) => (t.status === "done" ? 2 : t.status === "in_progress" ? 0 : 1);
        if (rank(a) !== rank(b)) return rank(a) - rank(b);
        if (a.due_date && b.due_date) return a.due_date.localeCompare(b.due_date);
        if (a.due_date) return -1;
        if (b.due_date) return 1;
        return b.created_at.localeCompare(a.created_at);
      });
    }
    return map;
  }, [tasks, search, hideDone]);

  function openNew(assignee?: TeamSlug) {
    setEditTask(undefined);
    setFormAssignee(assignee);
    setShowForm(true);
  }

  function handleSaved(task: Task) {
    setTasks((prev) => {
      const idx = prev.findIndex((t) => t.id === task.id);
      if (idx < 0) return [task, ...prev];
      const next = [...prev];
      next[idx] = task;
      return next;
    });
    toast.success(editTask ? "Tarea actualizada" : "Tarea creada");
    setEditTask(undefined);
    setFormAssignee(undefined);
  }

  async function patchTask(id: string, patch: Partial<Task>, errorMsg: string) {
    const previous = tasks;
    // Optimista: la UI responde de inmediato y revierte si el servidor falla
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)));

    const res = await fetch(`/api/tasks/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });

    if (!res.ok) {
      setTasks(previous);
      toast.error(errorMsg);
      return;
    }
    const updated: Task = await res.json();
    setTasks((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
  }

  async function handleDelete() {
    if (!deletingId) return;
    setDeleteLoading(true);
    const res = await fetch(`/api/tasks/${deletingId}`, { method: "DELETE" });
    if (res.ok) {
      setTasks((prev) => prev.filter((t) => t.id !== deletingId));
      toast.success("Tarea eliminada");
    } else {
      toast.error("Error al eliminar la tarea");
    }
    setDeleteLoading(false);
    setDeletingId(null);
  }

  async function handleDrop(slug: TeamSlug) {
    setDragOver(null);
    const id = draggedId.current;
    draggedId.current = null;
    if (!id) return;

    const task = tasks.find((t) => t.id === id);
    if (!task || task.assignee === slug) return;

    await patchTask(id, { assignee: slug }, "Error al mover la tarea");
  }

  const total = tasks.length;
  const done  = tasks.filter((t) => t.status === "done").length;

  return (
    <div className="p-6 space-y-4">
      {/* ── Barra superior ── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="relative w-full max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Buscar tareas..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <span className="text-xs text-muted-foreground whitespace-nowrap hidden sm:block">
            {done} de {total} completadas
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setHideDone((v) => !v)}
            className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${
              hideDone
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-white text-muted-foreground hover:bg-gray-50"
            }`}
          >
            Ocultar completadas
          </button>
          <Button onClick={() => openNew(me?.slug)} className="gap-2">
            <Plus className="w-4 h-4" />
            Nueva tarea
          </Button>
        </div>
      </div>

      {/* ── Tablero: una columna por persona ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 items-start">
        {TEAM_MEMBERS.map((member) => {
          const list    = byMember.get(member.slug) ?? [];
          const pending = list.filter((t) => t.status !== "done").length;
          const isMe    = me?.slug === member.slug;

          return (
            <div
              key={member.slug}
              onDragOver={(e) => { e.preventDefault(); setDragOver(member.slug); }}
              onDragLeave={() => setDragOver((s) => (s === member.slug ? null : s))}
              onDrop={() => handleDrop(member.slug)}
              className={`rounded-xl border bg-white shadow-sm overflow-hidden transition-colors ${
                dragOver === member.slug ? "ring-2 ring-primary/40 bg-blue-50/40" : ""
              }`}
            >
              {/* Cabecera de la persona */}
              <div className={`flex items-center gap-2 px-4 py-3 border-b ${member.header}`}>
                <span className={`w-2 h-2 rounded-full shrink-0 ${member.dot}`} />
                <h2 className="text-sm font-semibold text-gray-900 tracking-tight">
                  Tarea {member.name}
                </h2>
                {isMe && (
                  <span className="text-[10px] font-semibold bg-white/70 text-gray-600 px-1.5 py-0.5 rounded-full">
                    TÚ
                  </span>
                )}
                <span className="ml-auto text-xs font-medium text-gray-500">{pending}</span>
              </div>

              {/* Tareas */}
              <div className="p-2 space-y-1.5 min-h-[120px]">
                {list.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-6">
                    Sin tareas
                  </p>
                ) : (
                  list.map((task) => {
                    const { label, chip, Icon } = STATUS_CONFIG[task.status];
                    const overdue = !!task.due_date && task.due_date < today && task.status !== "done";

                    return (
                      <div
                        key={task.id}
                        draggable
                        onDragStart={() => { draggedId.current = task.id; }}
                        onDragEnd={() => setDragOver(null)}
                        className={`group rounded-lg border bg-white px-3 py-2.5 hover:shadow-sm transition-all cursor-grab active:cursor-grabbing ${
                          task.status === "done" ? "opacity-60" : ""
                        }`}
                      >
                        <div className="flex items-start gap-2">
                          <p
                            className={`flex-1 text-sm leading-snug ${
                              task.status === "done"
                                ? "line-through text-muted-foreground"
                                : "text-gray-900 font-medium"
                            }`}
                          >
                            {task.title}
                          </p>

                          <DropdownMenu>
                            <DropdownMenuTrigger className="shrink-0 inline-flex items-center justify-center w-6 h-6 rounded-md text-muted-foreground opacity-0 group-hover:opacity-100 focus:opacity-100 hover:bg-accent transition-opacity">
                              <MoreHorizontal className="w-4 h-4" />
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => { setEditTask(task); setShowForm(true); }}>
                                <Pencil className="w-4 h-4 mr-2" /> Editar
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                className="text-destructive"
                                onClick={() => setDeletingId(task.id)}
                              >
                                <Trash2 className="w-4 h-4 mr-2" /> Eliminar
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>

                        {task.description && (
                          <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                            {task.description}
                          </p>
                        )}

                        <div className="flex items-center gap-2 mt-2">
                          {/* Caja de estado — sin hacer / en progreso / completado */}
                          <DropdownMenu>
                            <DropdownMenuTrigger
                              className={`inline-flex items-center gap-1 text-[11px] font-semibold px-1.5 py-0.5 rounded-full transition-colors ${chip}`}
                            >
                              <Icon className="w-3 h-3" />
                              {label}
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="start">
                              {STATUS_ORDER.map((s) => {
                                const cfg = STATUS_CONFIG[s];
                                return (
                                  <DropdownMenuItem
                                    key={s}
                                    onClick={() =>
                                      patchTask(task.id, { status: s }, "Error al cambiar el estado")
                                    }
                                  >
                                    <cfg.Icon className="w-4 h-4 mr-2" /> {cfg.label}
                                  </DropdownMenuItem>
                                );
                              })}
                            </DropdownMenuContent>
                          </DropdownMenu>

                          {task.due_date && (
                            <span
                              className={`inline-flex items-center gap-1 text-[11px] font-medium ${
                                overdue ? "text-red-600" : "text-muted-foreground"
                              }`}
                            >
                              <CalendarDays className="w-3 h-3" />
                              {formatDue(task.due_date)}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}

                <button
                  onClick={() => openNew(member.slug)}
                  className="w-full flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium text-muted-foreground hover:bg-gray-50 hover:text-gray-700 transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Añadir tarea
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <TaskForm
        open={showForm}
        onClose={() => {
          setShowForm(false);
          setEditTask(undefined);
          setFormAssignee(undefined);
        }}
        onSave={handleSaved}
        initialData={editTask}
        defaultAssignee={formAssignee}
      />

      <ConfirmDialog
        open={!!deletingId}
        title="Eliminar tarea"
        description="¿Estás seguro? Esta acción no se puede deshacer."
        onConfirm={handleDelete}
        onCancel={() => setDeletingId(null)}
        loading={deleteLoading}
      />
    </div>
  );
}
