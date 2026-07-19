"use client";

import { useEffect, useState } from "react";
import { ChevronDown, Download, FileStack, Printer, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { BeatEntry, CharacterNotes, CheatSheet, CheatSheetContent } from "@/types";
import { normalizeCheatSheetContent } from "@/lib/mappers";
import { toast } from "sonner";

async function downloadExport(params: URLSearchParams) {
  const res = await fetch(`/api/export?${params}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Export failed" }));
    toast.error(err.error || "Export failed");
    return;
  }
  const blob = await res.blob();
  const disposition = res.headers.get("Content-Disposition") ?? "";
  const match = disposition.match(/filename="([^"]+)"/);
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = match?.[1] ?? "cheat-sheets";
  a.click();
  URL.revokeObjectURL(a.href);
}

function ExportAllMenu({
  projectId,
  includeCanvas,
}: {
  projectId: string;
  includeCanvas: boolean;
}) {
  const canvasFlag = includeCanvas ? "1" : "0";
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button size="sm" variant="outline" className="gap-1.5">
            <FileStack className="size-3.5" />
            Export all
            <ChevronDown className="size-3" />
          </Button>
        }
      />
      <DropdownMenuContent align="end">
        <DropdownMenuItem
          onClick={() =>
            void downloadExport(
              new URLSearchParams({
                projectId,
                scope: "all",
                order: "script",
                includeCanvas: canvasFlag,
              })
            )
          }
        >
          Single PDF (script order)
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() =>
            void downloadExport(
              new URLSearchParams({
                projectId,
                scope: "all",
                format: "zip",
                order: "script",
                includeCanvas: canvasFlag,
              })
            )
          }
        >
          Separate PDFs zip (script order)
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() =>
            void downloadExport(
              new URLSearchParams({
                projectId,
                scope: "all",
                order: "shoot",
                includeCanvas: canvasFlag,
              })
            )
          }
        >
          Single PDF (shoot order)
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() =>
            void downloadExport(
              new URLSearchParams({
                projectId,
                scope: "all",
                format: "zip",
                order: "shoot",
                includeCanvas: canvasFlag,
              })
            )
          }
        >
          Separate PDFs zip (shoot order)
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function CheatSheetPanel({
  projectId,
  projectTitle,
  sceneId,
  sceneHeading,
  cheatSheet,
  hasMultipleScenes,
  onChange,
}: {
  projectId: string;
  projectTitle: string;
  sceneId: string | null;
  sceneHeading: string | null;
  cheatSheet: CheatSheet | null;
  hasMultipleScenes: boolean;
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

  if (!cheatSheet && (content.beats?.length ?? 0) === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
        <p className="text-sm font-medium">
          {sceneHeading ? `No cheat sheet for ${sceneHeading} yet` : "No cheat sheet yet"}
        </p>
        <p className="max-w-xs text-xs text-muted-foreground">
          Riff with the agent, then hit <strong>Distill cheat sheet</strong> to
          generate beat-by-beat performance notes for this scene.
        </p>
        {hasMultipleScenes ? (
          <div className="mt-2 flex flex-col items-center gap-2">
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <input
                type="checkbox"
                checked={includeCanvas}
                onChange={(e) => setIncludeCanvas(e.target.checked)}
                className="size-3.5 accent-primary"
              />
              Include canvas references
            </label>
            <ExportAllMenu
              projectId={projectId}
              includeCanvas={includeCanvas}
            />
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
          Export PDF
        </Button>
        {hasMultipleScenes ? (
          <ExportAllMenu
            projectId={projectId}
            includeCanvas={includeCanvas}
          />
        ) : null}
        <label className="flex cursor-pointer items-center gap-1.5 text-[11px] text-muted-foreground">
          <input
            type="checkbox"
            className="size-3.5 accent-primary"
            checked={includeCanvas}
            onChange={(e) => setIncludeCanvas(e.target.checked)}
          />
          Include canvas references
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
              placeholder="Overall notes for set…"
              className="min-h-16 text-sm"
            />
          </div>

          {(content.beats ?? []).map((beat, bi) => (
            <div
              key={bi}
              className="overflow-hidden rounded-md border border-border bg-card/40"
            >
              <div className="bg-foreground px-3 py-2 text-background">
                <Input
                  value={beat.beat}
                  onChange={(e) => updateBeat(bi, { beat: e.target.value })}
                  className="h-8 border-0 bg-transparent px-0 text-sm font-semibold text-background shadow-none focus-visible:ring-0"
                />
                <Input
                  value={beat.summary ?? ""}
                  onChange={(e) => updateBeat(bi, { summary: e.target.value })}
                  placeholder="Beat summary…"
                  className="mt-1 h-7 border-0 bg-transparent px-0 text-xs text-background/70 shadow-none focus-visible:ring-0"
                />
              </div>

              <div className="divide-y divide-border">
                {(beat.characters ?? []).map((ch, ci) => (
                  <div key={ci} className="space-y-3 p-3">
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary">{ch.name}</Badge>
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
                        {(ch.actions ?? []).map((a, ai) => (
                          <div key={ai} className="flex gap-2">
                            <Input
                              value={a.verb}
                              onChange={(e) => {
                                const actions = [...(ch.actions ?? [])];
                                actions[ai] = {
                                  ...actions[ai],
                                  verb: e.target.value,
                                };
                                updateCharacter(bi, ci, { actions });
                              }}
                              placeholder="verb"
                              className="h-8 w-28 text-xs"
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
                              className="h-8 flex-1 text-xs"
                            />
                          </div>
                        ))}
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
        className="min-h-14 text-sm"
      />
    </div>
  );
}
