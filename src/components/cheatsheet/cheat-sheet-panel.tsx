"use client";

import { useEffect, useState } from "react";
import { Download, Printer, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { ExportDialog } from "@/components/project/export-dialog";
import { downloadExport } from "@/lib/export-client";
import { formatActionVerbs } from "@/lib/action-verbs";
import type {
  BeatEntry,
  CharacterNotes,
  CheatSheet,
  CheatSheetContent,
  Scene,
  Script,
} from "@/types";
import { normalizeCheatSheetContent } from "@/lib/mappers";
import { toast } from "sonner";

export function CheatSheetPanel({
  projectId,
  projectTitle,
  scripts,
  scenes,
  sceneId,
  sceneHeading,
  cheatSheet,
  onChange,
}: {
  projectId: string;
  projectTitle: string;
  scripts: Script[];
  scenes: Scene[];
  sceneId: string | null;
  sceneHeading: string | null;
  cheatSheet: CheatSheet | null;
  onChange: (sheet: CheatSheet) => void;
}) {
  const [content, setContent] = useState<CheatSheetContent>(() =>
    normalizeCheatSheetContent(cheatSheet?.content ?? { beats: [] })
  );
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [includeCanvas, setIncludeCanvas] = useState(true);

  useEffect(() => {
    setContent(
      normalizeCheatSheetContent(cheatSheet?.content ?? { beats: [] })
    );
    setDirty(false);
  }, [cheatSheet]);

  function updateBeat(bi: number, patch: Partial<BeatEntry>) {
    setContent((c) => {
      const beats = [...(c.beats ?? [])];
      beats[bi] = { ...beats[bi], ...patch };
      return { ...c, beats };
    });
    setDirty(true);
  }

  function updateCharacter(
    bi: number,
    ci: number,
    patch: Partial<CharacterNotes>
  ) {
    setContent((c) => {
      const beats = [...(c.beats ?? [])];
      const characters = [...(beats[bi]?.characters ?? [])];
      characters[ci] = { ...characters[ci], ...patch };
      beats[bi] = { ...beats[bi], characters };
      return { ...c, beats };
    });
    setDirty(true);
  }

  async function save() {
    setSaving(true);
    try {
      const res = await fetch("/api/cheatsheet", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          sceneId: cheatSheet?.sceneId ?? sceneId,
          content,
        }),
      });
      const sheet = (await res.json()) as CheatSheet;
      onChange(sheet);
      setDirty(false);
      toast.success("Cheat sheet saved");
    } catch {
      toast.error("Failed to save");
    } finally {
      setSaving(false);
    }
  }

  function exportPdf() {
    const scope = cheatSheet?.sceneId ?? sceneId;
    const params = new URLSearchParams({
      projectId,
      includeCanvas: includeCanvas ? "1" : "0",
    });
    if (scope) params.set("sceneId", scope);
    void downloadExport(params);
  }

  function printView() {
    window.print();
  }

  const exportPicker =
    scenes.length > 0 ? (
      <ExportDialog
        projectId={projectId}
        scripts={scripts}
        scenes={scenes}
        activeSceneId={sceneId}
        mode="sheet"
        triggerLabel="Export…"
        triggerVariant="outline"
        triggerSize="sm"
        showIcon
      />
    ) : null;

  if (!cheatSheet && (content.beats?.length ?? 0) === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
        <p className="text-sm font-medium">
          {sceneHeading
            ? `No cheat sheet for ${sceneHeading} yet`
            : "No cheat sheet yet"}
        </p>
        <p className="max-w-xs text-xs text-muted-foreground">
          Riff with the agent, then hit <strong>Distill cheat sheet</strong> to
          generate beat-by-beat performance notes for this scene.
        </p>
        {exportPicker ? (
          <div className="mt-2 flex flex-col items-center gap-2">
            {exportPicker}
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border px-3 py-2 print:hidden">
        <div className="mr-auto min-w-0">
          <p className="text-sm font-medium">Cheat sheet</p>
          {cheatSheet ? (
            <p className="truncate text-[11px] text-muted-foreground">
              {sceneHeading ? `${sceneHeading} · ` : ""}v{cheatSheet.version}
              {dirty ? " · unsaved edits" : ""}
            </p>
          ) : null}
        </div>
        <Button
          size="sm"
          variant="outline"
          className="gap-1.5"
          disabled={!dirty || saving}
          onClick={save}
        >
          <Save className="size-3.5" />
          Save
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="gap-1.5"
          onClick={printView}
        >
          <Printer className="size-3.5" />
          Print
        </Button>
        <Button size="sm" className="gap-1.5" onClick={exportPdf}>
          <Download className="size-3.5" />
          This scene
        </Button>
        {exportPicker}
        <label className="flex cursor-pointer items-center gap-1.5 text-[11px] text-muted-foreground">
          <input
            type="checkbox"
            className="size-3.5 accent-primary"
            checked={includeCanvas}
            onChange={(e) => setIncludeCanvas(e.target.checked)}
          />
          Include canvas
        </label>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <div className="cheat-print space-y-6 p-4" id="cheat-sheet-print">
          <div className="hidden print:block">
            <p className="text-xs uppercase tracking-widest text-muted-foreground">
              Performance Notes
            </p>
            <h1 className="text-2xl font-semibold">{projectTitle}</h1>
            {sceneHeading ? (
              <p className="text-sm text-muted-foreground">{sceneHeading}</p>
            ) : null}
          </div>

          <div>
            <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Director notes
            </label>
            <Textarea
              value={content.notes ?? ""}
              onChange={(e) => {
                setContent((c) => ({ ...c, notes: e.target.value }));
                setDirty(true);
              }}
              placeholder="Optional overall notes…"
              className="min-h-[60px] text-sm"
            />
          </div>

          {(content.beats ?? []).map((beat, bi) => (
            <div
              key={bi}
              className="space-y-3 rounded-lg border border-border p-3"
            >
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="secondary">Beat {bi + 1}</Badge>
                <Input
                  value={beat.beat}
                  onChange={(e) => updateBeat(bi, { beat: e.target.value })}
                  className="h-8 max-w-xs text-sm font-medium"
                />
              </div>
              <Input
                value={beat.summary ?? ""}
                onChange={(e) => updateBeat(bi, { summary: e.target.value })}
                placeholder="What shifts in this beat…"
                className="h-8 text-xs"
              />

              <div className="space-y-4">
                {(beat.characters ?? []).map((ch, ci) => (
                  <div
                    key={ci}
                    className="space-y-2 border-t border-border/60 pt-3"
                  >
                    <div className="flex items-center gap-2">
                      <Input
                        value={ch.name}
                        onChange={(e) =>
                          updateCharacter(bi, ci, { name: e.target.value })
                        }
                        className="h-7 max-w-[180px] text-xs"
                      />
                    </div>

                    <Field
                      label="Objective"
                      value={ch.objective}
                      onChange={(v) =>
                        updateCharacter(bi, ci, { objective: v })
                      }
                    />
                    <Field
                      label="Obstacle"
                      value={ch.obstacle}
                      onChange={(v) =>
                        updateCharacter(bi, ci, { obstacle: v })
                      }
                    />

                    <div>
                      <p className="mb-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                        Actions
                      </p>
                      <div className="space-y-2">
                        {(ch.actions ?? []).map((a, ai) => {
                          const syns = a.synonyms ?? [];
                          const preview = formatActionVerbs(a);
                          return (
                            <div key={ai} className="space-y-1">
                              <div className="flex flex-wrap gap-2">
                                <Input
                                  value={a.verb}
                                  onChange={(e) => {
                                    const actions = [...(ch.actions ?? [])];
                                    actions[ai] = {
                                      ...actions[ai],
                                      verb: e.target.value,
                                      synonyms: syns,
                                    };
                                    updateCharacter(bi, ci, { actions });
                                  }}
                                  placeholder="verb"
                                  className="h-8 w-24 text-xs"
                                />
                                <Input
                                  value={syns[0] ?? ""}
                                  onChange={(e) => {
                                    const next = [
                                      e.target.value,
                                      syns[1] ?? "",
                                    ];
                                    const actions = [...(ch.actions ?? [])];
                                    actions[ai] = {
                                      ...actions[ai],
                                      synonyms: next.filter(Boolean),
                                    };
                                    updateCharacter(bi, ci, { actions });
                                  }}
                                  placeholder="or…"
                                  className="h-8 w-24 text-xs"
                                />
                                <Input
                                  value={syns[1] ?? ""}
                                  onChange={(e) => {
                                    const next = [
                                      syns[0] ?? "",
                                      e.target.value,
                                    ];
                                    const actions = [...(ch.actions ?? [])];
                                    actions[ai] = {
                                      ...actions[ai],
                                      synonyms: next.filter(Boolean),
                                    };
                                    updateCharacter(bi, ci, { actions });
                                  }}
                                  placeholder="or…"
                                  className="h-8 w-24 text-xs"
                                />
                                <Input
                                  value={a.moment}
                                  onChange={(e) => {
                                    const actions = [...(ch.actions ?? [])];
                                    actions[ai] = {
                                      ...actions[ai],
                                      moment: e.target.value,
                                    };
                                    updateCharacter(bi, ci, { actions });
                                  }}
                                  placeholder="on this line / moment"
                                  className="h-8 min-w-[8rem] flex-1 text-xs"
                                />
                              </div>
                              {preview ? (
                                <p className="text-[10px] text-muted-foreground">
                                  {preview}
                                  {a.moment?.trim()
                                    ? ` — ${a.moment.trim()}`
                                    : ""}
                                </p>
                              ) : null}
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    <Field
                      label="Adjustment (as if…)"
                      value={ch.adjustments}
                      onChange={(v) =>
                        updateCharacter(bi, ci, { adjustments: v })
                      }
                    />
                    <Field
                      label="Pitfalls"
                      value={ch.pitfalls}
                      onChange={(v) =>
                        updateCharacter(bi, ci, { pitfalls: v })
                      }
                    />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <p className="mb-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <Textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="min-h-[52px] text-xs"
      />
    </div>
  );
}
