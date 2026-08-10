"use client";

import { useEffect, useState } from "react";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import type { Project, Script } from "@/types";
import { toast } from "sonner";

type ScriptDraft = {
  id: string;
  episodeNumber: number;
  title: string;
};

export function EditProjectDialog({
  project,
  onSaved,
}: {
  project: Project;
  onSaved: (project: Project) => void;
}) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState(project.title);
  const [scriptDrafts, setScriptDrafts] = useState<ScriptDraft[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTitle(project.title);
    setLoading(true);
    void (async () => {
      try {
        const res = await fetch(`/api/scripts?projectId=${project.id}`);
        const data = (await res.json()) as Script[];
        if (!res.ok) throw new Error("Failed to load episodes");
        setScriptDrafts(
          data.map((s) => ({
            id: s.id,
            episodeNumber: s.episodeNumber,
            title: s.title,
          }))
        );
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to load episodes");
        setOpen(false);
      } finally {
        setLoading(false);
      }
    })();
  }, [open, project.id, project.title]);

  function updateScript(id: string, patch: Partial<ScriptDraft>) {
    setScriptDrafts((prev) =>
      prev.map((s) => (s.id === id ? { ...s, ...patch } : s))
    );
  }

  async function save() {
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      toast.error("Project title is required");
      return;
    }
    for (const s of scriptDrafts) {
      if (!s.title.trim()) {
        toast.error("Each episode needs a title");
        return;
      }
      if (!Number.isFinite(s.episodeNumber) || s.episodeNumber < 1) {
        toast.error("Episode numbers must be 1 or higher");
        return;
      }
    }

    setSaving(true);
    try {
      const projectRes = await fetch(`/api/projects/${project.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: trimmedTitle }),
      });
      const updatedProject = await projectRes.json();
      if (!projectRes.ok) {
        throw new Error(updatedProject.error || "Failed to update project");
      }

      for (const s of scriptDrafts) {
        const res = await fetch(`/api/scripts/${s.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: s.title.trim(),
            episodeNumber: Math.floor(s.episodeNumber),
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || "Failed to update episode");
        }
      }

      onSaved(updatedProject as Project);
      toast.success("Project details saved");
      setOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="gap-1.5 text-xs text-[var(--project-accent)]"
          />
        }
      >
        <Pencil className="size-3.5 stroke-[1.5]" />
        Edit
      </DialogTrigger>

      <DialogContent className="max-h-[85vh] w-[min(96vw,32rem)] max-w-[min(96vw,32rem)] gap-0 p-0 sm:max-w-[min(96vw,32rem)]">
        <DialogHeader className="border-b border-border px-4 py-3">
          <DialogTitle>Edit project</DialogTitle>
          <DialogDescription>
            Update the project title and each episode’s number and title. Episode
            numbers drive the E# labels on canvas and schedule.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[60vh] space-y-5 overflow-y-auto px-4 py-4">
          <div className="space-y-2">
            <Label htmlFor={`project-title-${project.id}`}>Project title</Label>
            <Input
              id={`project-title-${project.id}`}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              disabled={loading || saving}
            />
          </div>

          <div className="space-y-3">
            <Label>Episodes</Label>
            {loading ? (
              <p className="text-xs text-muted-foreground">Loading episodes…</p>
            ) : scriptDrafts.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                No episodes yet. Open the project to upload scripts.
              </p>
            ) : (
              scriptDrafts.map((s) => (
                <div
                  key={s.id}
                  className="space-y-2 rounded-md border border-border p-3"
                >
                  <div className="space-y-1.5">
                    <Label
                      htmlFor={`ep-num-${s.id}`}
                      className="text-xs text-muted-foreground"
                    >
                      Episode number
                    </Label>
                    <Input
                      id={`ep-num-${s.id}`}
                      type="number"
                      min={1}
                      step={1}
                      className="w-28"
                      value={s.episodeNumber}
                      disabled={saving}
                      onChange={(e) => {
                        const n = Number(e.target.value);
                        updateScript(s.id, {
                          episodeNumber: Number.isFinite(n)
                            ? n
                            : s.episodeNumber,
                        });
                      }}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label
                      htmlFor={`ep-title-${s.id}`}
                      className="text-xs text-muted-foreground"
                    >
                      Episode title
                    </Label>
                    <Input
                      id={`ep-title-${s.id}`}
                      value={s.title}
                      disabled={saving}
                      onChange={(e) =>
                        updateScript(s.id, { title: e.target.value })
                      }
                    />
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <DialogFooter className="mx-0 mb-0 rounded-none">
          <Button
            type="button"
            variant="outline"
            onClick={() => setOpen(false)}
            disabled={saving}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="accent"
            onClick={() => void save()}
            disabled={loading || saving}
          >
            {saving ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
