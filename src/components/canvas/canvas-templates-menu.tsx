"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { LayoutTemplate, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { CanvasTemplateRecord } from "@/lib/canvas-template";
import { sceneSlugLabel } from "@/lib/schedule";
import type { Scene, Script } from "@/types";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export function CanvasTemplatesMenu({
  projectId,
  sceneId,
  scripts,
  scenes,
  onApplied,
}: {
  projectId: string;
  sceneId: string | null;
  scripts: Script[];
  scenes: Scene[];
  /** Called after a successful apply so the canvas can reload. */
  onApplied?: (sceneIds: string[]) => void;
}) {
  const [templates, setTemplates] = useState<CanvasTemplateRecord[]>([]);
  const [loadingList, setLoadingList] = useState(false);
  const [saving, setSaving] = useState(false);
  const [applyOpen, setApplyOpen] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(
    null
  );
  const [selectedScenes, setSelectedScenes] = useState<Set<string>>(
    () => new Set()
  );
  const [overwrite, setOverwrite] = useState(false);
  const [applying, setApplying] = useState(false);

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

  const selectedTemplate = templates.find((t) => t.id === selectedTemplateId);

  const refreshTemplates = useCallback(async () => {
    setLoadingList(true);
    try {
      const res = await fetch(
        `/api/canvas-templates?projectId=${encodeURIComponent(projectId)}`
      );
      if (!res.ok) return;
      const data = (await res.json()) as CanvasTemplateRecord[];
      setTemplates(Array.isArray(data) ? data : []);
    } catch {
      // ignore
    } finally {
      setLoadingList(false);
    }
  }, [projectId]);

  useEffect(() => {
    void refreshTemplates();
  }, [refreshTemplates]);

  async function saveTemplate() {
    if (!sceneId) {
      toast.error("Select a scene before saving a layout template.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/canvas-templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, sceneId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(
          typeof data.error === "string" ? data.error : "Could not save template"
        );
        return;
      }
      toast.success("Layout template saved");
      await refreshTemplates();
    } finally {
      setSaving(false);
    }
  }

  function openApply(templateId: string) {
    setSelectedTemplateId(templateId);
    const emptyPreferred = new Set(
      orderedScenes.filter((s) => s.id !== sceneId).map((s) => s.id)
    );
    setSelectedScenes(
      emptyPreferred.size > 0
        ? emptyPreferred
        : new Set(orderedScenes.map((s) => s.id))
    );
    setOverwrite(false);
    setApplyOpen(true);
  }

  async function runApply() {
    if (!selectedTemplateId || selectedScenes.size === 0) return;
    setApplying(true);
    try {
      const res = await fetch("/api/canvas-templates/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          templateId: selectedTemplateId,
          sceneIds: [...selectedScenes],
          overwrite,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(
          typeof data.error === "string" ? data.error : "Could not apply template"
        );
        return;
      }
      const applied = Array.isArray(data.applied) ? data.applied : [];
      const skipped = Array.isArray(data.skipped) ? data.skipped : [];
      if (applied.length > 0) {
        toast.success(
          `Applied to ${applied.length} scene${applied.length === 1 ? "" : "s"}`
        );
        onApplied?.(applied);
      }
      if (skipped.length > 0) {
        toast.message(
          `Skipped ${skipped.length} scene${skipped.length === 1 ? "" : "s"} that already have canvas nodes`
        );
      }
      setApplyOpen(false);
    } finally {
      setApplying(false);
    }
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          className={cn(
            "inline-flex h-7 items-center justify-center gap-1.5 rounded-md border border-border bg-card px-2.5 text-xs font-normal text-[var(--project-accent)] hover:bg-muted"
          )}
        >
          <LayoutTemplate className="size-3.5" />
          Templates
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="min-w-[14rem]">
          <DropdownMenuItem
            disabled={!sceneId || saving}
            onClick={() => void saveTemplate()}
          >
            {saving ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <LayoutTemplate className="size-4" />
            )}
            Save this scene’s layout
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          {loadingList ? (
            <DropdownMenuItem disabled>
              <Loader2 className="size-4 animate-spin" />
              Loading…
            </DropdownMenuItem>
          ) : templates.length === 0 ? (
            <DropdownMenuItem disabled>No saved templates yet</DropdownMenuItem>
          ) : (
            templates.map((t) => (
              <DropdownMenuItem
                key={t.id}
                onClick={() => openApply(t.id)}
              >
                <span className="min-w-0 flex-1 truncate">{t.name}</span>
                <span className="text-[10px] text-muted-foreground">
                  {t.nodes.length}
                </span>
              </DropdownMenuItem>
            ))
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={applyOpen} onOpenChange={setApplyOpen}>
        <DialogContent className="flex max-h-[min(85dvh,36rem)] w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-md">
          <DialogHeader className="shrink-0 space-y-1.5 border-b border-border px-4 py-3 pr-12">
            <DialogTitle>Apply layout template</DialogTitle>
            <DialogDescription>
              {selectedTemplate
                ? `“${selectedTemplate.name}” — ${selectedTemplate.nodes.length} empty nodes (positions kept, content cleared).`
                : "Choose scenes to receive this layout."}
            </DialogDescription>
          </DialogHeader>

          <div className="flex shrink-0 flex-wrap gap-2 border-b border-border px-4 py-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7 text-[11px]"
              onClick={() =>
                setSelectedScenes(new Set(orderedScenes.map((s) => s.id)))
              }
            >
              Select all
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7 text-[11px]"
              onClick={() => setSelectedScenes(new Set())}
            >
              Deselect all
            </Button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
            <ul className="space-y-1">
              {orderedScenes.map((scene) => {
                const script = scriptsById.get(scene.scriptId) ?? null;
                const label = sceneSlugLabel(scene, script, multiScript);
                return (
                  <li key={scene.id}>
                    <label className="flex cursor-pointer items-start gap-2 rounded-md px-1.5 py-1.5 text-xs hover:bg-muted/50">
                      <input
                        type="checkbox"
                        className="mt-0.5 size-3.5 shrink-0 accent-primary"
                        checked={selectedScenes.has(scene.id)}
                        onChange={() => {
                          setSelectedScenes((prev) => {
                            const next = new Set(prev);
                            if (next.has(scene.id)) next.delete(scene.id);
                            else next.add(scene.id);
                            return next;
                          });
                        }}
                      />
                      <span className="min-w-0 leading-snug">{label}</span>
                    </label>
                  </li>
                );
              })}
            </ul>
          </div>

          <div className="shrink-0 space-y-3 border-t border-border bg-muted/30 px-4 py-3 text-xs">
            <label className="flex items-start gap-2">
              <input
                type="checkbox"
                className="mt-0.5 size-3.5 accent-[var(--project-accent)]"
                checked={overwrite}
                onChange={(e) => setOverwrite(e.target.checked)}
              />
              <span>
                Replace existing nodes on selected scenes
                <span className="mt-0.5 block text-[10px] text-muted-foreground">
                  Off = skip scenes that already have canvas content.
                </span>
              </span>
            </label>
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setApplyOpen(false)}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="accent"
                size="sm"
                disabled={selectedScenes.size === 0 || applying}
                onClick={() => void runApply()}
              >
                {applying ? "Applying…" : "Apply"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
