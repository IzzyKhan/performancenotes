"use client";

import { useMemo, useState } from "react";
import { Download, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { downloadExport, previewExport } from "@/lib/export-client";
import { sceneSlugLabel } from "@/lib/schedule";
import type { Scene, Script } from "@/types";

export function ExportDialog({
  projectId,
  scripts,
  scenes,
  activeSceneId,
  mode = "pack",
  defaultIncludeCanvas = true,
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
  defaultIncludeCanvas?: boolean;
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
  const [includeCanvas, setIncludeCanvas] = useState(defaultIncludeCanvas);
  const [busy, setBusy] = useState<"preview" | "download" | null>(null);

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setSelected(new Set(allIds));
      setOrder("script");
      setAsZip(false);
      setIncludeCanvas(defaultIncludeCanvas);
      setBusy(null);
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

  function buildParams(forPreview: boolean): URLSearchParams | null {
    if (selected.size === 0) return null;
    const params = new URLSearchParams({
      projectId,
      mode,
      order,
      includeCanvas: includeCanvas ? "1" : "0",
      sceneIds: [...selected].join(","),
    });
    if (asZip && !forPreview) params.set("format", "zip");
    if (forPreview) params.set("disposition", "inline");
    return params;
  }

  async function runPreview() {
    const params = buildParams(true);
    if (!params) return;
    setBusy("preview");
    try {
      await previewExport(params);
    } finally {
      setBusy(null);
    }
  }

  async function runDownload() {
    const params = buildParams(false);
    if (!params) return;
    setBusy("download");
    try {
      await downloadExport(params);
      setOpen(false);
    } finally {
      setBusy(null);
    }
  }

  const selectedCount = selected.size;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger
        render={
          <Button
            type="button"
            size={triggerSize}
            variant={triggerVariant}
            className="gap-1.5"
          />
        }
      >
        {showIcon ? <Download className="size-3.5" /> : null}
        <span className={triggerLabel === "Export" ? "hidden sm:inline" : undefined}>
          {triggerLabel}
        </span>
      </DialogTrigger>
      <DialogContent className="flex max-h-[85vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-md">
        <DialogHeader className="px-4 pt-4 pr-12">
          <DialogTitle>
            {mode === "pack" ? "Export scene packs" : "Export cheat sheets"}
          </DialogTitle>
          <DialogDescription>
            Choose which scenes to include, then preview or download.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-7 text-[11px]"
            onClick={() => setSelected(new Set(allIds))}
          >
            Select all
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-7 text-[11px]"
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

        <ScrollArea className="min-h-0 max-h-[min(40vh,18rem)] flex-1 px-4">
          <ul className="space-y-1 py-3">
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
        </ScrollArea>

        <div className="space-y-2 border-t border-border px-4 py-3 text-xs">
          <fieldset className="flex flex-wrap items-center gap-3">
            <legend className="sr-only">Order</legend>
            <span className="text-muted-foreground">Order</span>
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
          <label className="flex items-center gap-1.5">
            <input
              type="checkbox"
              className="size-3.5 accent-primary"
              checked={includeCanvas}
              onChange={(e) => setIncludeCanvas(e.target.checked)}
            />
            Include canvas references
          </label>
        </div>

        <DialogFooter className="mx-0 mb-0 gap-2 sm:justify-between">
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="gap-1.5"
            disabled={selectedCount === 0 || asZip || busy != null}
            title={asZip ? "Preview is for single PDF only" : undefined}
            onClick={() => void runPreview()}
          >
            <Eye className="size-3.5" />
            {busy === "preview" ? "Opening…" : "Preview"}
          </Button>
          <Button
            type="button"
            size="sm"
            className="gap-1.5"
            disabled={selectedCount === 0 || busy != null}
            onClick={() => void runDownload()}
          >
            <Download className="size-3.5" />
            {busy === "download" ? "Exporting…" : "Download"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
