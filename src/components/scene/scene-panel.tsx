"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { FileUp, Lock, MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
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
import { parsePdfFileToSlugs } from "@/lib/client-script-parse";
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
import {
  usePlan,
  sceneCapDividerMessage,
  sceneLimitMessage,
  scriptLimitMessage,
} from "@/lib/use-plan";
import { cn } from "@/lib/utils";

/**
 * Manual slug edits — for the small heading changes a user would rather type
 * than re-import a whole revision.
 */
type SceneDraft =
  | { mode: "edit"; sceneId: string; heading: string; number: string }
  | { mode: "add"; afterSceneId: string | null; heading: string; number: string };

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

  // Free-tier scene cap: scenes beyond the cap exist (import creates them all)
  // but are locked until upgrade. Counted project-wide in script order,
  // matching how prep pace counts scenes.
  const sceneCap = plan?.maxScenesPerProject ?? null;
  const lockedSceneIds = useMemo(() => {
    if (sceneCap === null) return null;
    const scriptOrder = new Map(
      scripts.map((s) => [s.id, s.episodeNumber * 1000 + s.orderIndex])
    );
    const ordered = [...scenes].sort((a, b) => {
      const sa = scriptOrder.get(a.scriptId) ?? 0;
      const sb = scriptOrder.get(b.scriptId) ?? 0;
      return sa === sb ? a.orderIndex - b.orderIndex : sa - sb;
    });
    return new Set(ordered.slice(sceneCap).map((s) => s.id));
  }, [sceneCap, scenes, scripts]);
  const atSceneCap = sceneCap !== null && scenes.length >= sceneCap;

  // If the selected scene becomes locked (e.g. plan info arrives after
  // selection), move to the first unlocked scene so the canvas never shows
  // a locked one.
  useEffect(() => {
    if (!lockedSceneIds || !activeSceneId || !lockedSceneIds.has(activeSceneId))
      return;
    const firstUnlocked = scriptScenes.find((s) => !lockedSceneIds.has(s.id));
    if (firstUnlocked) onActiveSceneChange(firstUnlocked.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lockedSceneIds, activeSceneId]);

  function startAddScene(afterSceneId: string | null) {
    if (atSceneCap) {
      toast.info(sceneLimitMessage());
      return;
    }
    setDraft({ mode: "add", afterSceneId, heading: "", number: "" });
  }
  const [uploading, setUploading] = useState(false);
  const [pendingReplace, setPendingReplace] = useState<{
    slugs: SceneSlugPayload[];
    sourceType: SceneSourceType;
    diff: SceneDiffEntry[];
    sceneNumberWarning: string | null;
  } | null>(null);
  const [applyingReplace, setApplyingReplace] = useState(false);
  const [draft, setDraft] = useState<SceneDraft | null>(null);
  const [savingScene, setSavingScene] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Scene | null>(null);
  const [deletingScene, setDeletingScene] = useState(false);
  const [bulkPrepping, setBulkPrepping] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function syncProjectData(preferredScriptId?: string) {
    const res = await fetch(`/api/projects/${projectId}?_=${Date.now()}`, {
      cache: "no-store",
    });
    const data = (await res.json().catch(() => ({}))) as ProjectBundle & {
      error?: string;
    };
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

  async function saveDraft() {
    if (!draft || !activeScriptId) return;
    const heading = draft.heading.trim();
    if (!heading) {
      toast.error("Scene heading can't be empty");
      return;
    }
    const sceneNumber = draft.number.trim() || null;

    setSavingScene(true);
    try {
      const res =
        draft.mode === "edit"
          ? await fetch("/api/scenes", {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ id: draft.sceneId, heading, sceneNumber }),
            })
          : await fetch("/api/scenes", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                projectId,
                scriptId: activeScriptId,
                scene: { heading, sceneNumber, afterSceneId: draft.afterSceneId },
              }),
            });
      const data = (await res.json().catch(() => ({}))) as Partial<Scene> & {
        error?: string;
      };
      if (!res.ok) throw new Error(data.error || "Failed to save scene");

      const wasAdd = draft.mode === "add";
      setDraft(null);
      await syncProjectData();
      if (wasAdd && typeof data.id === "string") onActiveSceneChange(data.id);
      toast.success(wasAdd ? "Scene added" : "Scene updated");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save scene");
    } finally {
      setSavingScene(false);
    }
  }

  async function deleteScene(scene: Scene) {
    setDeletingScene(true);
    try {
      const res = await fetch(`/api/scenes?id=${encodeURIComponent(scene.id)}`, {
        method: "DELETE",
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error || "Failed to delete scene");

      if (activeSceneId === scene.id) {
        const i = scriptScenes.findIndex((s) => s.id === scene.id);
        const next = scriptScenes[i + 1] ?? scriptScenes[i - 1] ?? null;
        if (next) onActiveSceneChange(next.id);
      }
      setDeleteTarget(null);
      await syncProjectData();
      toast.success("Scene deleted");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to delete scene");
    } finally {
      setDeletingScene(false);
    }
  }

  async function togglePrepped(scene: Scene) {
    const next = !scene.prepped;
    const apply = (prepped: boolean) =>
      onScenesChange(
        scenes.map((s) => (s.id === scene.id ? { ...s, prepped } : s))
      );
    apply(next);
    try {
      const res = await fetch("/api/scenes", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: scene.id, prepped: next }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error || "Failed to update scene");
    } catch (e) {
      apply(scene.prepped);
      toast.error(e instanceof Error ? e.message : "Failed to update scene");
    }
  }

  async function setAllPrepped(prepped: boolean) {
    const targets = scriptScenes.filter(
      (s) => !(lockedSceneIds?.has(s.id) ?? false)
    );
    const toUpdate = targets.filter((s) => s.prepped !== prepped);
    if (toUpdate.length === 0) return;

    const previous = scenes;
    onScenesChange(
      scenes.map((s) =>
        toUpdate.some((t) => t.id === s.id) ? { ...s, prepped } : s
      )
    );
    setBulkPrepping(true);
    try {
      await Promise.all(
        toUpdate.map(async (scene) => {
          const res = await fetch("/api/scenes", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id: scene.id, prepped }),
          });
          const data = (await res.json().catch(() => ({}))) as {
            error?: string;
          };
          if (!res.ok) throw new Error(data.error || "Failed to update scene");
        })
      );
    } catch (e) {
      onScenesChange(previous);
      toast.error(e instanceof Error ? e.message : "Failed to update scenes");
    } finally {
      setBulkPrepping(false);
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

      <Dialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open && !deletingScene) setDeleteTarget(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete this scene?</DialogTitle>
            <DialogDescription>
              {deleteTarget ? sceneSlugLabel(deleteTarget) : ""} — its canvas,
              chat and cheat sheet will be deleted too. Remaining scenes are
              renumbered in order.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              disabled={deletingScene}
              onClick={() => setDeleteTarget(null)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              size="sm"
              disabled={deletingScene}
              onClick={() => {
                if (deleteTarget) void deleteScene(deleteTarget);
              }}
            >
              {deletingScene ? "Deleting…" : "Delete scene"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
        <>
          <div className="shrink-0 space-y-1.5 border-b border-border px-3 py-2">
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 text-[11px] text-[var(--project-accent)]"
                disabled={bulkPrepping}
                onClick={() => void setAllPrepped(true)}
              >
                Select all
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 text-[11px] text-[var(--project-accent)]"
                disabled={bulkPrepping}
                onClick={() => void setAllPrepped(false)}
              >
                Deselect all
              </Button>
            </div>
            <p className="text-[10px] leading-relaxed text-muted-foreground">
              Double-click a scene to change its slug. Tick when prep is done.
            </p>
          </div>
          <ScrollArea className="min-h-0 flex-1">
            <ul role="listbox" aria-label="Scenes">
            {scriptScenes.map((scene, index) => {
              const selected = activeSceneId === scene.id;
              const shootLabel = shootDayOrderLabel(scene);
              const editing =
                draft?.mode === "edit" && draft.sceneId === scene.id;
              const locked = lockedSceneIds?.has(scene.id) ?? false;
              const firstLocked =
                locked &&
                (index === 0 ||
                  !(lockedSceneIds?.has(scriptScenes[index - 1].id) ?? false));

              if (locked) {
                return (
                  <Fragment key={scene.id}>
                    {firstLocked ? (
                      <li className="border-y border-border bg-muted/40 px-3 py-2">
                        <p className="text-[10px] leading-relaxed text-muted-foreground">
                          <Lock className="mr-1 inline size-3 align-[-2px]" />
                          {sceneCapDividerMessage(sceneCap ?? 15)}
                        </p>
                      </li>
                    ) : null}
                    <li
                      className="flex items-start opacity-45"
                      aria-disabled="true"
                    >
                      <span className="flex shrink-0 items-center pl-2.5 pt-3">
                        <Lock className="size-3.5 text-muted-foreground" />
                      </span>
                      <button
                        type="button"
                        onClick={() => toast.info(sceneLimitMessage())}
                        className="min-w-0 flex-1 cursor-not-allowed py-2.5 pl-2 pr-9 text-left text-muted-foreground"
                        title={sceneLimitMessage()}
                      >
                        <span className="block text-xs leading-snug">
                          {sceneSlugLabel(scene)}
                        </span>
                      </button>
                    </li>
                  </Fragment>
                );
              }

              if (editing) {
                return (
                  <SceneDraftRow
                    key={scene.id}
                    draft={draft}
                    saving={savingScene}
                    scrollIntoViewOnMount
                    onChange={setDraft}
                    onCancel={() => setDraft(null)}
                    onSave={() => void saveDraft()}
                  />
                );
              }

              return (
                <Fragment key={scene.id}>
                  <li
                    className={cn(
                      "group relative flex items-start",
                      selected
                        ? "bg-neutral-200 dark:bg-neutral-800"
                        : "hover:bg-neutral-100 dark:hover:bg-neutral-800/50"
                    )}
                  >
                    {selected ? (
                      <span
                        aria-hidden
                        className="absolute inset-y-0 left-0 w-[3px] rounded-r-sm bg-[var(--project-accent)]"
                      />
                    ) : null}
                    <label
                      className="flex shrink-0 cursor-pointer items-center pl-2.5 pt-3"
                      onClick={(e) => e.stopPropagation()}
                      onDoubleClick={(e) => e.stopPropagation()}
                    >
                      <input
                        type="checkbox"
                        className="size-3.5 accent-[var(--project-accent)]"
                        checked={scene.prepped}
                        aria-label={`Mark ${sceneSlugLabel(scene)} as prepped`}
                        onChange={() => void togglePrepped(scene)}
                      />
                    </label>
                    <button
                      type="button"
                      role="option"
                      aria-selected={selected}
                      onClick={() => onActiveSceneChange(scene.id)}
                      onDoubleClick={() =>
                        setDraft({
                          mode: "edit",
                          sceneId: scene.id,
                          heading: scene.heading,
                          number: scene.sceneNumber ?? "",
                        })
                      }
                      className={cn(
                        "min-w-0 flex-1 py-2.5 pl-2 pr-9 text-left transition-colors",
                        selected
                          ? "font-medium text-[var(--project-accent)]"
                          : "text-[var(--project-accent)]/70 hover:text-[var(--project-accent)]",
                        scene.prepped && "opacity-70"
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

                    <DropdownMenu>
                      <DropdownMenuTrigger
                        aria-label={`Scene options for ${sceneSlugLabel(scene)}`}
                        className={cn(
                          "absolute right-1.5 top-1.5 inline-flex size-6 items-center justify-center rounded-md text-muted-foreground opacity-0 transition-opacity hover:bg-background/80 hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100 data-popup-open:opacity-100"
                        )}
                      >
                        <MoreHorizontal className="size-3.5" />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="min-w-[11rem]">
                        <DropdownMenuItem
                          onClick={() =>
                            setDraft({
                              mode: "edit",
                              sceneId: scene.id,
                              heading: scene.heading,
                              number: scene.sceneNumber ?? "",
                            })
                          }
                        >
                          <Pencil className="size-3.5" />
                          Edit heading
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => startAddScene(scene.id)}
                        >
                          <Plus className="size-3.5" />
                          Insert scene below
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          variant="destructive"
                          onClick={() => setDeleteTarget(scene)}
                        >
                          <Trash2 className="size-3.5" />
                          Delete scene
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </li>

                  {draft?.mode === "add" && draft.afterSceneId === scene.id ? (
                    <SceneDraftRow
                      draft={draft}
                      saving={savingScene}
                      scrollIntoViewOnMount
                      onChange={setDraft}
                      onCancel={() => setDraft(null)}
                      onSave={() => void saveDraft()}
                    />
                  ) : null}
                </Fragment>
              );
            })}
          </ul>
        </ScrollArea>
        </>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 px-4 py-6 text-center">
          {draft?.mode === "add" ? (
            <ul className="w-full">
              <SceneDraftRow
                draft={draft}
                saving={savingScene}
                onChange={setDraft}
                onCancel={() => setDraft(null)}
                onSave={() => void saveDraft()}
              />
            </ul>
          ) : (
            <>
              <p className="text-xs text-muted-foreground">
                {activeScriptId
                  ? "No scenes yet — upload a script PDF below, or add scenes by hand."
                  : "Add an episode to get started."}
              </p>
              {activeScriptId ? (
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1.5"
                  onClick={() => startAddScene(null)}
                >
                  <Plus className="size-3.5" />
                  Add scene
                </Button>
              ) : null}
            </>
          )}
        </div>
      )}

      {hasScenes && activeScriptId ? (
        <div className="shrink-0 border-t border-border bg-background">
          {draft?.mode === "add" && draft.afterSceneId === null ? (
            <ul>
              <SceneDraftRow
                draft={draft}
                saving={savingScene}
                onChange={setDraft}
                onCancel={() => setDraft(null)}
                onSave={() => void saveDraft()}
              />
            </ul>
          ) : (
            <button
              type="button"
              className={cn(
                "flex w-full items-center gap-1.5 px-3 py-2 text-left text-[11px] text-[var(--project-accent)]",
                atSceneCap
                  ? "cursor-not-allowed opacity-60"
                  : "hover:bg-muted/40"
              )}
              title={atSceneCap ? sceneLimitMessage() : undefined}
              onClick={() => startAddScene(null)}
            >
              {atSceneCap ? (
                <Lock className="size-3.5" />
              ) : (
                <Plus className="size-3.5" />
              )}
              Add scene
            </button>
          )}
        </div>
      ) : null}

      <div className="shrink-0 space-y-2 border-t border-border px-3 py-2">
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5 text-[var(--project-accent)]"
            disabled={uploading || !activeScriptId}
            onClick={() => fileRef.current?.click()}
          >
            <FileUp className="size-3.5" />
            {uploading
              ? "Parsing PDF…"
              : activeScriptId
                ? "Replace Script PDF"
                : "Upload Script PDF"}
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
            lockedMessage={scriptLimitMessage()}
            onAdded={async (scriptId) => {
              await syncProjectData(scriptId);
            }}
          />
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
        <p className="text-[10px] leading-relaxed text-muted-foreground">
          We parse/store scene headings only — big print and dialogue stays in your PDF.
        </p>
      </div>
    </div>
  );
}

function SceneDraftRow({
  draft,
  saving,
  scrollIntoViewOnMount = false,
  onChange,
  onCancel,
  onSave,
}: {
  draft: SceneDraft;
  saving: boolean;
  scrollIntoViewOnMount?: boolean;
  onChange: (draft: SceneDraft) => void;
  onCancel: () => void;
  onSave: () => void;
}) {
  const rowRef = useRef<HTMLLIElement>(null);

  useEffect(() => {
    if (scrollIntoViewOnMount) {
      rowRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }, [scrollIntoViewOnMount]);

  return (
    <li
      ref={rowRef}
      className="border-y border-border bg-muted/40 px-3 py-2"
    >
      <div className="flex gap-1.5">
        <Input
          value={draft.number}
          onChange={(e) => onChange({ ...draft, number: e.target.value })}
          placeholder="#"
          aria-label="Scene number"
          disabled={saving}
          className="h-7 w-11 shrink-0 px-1 text-center text-xs"
        />
        <Input
          autoFocus
          value={draft.heading}
          onChange={(e) => onChange({ ...draft, heading: e.target.value })}
          placeholder="INT. KITCHEN - DAY"
          aria-label="Scene heading"
          disabled={saving}
          className="h-7 min-w-0 flex-1 text-xs"
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              onSave();
            } else if (e.key === "Escape") {
              e.preventDefault();
              onCancel();
            }
          }}
        />
      </div>
      <div className="mt-1.5 flex items-center justify-end gap-1">
        <Button
          size="sm"
          variant="ghost"
          className="h-6 px-2 text-[11px]"
          disabled={saving}
          onClick={onCancel}
        >
          Cancel
        </Button>
        <Button
          size="sm"
          className="h-6 px-2 text-[11px]"
          disabled={saving}
          onClick={onSave}
        >
          {saving ? "Saving…" : "Save"}
        </Button>
      </div>
    </li>
  );
}
