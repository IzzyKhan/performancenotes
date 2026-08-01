"use client";

import { useRef, useState } from "react";
import { FileUp, Type } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Scene, Script, ProjectBundle } from "@/types";
import { toast } from "sonner";
import { postWithRetry, snapshotFile } from "@/lib/upload-client";
import {
  parsePdfFileToSlugs,
  parseTypedTextToSlugs,
} from "@/lib/client-script-parse";
import { diffScriptScenes } from "@/lib/script-diff";
import {
  slugsToSplitScenes,
  type SceneSlugPayload,
} from "@/lib/scene-slug";
import type { SceneSourceType } from "@/types";
import { AddScriptDialog } from "@/components/project/add-script-dialog";
import { ReplaceScriptDialog } from "@/components/project/replace-script-dialog";
import type { SceneDiffEntry } from "@/lib/script-diff";
import { sceneSlugLabel, shootDayOrderLabel } from "@/lib/schedule";
import { usePlan, UPGRADE_SCRIPT_LIMIT_MESSAGE } from "@/lib/use-plan";
import { cn } from "@/lib/utils";

export function ScenePanel({
  projectId,
  scripts,
  scenes,
  activeScriptId,
  activeSceneId,
  onScriptsChange,
  onScenesChange,
  onActiveScriptChange,
  onActiveSceneChange,
}: {
  projectId: string;
  scripts: Script[];
  scenes: Scene[];
  activeScriptId: string | null;
  activeSceneId: string | null;
  onScriptsChange: (scripts: Script[]) => void;
  onScenesChange: (scenes: Scene[]) => void;
  onActiveScriptChange: (scriptId: string) => void;
  onActiveSceneChange: (sceneId: string) => void;
}) {
  const plan = usePlan();
  const activeScript = scripts.find((s) => s.id === activeScriptId) ?? null;
  const scriptScenes = activeScriptId
    ? scenes
        .filter((s) => s.scriptId === activeScriptId)
        .sort((a, b) => a.orderIndex - b.orderIndex)
    : [];
  const [pasteText, setPasteText] = useState("");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [pendingReplace, setPendingReplace] = useState<{
    slugs: SceneSlugPayload[];
    sourceType: SceneSourceType;
    diff: SceneDiffEntry[];
    sceneNumberWarning: string | null;
  } | null>(null);
  const [applyingReplace, setApplyingReplace] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function syncProjectData(preferredScriptId?: string) {
    const res = await fetch(`/api/projects/${projectId}?_=${Date.now()}`, {
      cache: "no-store",
    });
    const data = (await res.json()) as ProjectBundle & { error?: string };
    if (!res.ok) {
      throw new Error(data.error || "Failed to refresh project");
    }
    if (Array.isArray(data.scripts)) onScriptsChange(data.scripts);
    if (Array.isArray(data.scenes)) {
      onScenesChange(data.scenes);
      if (preferredScriptId) {
        onActiveScriptChange(preferredScriptId);
        const first = data.scenes
          .filter((s) => s.scriptId === preferredScriptId)
          .sort((a, b) => a.orderIndex - b.orderIndex)[0];
        if (first) onActiveSceneChange(first.id);
      }
    }
    return data;
  }

  async function saveTyped() {
    if (!pasteText.trim()) {
      toast.error("Paste script text with INT./EXT. slug lines");
      return;
    }

    const parsed = parseTypedTextToSlugs(pasteText);
    if (!parsed.ok) {
      toast.error(parsed.error);
      return;
    }

    setSaving(true);
    try {
      const payload = {
        projectId,
        sourceType: parsed.sourceType,
        scenes: parsed.slugs,
      };

      if (activeScriptId) {
        const data = (await postWithRetry(
          "/api/scenes",
          JSON.stringify({ ...payload, scriptId: activeScriptId }),
          { label: "Save script slugs", timeoutMs: 60_000 }
        )) as { sceneCount?: number };
        await syncProjectData(activeScriptId);
        setPasteText("");
        setImportOpen(false);
        toast.success(
          typeof data.sceneCount === "number" && data.sceneCount > 1
            ? `Imported ${data.sceneCount} scenes`
            : "Scene slugs saved"
        );
        if (parsed.sceneNumberWarning) toast.info(parsed.sceneNumberWarning);
      } else {
        const data = (await postWithRetry(
          "/api/scripts",
          JSON.stringify({
            ...payload,
            title: "Episode 1",
          }),
          { label: "Create episode", timeoutMs: 60_000 }
        )) as { script?: { id?: string }; sceneCount?: number };
        await syncProjectData(
          typeof data.script?.id === "string" ? data.script.id : undefined
        );
        setPasteText("");
        setImportOpen(false);
        toast.success(
          typeof data.sceneCount === "number" && data.sceneCount > 1
            ? `Imported ${data.sceneCount} scenes`
            : "Scene slugs saved"
        );
        if (parsed.sceneNumberWarning) toast.info(parsed.sceneNumberWarning);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save scene");
    } finally {
      setSaving(false);
    }
  }

  async function uploadPdf(file: File) {
    if (!activeScriptId) {
      toast.error("Add an episode first, then replace its PDF");
      return;
    }

    setUploading(true);
    try {
      const parsed = await parsePdfFileToSlugs(await snapshotFile(file));
      if (!parsed.ok) {
        toast.error(parsed.error);
        return;
      }

      if (scriptScenes.length > 0) {
        const diff = diffScriptScenes(
          scriptScenes,
          slugsToSplitScenes(parsed.slugs)
        );
        setPendingReplace({
          slugs: parsed.slugs,
          sourceType: parsed.sourceType,
          diff,
          sceneNumberWarning: parsed.sceneNumberWarning,
        });
        return;
      }

      const data = (await postWithRetry(
        "/api/scenes",
        JSON.stringify({
          projectId,
          scriptId: activeScriptId,
          sourceType: parsed.sourceType,
          scenes: parsed.slugs,
        }),
        { label: "PDF upload", timeoutMs: 60_000 }
      )) as { sceneCount?: number };
      await syncProjectData(activeScriptId);
      setImportOpen(false);
      toast.success(
        typeof data.sceneCount === "number" && data.sceneCount > 1
          ? `Episode replaced — ${data.sceneCount} scenes`
          : "Episode replaced"
      );
      if (parsed.sceneNumberWarning) toast.info(parsed.sceneNumberWarning);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "PDF upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function applyReplace(transfers: Record<string, boolean>) {
    if (!pendingReplace || !activeScriptId) return;
    setApplyingReplace(true);
    try {
      const data = (await postWithRetry(
        "/api/scenes",
        JSON.stringify({
          projectId,
          scriptId: activeScriptId,
          sourceType: pendingReplace.sourceType,
          scenes: pendingReplace.slugs,
          transfers,
        }),
        { label: "PDF replace", timeoutMs: 60_000 }
      )) as { sceneCount?: number; transferred?: number };
      const sceneNumberWarning = pendingReplace.sceneNumberWarning;
      setPendingReplace(null);
      await syncProjectData(activeScriptId);
      setImportOpen(false);
      const n = data.sceneCount;
      const t = data.transferred;
      toast.success(
        typeof n === "number"
          ? typeof t === "number"
            ? `Revision applied — ${n} scenes, ${t} kept prep`
            : `Revision applied — ${n} scenes`
          : "Revision applied"
      );
      if (sceneNumberWarning) toast.info(sceneNumberWarning);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to apply revision");
    } finally {
      setApplyingReplace(false);
    }
  }

  const showEpisodePicker = scripts.length > 1;
  const hasScenes = scriptScenes.length > 0;

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      {pendingReplace ? (
        <ReplaceScriptDialog
          key={`replace-${pendingReplace.diff.length}-${pendingReplace.slugs.length}`}
          open
          onOpenChange={(open) => {
            if (!open && !applyingReplace) setPendingReplace(null);
          }}
          diff={pendingReplace.diff}
          applying={applyingReplace}
          onConfirm={(transfers) => void applyReplace(transfers)}
        />
      ) : null}

      {showEpisodePicker ? (
        <div className="shrink-0 border-b border-border px-3 py-2">
          <Select
            value={activeScriptId ?? undefined}
            onValueChange={(v) => {
              if (typeof v === "string" && v) onActiveScriptChange(v);
            }}
          >
            <SelectTrigger className="h-8 w-full text-xs">
              <SelectValue placeholder="Select episode">
                {activeScript
                  ? `E${activeScript.episodeNumber} · ${activeScript.title}`
                  : "Select episode"}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {scripts.map((s) => (
                <SelectItem key={s.id} value={s.id} className="text-xs">
                  E{s.episodeNumber} · {s.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : activeScript && scripts.length === 1 ? (
        <div className="shrink-0 border-b border-border px-3 py-2">
          <p className="truncate text-xs font-medium text-foreground">
            {activeScript.title}
          </p>
        </div>
      ) : null}

      {hasScenes ? (
        <ScrollArea className="min-h-0 flex-1">
          <ul role="listbox" aria-label="Scenes">
            {scriptScenes.map((scene) => {
              const selected = activeSceneId === scene.id;
              const shootLabel = shootDayOrderLabel(scene);
              return (
                <li key={scene.id}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={selected}
                    onClick={() => onActiveSceneChange(scene.id)}
                    className={cn(
                      "w-full px-3 py-2.5 text-left transition-colors",
                      selected
                        ? "bg-neutral-200 font-medium text-foreground dark:bg-neutral-800"
                        : "text-muted-foreground hover:bg-neutral-100 hover:text-foreground dark:hover:bg-neutral-800/50"
                    )}
                  >
                    <span className="block text-xs leading-snug">
                      {sceneSlugLabel(scene)}
                    </span>
                    {shootLabel ? (
                      <span className="mt-0.5 block text-[10px] text-muted-foreground">
                        {shootLabel}
                      </span>
                    ) : null}
                  </button>
                </li>
              );
            })}
          </ul>
        </ScrollArea>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 px-4 py-6 text-center">
          <p className="text-xs text-muted-foreground">
            {activeScriptId
              ? "No scenes yet — upload a PDF or paste script text below."
              : "Add an episode to get started."}
          </p>
        </div>
      )}

      <div className="shrink-0 border-t border-border">
        <button
          type="button"
          className="flex w-full items-center justify-between px-3 py-2 text-left text-[11px] font-medium text-muted-foreground hover:bg-muted/40 hover:text-foreground"
          onClick={() => setImportOpen((v) => !v)}
        >
          <span>Import / update slugs</span>
          <span className="text-[10px]">{importOpen ? "Hide" : "Show"}</span>
        </button>

        {importOpen ? (
          <div className="space-y-3 border-t border-border/60 px-3 pb-3 pt-2">
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5"
                disabled={uploading || !activeScriptId}
                onClick={() => fileRef.current?.click()}
              >
                <FileUp className="size-3.5" />
                {uploading
                  ? "Parsing PDF…"
                  : activeScriptId
                    ? "Replace PDF"
                    : "Upload PDF"}
              </Button>
              <AddScriptDialog
                projectId={projectId}
                scripts={scripts}
                disabled={uploading}
                locked={
                  plan !== null &&
                  plan.maxScriptsPerProject !== null &&
                  scripts.length >= plan.maxScriptsPerProject
                }
                lockedMessage={UPGRADE_SCRIPT_LIMIT_MESSAGE}
                onAdded={async (scriptId) => {
                  await syncProjectData(scriptId);
                }}
              />
              <Button
                size="sm"
                className="gap-1.5"
                disabled={saving}
                onClick={() => void saveTyped()}
              >
                <Type className="size-3.5" />
                {saving ? "Importing…" : "Import paste"}
              </Button>
              <input
                ref={fileRef}
                type="file"
                accept="application/pdf,.pdf"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void uploadPdf(f);
                  e.target.value = "";
                }}
              />
            </div>
            <Textarea
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
              placeholder="Paste full script (INT./EXT. slugs)…"
              className="min-h-[5rem] resize-none font-mono text-xs leading-relaxed"
            />
            <p className="text-[10px] leading-relaxed text-muted-foreground">
              We store scene headings only — dialogue stays in your PDF.
            </p>
          </div>
        ) : null}
      </div>
    </div>
  );
}
