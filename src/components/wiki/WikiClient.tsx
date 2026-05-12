"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import { Table } from "@tiptap/extension-table";
import TableRow from "@tiptap/extension-table-row";
import TableHeader from "@tiptap/extension-table-header";
import TableCell from "@tiptap/extension-table-cell";
import Placeholder from "@tiptap/extension-placeholder";
import Link from "@tiptap/extension-link";
import type { WikiPage } from "@/types";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  Plus, Trash2, ChevronRight, ChevronDown, FileText,
  Bold, Italic, Strikethrough, Code, Heading1, Heading2, Heading3,
  List, ListOrdered, Quote, Minus, Table2, Image as ImageIcon,
  Link2, Undo, Redo, MoreHorizontal,
} from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface Props { initialPages: WikiPage[] }

const EMPTY_DOC = { type: "doc", content: [{ type: "paragraph" }] };

const ICONS = ["📄","📝","📋","🗒️","📌","⭐","🔖","💡","🎯","📊","📈","🗂️","🔧","📦","🌐","🏆","💬","🔒","📅","🖼️"];

// ── Toolbar button ──────────────────────────────────────────────
function ToolBtn({ onClick, active, disabled, title, children }: {
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onMouseDown={(e) => { e.preventDefault(); onClick(); }}
      disabled={disabled}
      title={title}
      className={cn(
        "p-1.5 rounded-md transition-colors text-sm",
        active ? "bg-gray-900 text-white" : "text-gray-600 hover:bg-gray-100",
        disabled && "opacity-30 cursor-not-allowed"
      )}
    >
      {children}
    </button>
  );
}

function Divider() {
  return <span className="w-px h-5 bg-gray-200 mx-0.5 shrink-0" />;
}

// ── Page tree item ──────────────────────────────────────────────
function PageItem({
  page, depth, pages, selectedId, onSelect, onDelete, onAddSub,
}: {
  page: WikiPage;
  depth: number;
  pages: WikiPage[];
  selectedId: string | null;
  onSelect: (p: WikiPage) => void;
  onDelete: (id: string) => void;
  onAddSub: (parentId: string) => void;
}) {
  const children = pages.filter((p) => p.parent_id === page.id);
  const [open, setOpen] = useState(true);

  return (
    <div>
      <div
        className={cn(
          "group flex items-center gap-1 px-2 py-1 rounded-lg cursor-pointer transition-colors text-sm",
          selectedId === page.id
            ? "bg-white/[0.15] text-white"
            : "text-white/60 hover:bg-white/[0.07] hover:text-white/90"
        )}
        style={{ paddingLeft: `${8 + depth * 14}px` }}
        onClick={() => onSelect(page)}
      >
        {children.length > 0 ? (
          <button
            onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}
            className="shrink-0 text-white/40 hover:text-white/80"
          >
            {open ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
          </button>
        ) : (
          <span className="w-3 shrink-0" />
        )}
        <span className="text-sm shrink-0">{page.icon}</span>
        <span className="truncate flex-1 text-xs font-medium">{page.title || "Sin título"}</span>
        <div className="opacity-0 group-hover:opacity-100 flex items-center gap-0.5 shrink-0">
          <button
            onClick={(e) => { e.stopPropagation(); onAddSub(page.id); }}
            className="p-0.5 rounded hover:bg-white/20 text-white/50 hover:text-white"
            title="Agregar sub-página"
          >
            <Plus className="w-3 h-3" />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(page.id); }}
            className="p-0.5 rounded hover:bg-red-500/30 text-white/50 hover:text-red-300"
            title="Eliminar página"
          >
            <Trash2 className="w-3 h-3" />
          </button>
        </div>
      </div>
      {open && children.map((child) => (
        <PageItem
          key={child.id}
          page={child}
          depth={depth + 1}
          pages={pages}
          selectedId={selectedId}
          onSelect={onSelect}
          onDelete={onDelete}
          onAddSub={onAddSub}
        />
      ))}
    </div>
  );
}

// ── Main component ──────────────────────────────────────────────
export function WikiClient({ initialPages }: Props) {
  const [pages, setPages] = useState<WikiPage[]>(initialPages);
  const [selected, setSelected] = useState<WikiPage | null>(initialPages[0] ?? null);
  const [saving, setSaving] = useState(false);
  const [titleValue, setTitleValue] = useState(selected?.title ?? "");
  const saveTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [showIconPicker, setShowIconPicker] = useState(false);

  const editor = useEditor({
    extensions: [
      StarterKit,
      Image.configure({ allowBase64: true }),
      Table.configure({ resizable: true }),
      TableRow,
      TableHeader,
      TableCell,
      Placeholder.configure({ placeholder: "Escribe algo, o presiona '/' para comandos..." }),
      Link.configure({ openOnClick: false }),
    ],
    content: selected?.content ?? EMPTY_DOC,
    editorProps: {
      attributes: { class: "prose prose-sm max-w-none focus:outline-none min-h-[300px] text-gray-900" },
    },
    onUpdate: ({ editor }) => {
      scheduleSave({ content: editor.getJSON() });
    },
  });

  // Sync editor content when page selection changes
  useEffect(() => {
    if (!editor || !selected) return;
    const current = JSON.stringify(editor.getJSON());
    const incoming = JSON.stringify(selected.content);
    if (current !== incoming) {
      editor.commands.setContent(selected.content ?? EMPTY_DOC);
    }
    setTitleValue(selected.title);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.id]);

  const scheduleSave = useCallback((patch: Partial<WikiPage>) => {
    if (!selected) return;
    if (saveTimeout.current) clearTimeout(saveTimeout.current);
    saveTimeout.current = setTimeout(async () => {
      setSaving(true);
      try {
        const res = await fetch(`/api/wiki/${selected.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(patch),
        });
        if (res.ok) {
          const updated: WikiPage = await res.json();
          setPages((prev) => prev.map((p) => p.id === updated.id ? updated : p));
          setSelected((prev) => prev?.id === updated.id ? updated : prev);
        }
      } finally {
        setSaving(false);
      }
    }, 800);
  }, [selected]);

  async function handleCreate(parentId: string | null = null) {
    const res = await fetch("/api/wiki", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ parent_id: parentId }),
    });
    if (res.ok) {
      const page: WikiPage = await res.json();
      setPages((prev) => [...prev, page]);
      setSelected(page);
    } else {
      toast.error("Error creando página");
    }
  }

  async function handleDelete(id: string) {
    const res = await fetch(`/api/wiki/${id}`, { method: "DELETE" });
    if (res.ok) {
      setPages((prev) => prev.filter((p) => p.id !== id && p.parent_id !== id));
      if (selected?.id === id) {
        const remaining = pages.filter((p) => p.id !== id);
        setSelected(remaining[0] ?? null);
      }
    } else {
      toast.error("Error eliminando página");
    }
  }

  function handleTitleChange(v: string) {
    setTitleValue(v);
    scheduleSave({ title: v });
  }

  function handleIconChange(icon: string) {
    setShowIconPicker(false);
    scheduleSave({ icon });
    setSelected((prev) => prev ? { ...prev, icon } : prev);
    setPages((prev) => prev.map((p) => p.id === selected?.id ? { ...p, icon } : p));
  }

  async function insertImage() {
    const url = window.prompt("URL de la imagen:");
    if (url) editor?.chain().focus().setImage({ src: url }).run();
  }

  function insertTable() {
    editor?.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
  }

  function insertLink() {
    const url = window.prompt("URL del enlace:");
    if (url) editor?.chain().focus().setLink({ href: url }).run();
  }

  const rootPages = pages.filter((p) => !p.parent_id);

  return (
    <div className="flex h-full overflow-hidden">
      {/* ── Sidebar de páginas ── */}
      <div className="w-56 shrink-0 bg-sidebar border-r border-sidebar-border flex flex-col overflow-hidden">
        <div className="px-3 pt-4 pb-2 flex items-center justify-between shrink-0">
          <span className="text-[11px] font-semibold text-white/30 uppercase tracking-widest">Páginas</span>
          <button
            onClick={() => handleCreate(null)}
            className="p-1 rounded-md hover:bg-white/10 text-white/40 hover:text-white transition-colors"
            title="Nueva página"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-1 pb-4 space-y-0.5">
          {rootPages.length === 0 ? (
            <button
              onClick={() => handleCreate(null)}
              className="w-full text-center py-6 text-xs text-white/30 hover:text-white/60 transition-colors"
            >
              Crea tu primera página
            </button>
          ) : (
            rootPages.map((page) => (
              <PageItem
                key={page.id}
                page={page}
                depth={0}
                pages={pages}
                selectedId={selected?.id ?? null}
                onSelect={setSelected}
                onDelete={handleDelete}
                onAddSub={(parentId) => handleCreate(parentId)}
              />
            ))
          )}
        </div>
      </div>

      {/* ── Área del editor ── */}
      {selected ? (
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden bg-[#F3F5F8]">
          {/* Toolbar */}
          <div className="bg-white border-b border-gray-200/70 px-4 py-1.5 flex items-center gap-0.5 flex-wrap shrink-0 shadow-sm">
            <ToolBtn onClick={() => editor?.chain().focus().undo().run()} title="Deshacer" disabled={!editor?.can().undo()}>
              <Undo className="w-4 h-4" />
            </ToolBtn>
            <ToolBtn onClick={() => editor?.chain().focus().redo().run()} title="Rehacer" disabled={!editor?.can().redo()}>
              <Redo className="w-4 h-4" />
            </ToolBtn>
            <Divider />
            <ToolBtn onClick={() => editor?.chain().focus().toggleHeading({ level: 1 }).run()} title="Título 1" active={editor?.isActive("heading", { level: 1 })}>
              <Heading1 className="w-4 h-4" />
            </ToolBtn>
            <ToolBtn onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()} title="Título 2" active={editor?.isActive("heading", { level: 2 })}>
              <Heading2 className="w-4 h-4" />
            </ToolBtn>
            <ToolBtn onClick={() => editor?.chain().focus().toggleHeading({ level: 3 }).run()} title="Título 3" active={editor?.isActive("heading", { level: 3 })}>
              <Heading3 className="w-4 h-4" />
            </ToolBtn>
            <Divider />
            <ToolBtn onClick={() => editor?.chain().focus().toggleBold().run()} title="Negrita" active={editor?.isActive("bold")}>
              <Bold className="w-4 h-4" />
            </ToolBtn>
            <ToolBtn onClick={() => editor?.chain().focus().toggleItalic().run()} title="Cursiva" active={editor?.isActive("italic")}>
              <Italic className="w-4 h-4" />
            </ToolBtn>
            <ToolBtn onClick={() => editor?.chain().focus().toggleStrike().run()} title="Tachado" active={editor?.isActive("strike")}>
              <Strikethrough className="w-4 h-4" />
            </ToolBtn>
            <ToolBtn onClick={() => editor?.chain().focus().toggleCode().run()} title="Código inline" active={editor?.isActive("code")}>
              <Code className="w-4 h-4" />
            </ToolBtn>
            <Divider />
            <ToolBtn onClick={() => editor?.chain().focus().toggleBulletList().run()} title="Lista" active={editor?.isActive("bulletList")}>
              <List className="w-4 h-4" />
            </ToolBtn>
            <ToolBtn onClick={() => editor?.chain().focus().toggleOrderedList().run()} title="Lista numerada" active={editor?.isActive("orderedList")}>
              <ListOrdered className="w-4 h-4" />
            </ToolBtn>
            <ToolBtn onClick={() => editor?.chain().focus().toggleBlockquote().run()} title="Cita" active={editor?.isActive("blockquote")}>
              <Quote className="w-4 h-4" />
            </ToolBtn>
            <ToolBtn onClick={() => editor?.chain().focus().setHorizontalRule().run()} title="Separador">
              <Minus className="w-4 h-4" />
            </ToolBtn>
            <Divider />
            <ToolBtn onClick={insertTable} title="Insertar tabla">
              <Table2 className="w-4 h-4" />
            </ToolBtn>
            <ToolBtn onClick={insertImage} title="Insertar imagen por URL">
              <ImageIcon className="w-4 h-4" />
            </ToolBtn>
            <ToolBtn onClick={insertLink} title="Insertar enlace" active={editor?.isActive("link")}>
              <Link2 className="w-4 h-4" />
            </ToolBtn>
            <div className="ml-auto flex items-center gap-2">
              {saving && <span className="text-xs text-gray-400">Guardando...</span>}
              {!saving && <span className="text-xs text-gray-300">Guardado</span>}
            </div>
          </div>

          {/* Título + contenido */}
          <div className="flex-1 overflow-y-auto">
            <div className="max-w-3xl mx-auto px-8 py-10">
              {/* Icono + título */}
              <div className="mb-8">
                <div className="relative inline-block mb-3">
                  <button
                    onClick={() => setShowIconPicker((v) => !v)}
                    className="text-4xl hover:opacity-70 transition-opacity"
                    title="Cambiar icono"
                  >
                    {selected.icon}
                  </button>
                  {showIconPicker && (
                    <div className="absolute top-12 left-0 z-50 bg-white border border-gray-200 rounded-xl shadow-lg p-2 grid grid-cols-5 gap-1 w-44">
                      {ICONS.map((ic) => (
                        <button
                          key={ic}
                          onClick={() => handleIconChange(ic)}
                          className="text-xl p-1 rounded hover:bg-gray-100 transition-colors"
                        >
                          {ic}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <input
                  value={titleValue}
                  onChange={(e) => handleTitleChange(e.target.value)}
                  placeholder="Sin título"
                  className="w-full text-4xl font-bold text-gray-900 bg-transparent border-none outline-none placeholder-gray-300 resize-none leading-tight"
                />
              </div>

              {/* Editor Tiptap */}
              <div className="wiki-editor">
                <EditorContent editor={editor} />
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center text-center gap-4 bg-[#F3F5F8]">
          <FileText className="w-12 h-12 text-gray-300" />
          <div>
            <p className="font-semibold text-gray-600">Sin página seleccionada</p>
            <p className="text-sm text-gray-400 mt-1">Crea una página nueva o selecciona una del panel izquierdo</p>
          </div>
          <button
            onClick={() => handleCreate(null)}
            className="mt-2 inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-white text-sm font-medium hover:bg-primary/90 transition-colors"
          >
            <Plus className="w-4 h-4" /> Nueva página
          </button>
        </div>
      )}
    </div>
  );
}
