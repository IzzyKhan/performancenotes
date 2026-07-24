"use client";

import { useMemo, useState } from "react";
import { Plus } from "lucide-react";
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
import {
  ScriptEpisodeForm,
  type ScriptEpisodeDraft,
} from "@/components/project/script-episode-form";
import { fileWithSafeName } from "@/lib/multipart";
import { postWithRetry, snapshotFile } from "@/lib/upload-client";
import { toast } from "sonner";
import type { Script } from "@/types";

function nextEpisodeNumber(scripts: Script[]): number {
  if (scripts.length === 0) return 1;
  return Math.max(...scripts.map((s) => s.episodeNumber || 0)) + 1;
}

function emptyDraft(scripts: Script[]): ScriptEpisodeDraft {
  const ep = nextEpisodeNumber(scripts);
  return {
    episodeNumber: ep,
    title: `Episode ${ep}`,
    mode: "pdf",
    text: "",
    file: null,
  };
}

export function AddScriptDialog({
  projectId,
  scripts,
  disabled,
  onAdded,
}: {
  projectId: string;
  scripts: Script[];
  disabled?: boolean;
  onAdded: (scriptId?: string) => Promise<void> | void;
}) {
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const initial = useMemo(() => emptyDraft(scripts), [scripts]);
  const [draft, setDraft] = useState<ScriptEpisodeDraft>(initial);

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) setDraft(emptyDraft(scripts));
  }

  async function submit() {
    const epNum =
      Number.isFinite(draft.episodeNumber) && draft.episodeNumber >= 1
        ? Math.floor(draft.episodeNumber)
        : nextEpisodeNumber(scripts);
    const title =
      draft.title.trim() ||
      (draft.file ? draft.file.name.replace(/\.pdf$/i, "") : `Episode ${epNum}`);

    if (draft.mode === "pdf" && !draft.file) {
      toast.error("Choose a PDF, or switch to Paste");
      return;
    }
    if (draft.mode === "typed" && !draft.text.trim()) {
      toast.error("Paste script text, or switch to PDF");
      return;
    }

    setSubmitting(true);
    const progress = toast.loading(`Adding ${title}…`);
    try {
      let scriptId: string | undefined;
      if (draft.mode === "pdf" && draft.file) {
        const form = new FormData();
        form.append("projectId", projectId);
        form.append("title", title);
        form.append("episodeNumber", String(epNum));
        form.append("file", fileWithSafeName(await snapshotFile(draft.file)));
        const data = (await postWithRetry("/api/scripts", form, {
          label: "PDF upload",
          timeoutMs: 180_000,
          retries: 0,
        })) as { script?: { id?: string }; sceneCount?: number };
        scriptId =
          typeof data.script?.id === "string" ? data.script.id : undefined;
        await onAdded(scriptId);
        toast.success(
          typeof data.sceneCount === "number" && data.sceneCount > 1
            ? `Episode added — ${data.sceneCount} scenes`
            : "Episode added",
          { id: progress }
        );
      } else {
        const data = (await postWithRetry(
          "/api/scripts",
          JSON.stringify({
            projectId,
            title,
            episodeNumber: epNum,
            rawText: draft.text.trim(),
            sourceType: "typed",
          }),
          {
            label: "Add episode",
            timeoutMs: 60_000,
            retries: 0,
          }
        )) as { script?: { id?: string }; sceneCount?: number };
        scriptId =
          typeof data.script?.id === "string" ? data.script.id : undefined;
        await onAdded(scriptId);
        toast.success(
          typeof data.sceneCount === "number" && data.sceneCount > 1
            ? `Episode added — ${data.sceneCount} scenes`
            : "Episode added",
          { id: progress }
        );
      }
      setOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to add episode", {
        id: progress,
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger
        render={
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="gap-1.5"
            disabled={disabled}
          />
        }
      >
        <Plus className="size-3.5" />
        Add episode
      </DialogTrigger>

      <DialogContent className="max-h-[85vh] w-[min(96vw,32rem)] max-w-[min(96vw,32rem)] gap-0 p-0 sm:max-w-[min(96vw,32rem)]">
        <DialogHeader className="border-b border-border px-4 py-3">
          <DialogTitle>Add episode</DialogTitle>
          <DialogDescription>
            Set the episode number and title, then upload a PDF or paste the
            script text.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[60vh] overflow-y-auto px-4 py-4">
          <ScriptEpisodeForm
            value={draft}
            onChange={(patch) => setDraft((prev) => ({ ...prev, ...patch }))}
            disabled={submitting}
            showEpisodeNumber
            idPrefix="add-ep"
          />
        </div>

        <DialogFooter className="mx-0 mb-0 rounded-none">
          <Button
            type="button"
            variant="outline"
            disabled={submitting}
            onClick={() => setOpen(false)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            disabled={submitting}
            onClick={() => void submit()}
          >
            {submitting ? "Adding…" : "Add episode"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
