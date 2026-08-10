"use client";

import { useMemo, useState } from "react";
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Download, Eye, GripVertical, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { PdfPreviewDialog } from "@/components/project/pdf-preview-dialog";
import { downloadExport, fetchExportPreview } from "@/lib/export-client";
import {
  DEFAULT_EXPORT_TYPE_ORDER,
  EXPORT_TYPE_LABELS,
  serializeExportTypeOrder,
} from "@/lib/export-types";
import { sceneSlugLabel } from "@/lib/schedule";
import type { CanvasNodeType, Scene, Script } from "@/types";
import { cn } from "@/lib/utils";

function SortableTypeRow({
  id,
  label,
  enabled,
  onToggle,
}: {
  id: CanvasNodeType;
  label: string;
  enabled: boolean;
  onToggle: (enabled: boolean) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };
  return (
    <li
      ref={setNodeRef}
      style={style}
      className={cn(
        "flex items-center gap-2 rounded-md px-1.5 py-1 text-xs",
        isDragging && "z-10 bg-muted/80 opacity-90"
      )}
    >
      <button
        type="button"
        className="cursor-grab touch-none text-muted-foreground active:cursor-grabbing"
        aria-label={`Reorder ${label}`}
        {...attributes}
        {...listeners}
      >
        <GripVertical className="size-3.5 opacity-60" />
      </button>
      <label className="flex flex-1 cursor-pointer items-center gap-2">
        <input
          type="checkbox"
          className="size-3.5 accent-primary"
          checked={enabled}
          onChange={(e) => onToggle(e.target.checked)}
        />
        <span className={cn(!enabled && "text-muted-foreground line-through")}>
          {label}
        </span>
      </label>
    </li>
  );
}

export function ExportDialog({
  projectId,
  scripts,
  scenes,
  activeSceneId,
  mode = "pack",
  triggerLabel = "Export",
  triggerVariant = "outline",
  triggerSize = "sm",
  showIcon = true,
}: {
  projectId: string;
  scripts: Script[];
  scenes: Scene[];
  activeSceneId?: string | null;
  mode?: "pack" | "sheet";
  triggerLabel?: string;
  triggerVariant?: "outline" | "ghost" | "default" | "secondary";
  triggerSize?: "sm" | "default";
  showIcon?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const multiScript = scripts.length > 1;
  const scriptsById = useMemo(
    () => new Map(scripts.map((s) => [s.id, s])),
    [scripts]
  );

  const orderedScenes = useMemo(
    () =>
      [...scenes].sort((a, b) => {
        const sa = scriptsById.get(a.scriptId);
        const sb = scriptsById.get(b.scriptId);
        const ao = (sa?.episodeNumber ?? 0) * 1000 + (sa?.orderIndex ?? 0);
        const bo = (sb?.episodeNumber ?? 0) * 1000 + (sb?.orderIndex ?? 0);
        if (ao !== bo) return ao - bo;
        return a.orderIndex - b.orderIndex;
      }),
    [scenes, scriptsById]
  );

  const allIds = useMemo(
    () => orderedScenes.map((s) => s.id),
    [orderedScenes]
  );

  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [order, setOrder] = useState<"script" | "shoot">("script");
  const [asZip, setAsZip] = useState(false);
  const [typeOrder, setTypeOrder] = useState<CanvasNodeType[]>([
    ...DEFAULT_EXPORT_TYPE_ORDER,
  ]);
  const [enabledTypes, setEnabledTypes] = useState<Set<CanvasNodeType>>(
    () => new Set(DEFAULT_EXPORT_TYPE_ORDER)
  );
  const [busy, setBusy] = useState<"preview" | "download" | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [preview, setPreview] = useState<{
    url: string | null;
    filename: string;
    loading: boolean;
    error: string | null;
  } | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } })
  );

  function revokePreviewUrl(url: string | null) {
    if (url) URL.revokeObjectURL(url);
  }

  function revokePreview() {
    setPreview((prev) => {
      if (prev?.url) revokePreviewUrl(prev.url);
      return null;
    });
  }

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setSelected(new Set(allIds));
      setOrder("script");
      setAsZip(false);
      setTypeOrder([...DEFAULT_EXPORT_TYPE_ORDER]);
      setEnabledTypes(new Set(DEFAULT_EXPORT_TYPE_ORDER));
      setBusy(null);
      setActionError(null);
    } else {
      // Keep preview open independently; only clear dialog-local error.
      setActionError(null);
    }
  }

  function handlePreviewOpenChange(next: boolean) {
    if (!next) {
      revokePreview();
      setBusy((b) => (b === "preview" ? null : b));
    }
  }

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function onTypeDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setTypeOrder((items) => {
      const oldIndex = items.indexOf(active.id as CanvasNodeType);
      const newIndex = items.indexOf(over.id as CanvasNodeType);
      if (oldIndex < 0 || newIndex < 0) return items;
      return arrayMove(items, oldIndex, newIndex);
    });
  }

  function buildParams(forPreview: boolean): URLSearchParams | null {
    if (selected.size === 0) return null;
    const visible = typeOrder.filter((t) => enabledTypes.has(t));
    const params = new URLSearchParams({
      projectId,
      mode,
      order,
      includeCanvas: visible.length > 0 ? "1" : "0",
      sceneIds: [...selected].join(","),
      typeOrder: serializeExportTypeOrder(visible),
    });
    if (asZip && !forPreview) params.set("format", "zip");
    if (forPreview) params.set("disposition", "inline");
    return params;
  }

  async function runPreview() {
    const params = buildParams(true);
    if (!params) {
      setActionError("Select at least one scene to preview.");
      return;
    }
    setActionError(null);
    setBusy("preview");
    // Open preview immediately with a loading panel so long packs don't feel hung.
    setPreview((prev) => {
      if (prev?.url) revokePreviewUrl(prev.url);
      return {
        url: null,
        filename: "Building…",
        loading: true,
        error: null,
      };
    });
    try {
      const result = await fetchExportPreview(params, { toastOnError: false });
      if (result.ok) {
        setPreview({
          url: result.url,
          filename: result.filename,
          loading: false,
          error: null,
        });
      } else {
        setPreview({
          url: null,
          filename: "Export preview",
          loading: false,
          error: result.error,
        });
        setActionError(result.error);
      }
    } finally {
      setBusy(null);
    }
  }

  async function runDownload() {
    const params = buildParams(false);
    if (!params) {
      setActionError("Select at least one scene to export.");
      return;
    }
    setActionError(null);
    setBusy("download");
    try {
      const result = await downloadExport(params, { toastOnError: false });
      if (result.ok) {
        toast.success(asZip ? "Scene packs downloaded" : "PDF downloaded");
        revokePreview();
        setOpen(false);
      } else {
        setActionError(result.error);
        toast.error(result.error);
      }
    } finally {
      setBusy(null);
    }
  }

  const selectedCount = selected.size;
  const noScenes = orderedScenes.length === 0;

  return (
    <>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogTrigger
          render={
            <Button
              type="button"
              size={triggerSize}
              variant={triggerVariant}
              className={cn(
                "gap-1.5",
                triggerVariant === "ghost" && "text-[var(--project-accent)]"
              )}
            />
          }
        >
          {showIcon ? <Download className="size-3.5" /> : null}
          <span
            className={
              triggerLabel === "Export" ? "hidden sm:inline" : undefined
            }
          >
            {triggerLabel}
          </span>
        </DialogTrigger>
        <DialogContent
          className="flex max-h-[min(85dvh,40rem)] w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl"
          style={{ display: "flex" }}
        >
          <DialogHeader className="shrink-0 space-y-1.5 border-b border-border px-4 py-3 pr-12">
            <DialogTitle>
              {mode === "pack" ? "Export scene packs" : "Export cheat sheets"}
            </DialogTitle>
            <DialogDescription>
              Choose which scenes to include, then preview or download.
            </DialogDescription>
          </DialogHeader>

          <div className="flex min-h-0 flex-1 flex-col sm:flex-row">
            {/* Scenes column */}
            <div className="flex min-h-0 min-w-0 flex-1 flex-col border-b border-border sm:border-b-0 sm:border-r">
              <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border px-3 py-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-7 text-[11px]"
                  disabled={noScenes}
                  onClick={() => setSelected(new Set(allIds))}
                >
                  Select all
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-7 text-[11px]"
                  disabled={noScenes}
                  onClick={() => setSelected(new Set())}
                >
                  Deselect all
                </Button>
                {activeSceneId && allIds.includes(activeSceneId) ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-7 text-[11px]"
                    onClick={() => setSelected(new Set([activeSceneId]))}
                  >
                    This scene only
                  </Button>
                ) : null}
                <span className="ml-auto text-[11px] text-muted-foreground">
                  {selectedCount} selected
                </span>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3">
                {noScenes ? (
                  <p className="px-1.5 py-6 text-xs text-muted-foreground">
                    No scenes in this project yet. Import a script or add a
                    scene first.
                  </p>
                ) : (
                  <ul className="space-y-1 py-2">
                    {orderedScenes.map((scene) => {
                      const script = scriptsById.get(scene.scriptId) ?? null;
                      const label = sceneSlugLabel(scene, script, multiScript);
                      return (
                        <li key={scene.id}>
                          <label className="flex cursor-pointer items-start gap-2 rounded-md px-1.5 py-1.5 text-xs hover:bg-muted/50">
                            <input
                              type="checkbox"
                              className="mt-0.5 size-3.5 shrink-0 accent-primary"
                              checked={selected.has(scene.id)}
                              onChange={() => toggle(scene.id)}
                            />
                            <span className="min-w-0 leading-snug">{label}</span>
                          </label>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </div>

            {/* Options + canvas appendix column */}
            <div className="flex w-full shrink-0 flex-col bg-muted/20 sm:w-[15.5rem] sm:min-h-0">
              <div className="shrink-0 space-y-2.5 border-b border-border px-3 py-3 text-xs">
                <fieldset className="flex flex-wrap items-center gap-3">
                  <legend className="sr-only">Order</legend>
                  <span className="font-medium text-muted-foreground">Order</span>
                  <label className="flex items-center gap-1.5">
                    <input
                      type="radio"
                      name={`export-order-${mode}`}
                      checked={order === "script"}
                      onChange={() => setOrder("script")}
                      className="accent-primary"
                    />
                    Script
                  </label>
                  <label className="flex items-center gap-1.5">
                    <input
                      type="radio"
                      name={`export-order-${mode}`}
                      checked={order === "shoot"}
                      onChange={() => setOrder("shoot")}
                      className="accent-primary"
                    />
                    Shoot day
                  </label>
                </fieldset>
                <label className="flex items-center gap-1.5">
                  <input
                    type="checkbox"
                    className="size-3.5 accent-primary"
                    checked={asZip}
                    onChange={(e) => setAsZip(e.target.checked)}
                  />
                  Separate PDFs (zip)
                </label>
              </div>

              <div className="flex min-h-0 flex-1 flex-col px-3 py-2.5 text-xs">
                <p className="shrink-0 font-medium text-muted-foreground">
                  PDF Contents
                </p>
                <p className="mb-2 shrink-0 text-[10px] text-muted-foreground">
                  Drag to reorder PDF contents. Uncheck to hide.
                </p>
                <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
                  <DndContext
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    onDragEnd={onTypeDragEnd}
                  >
                    <SortableContext
                      items={typeOrder}
                      strategy={verticalListSortingStrategy}
                    >
                      <ul className="rounded-md border border-border bg-background/80 py-1">
                        {typeOrder.map((type) => (
                          <SortableTypeRow
                            key={type}
                            id={type}
                            label={EXPORT_TYPE_LABELS[type]}
                            enabled={enabledTypes.has(type)}
                            onToggle={(enabled) => {
                              setEnabledTypes((prev) => {
                                const next = new Set(prev);
                                if (enabled) next.add(type);
                                else next.delete(type);
                                return next;
                              });
                            }}
                          />
                        ))}
                      </ul>
                    </SortableContext>
                  </DndContext>
                </div>
              </div>
            </div>
          </div>

          {actionError ? (
            <div className="shrink-0 border-t border-border bg-destructive/5 px-4 py-2 text-xs text-destructive">
              {actionError}
            </div>
          ) : null}

          <div className="flex shrink-0 items-center justify-between gap-2 border-t border-border px-4 py-3">
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="gap-1.5 text-[var(--project-accent)]"
              disabled={selectedCount === 0 || asZip || busy != null}
              title={asZip ? "Preview is for single PDF only" : undefined}
              onClick={() => void runPreview()}
            >
              {busy === "preview" ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Eye className="size-3.5" />
              )}
              {busy === "preview" ? "Opening…" : "Preview"}
            </Button>
            <Button
              type="button"
              variant="accent"
              size="sm"
              className="gap-1.5"
              disabled={selectedCount === 0 || busy != null}
              onClick={() => void runDownload()}
            >
              {busy === "download" ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Download className="size-3.5" />
              )}
              {busy === "download" ? "Exporting…" : "Download"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <PdfPreviewDialog
        open={preview != null}
        url={preview?.url ?? null}
        filename={preview?.filename}
        loading={preview?.loading ?? false}
        error={preview?.error ?? null}
        downloading={busy === "download"}
        onOpenChange={handlePreviewOpenChange}
        onDownload={() => void runDownload()}
      />
    </>
  );
}
