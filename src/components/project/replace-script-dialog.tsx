"use client";

import { useMemo, useState } from "react";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { SceneDiffEntry } from "@/lib/script-diff";
import { cn } from "@/lib/utils";

function statusLabel(status: SceneDiffEntry["status"]): string {
  switch (status) {
    case "unchanged":
      return "Match";
    case "changed":
      return "Changed";
    case "added":
      return "New";
    case "removed":
      return "Removed";
    case "ambiguous":
      return "Unmatched";
  }
}

function sceneLabel(entry: SceneDiffEntry): string {
  const num =
    entry.newScene?.sceneNumber ?? entry.oldScene?.sceneNumber ?? null;
  const heading = entry.newScene?.heading ?? entry.oldScene?.heading ?? "Scene";
  return num ? `${num}. ${heading}` : heading;
}

function entryHint(entry: SceneDiffEntry): string | null {
  switch (entry.status) {
    case "changed":
      return "Heading differs — review before keeping prep.";
    case "removed":
    case "ambiguous":
      return "Canvas, chat, and cheat sheet will be deleted.";
    case "added":
      return "New scene — starts with empty prep.";
    default:
      return null;
  }
}

function buildTransfers(diff: SceneDiffEntry[]): Record<string, boolean> {
  const next: Record<string, boolean> = {};
  for (const e of diff) {
    if (
      e.oldScene &&
      (e.status === "unchanged" || e.status === "changed")
    ) {
      next[e.oldScene.id] = e.transferDefault;
    }
  }
  return next;
}

function transferableIds(diff: SceneDiffEntry[]): string[] {
  return diff
    .filter(
      (e) =>
        e.oldScene &&
        (e.status === "unchanged" || e.status === "changed")
    )
    .map((e) => e.oldScene!.id);
}

export function ReplaceScriptDialog({
  open,
  onOpenChange,
  diff,
  applying,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  diff: SceneDiffEntry[];
  applying?: boolean;
  onConfirm: (transfers: Record<string, boolean>) => void;
}) {
  const [transfers, setTransfers] = useState(() => buildTransfers(diff));

  const counts = useMemo(() => {
    const c = {
      unchanged: 0,
      changed: 0,
      added: 0,
      removed: 0,
      ambiguous: 0,
    };
    for (const e of diff) c[e.status] += 1;
    return c;
  }, [diff]);

  const transferable = useMemo(() => transferableIds(diff), [diff]);
  const transferCount = Object.values(transfers).filter(Boolean).length;

  function setAllKeep(keep: boolean) {
    setTransfers((prev) => {
      const next = { ...prev };
      for (const id of transferable) next[id] = keep;
      return next;
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="flex max-h-[min(85dvh,40rem)] w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl"
        style={{ display: "flex" }}
      >
        <DialogHeader className="shrink-0 space-y-1.5 border-b border-border px-4 py-3 pr-12">
          <DialogTitle>Review script revision</DialogTitle>
          <DialogDescription>
            Matched scenes can keep their canvas, chat, cheat sheets, and shoot
            day. Removed or unmatched prep is deleted.
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
                disabled={transferable.length === 0}
                onClick={() => setAllKeep(true)}
              >
                Keep all prep
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-7 text-[11px]"
                disabled={transferable.length === 0}
                onClick={() => setAllKeep(false)}
              >
                Clear all
              </Button>
              <span className="ml-auto text-[11px] text-muted-foreground">
                {transferCount} keeping prep
              </span>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3">
              <ul className="space-y-1 py-2">
                {diff.map((entry, i) => {
                  const canTransfer =
                    entry.oldScene &&
                    (entry.status === "unchanged" ||
                      entry.status === "changed");
                  const id =
                    entry.oldScene?.id ?? entry.newScene?.key ?? `row_${i}`;
                  const hint = entryHint(entry);
                  const status = statusLabel(entry.status);

                  if (canTransfer && entry.oldScene) {
                    return (
                      <li key={id}>
                        <label className="flex cursor-pointer items-start gap-2 rounded-md px-1.5 py-1.5 text-xs hover:bg-muted/50">
                          <input
                            type="checkbox"
                            className="mt-0.5 size-3.5 shrink-0 accent-primary"
                            checked={transfers[entry.oldScene.id] ?? false}
                            onChange={(e) =>
                              setTransfers((prev) => ({
                                ...prev,
                                [entry.oldScene!.id]: e.target.checked,
                              }))
                            }
                          />
                          <span className="min-w-0 leading-snug">
                            <span className="text-muted-foreground">
                              {status} ·{" "}
                            </span>
                            {sceneLabel(entry)}
                            {hint ? (
                              <span className="mt-0.5 block text-[10px] text-muted-foreground">
                                {hint}
                              </span>
                            ) : null}
                          </span>
                        </label>
                      </li>
                    );
                  }

                  return (
                    <li key={id}>
                      <div
                        className={cn(
                          "flex items-start gap-2 rounded-md px-1.5 py-1.5 text-xs",
                          entry.status === "removed" ||
                            entry.status === "ambiguous"
                            ? "text-destructive/90"
                            : "text-muted-foreground"
                        )}
                      >
                        <span className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                        <span className="min-w-0 leading-snug">
                          <span className="font-medium">{status} · </span>
                          {sceneLabel(entry)}
                          {hint ? (
                            <span className="mt-0.5 block text-[10px] opacity-80">
                              {hint}
                            </span>
                          ) : null}
                        </span>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>

          {/* Summary column */}
          <div className="flex w-full shrink-0 flex-col bg-muted/20 sm:w-[15.5rem] sm:min-h-0">
            <div className="shrink-0 space-y-2.5 border-b border-border px-3 py-3 text-xs">
              <p className="font-medium text-muted-foreground">Summary</p>
              <dl className="space-y-1 text-[11px]">
                {counts.unchanged > 0 ? (
                  <div className="flex justify-between gap-2">
                    <dt className="text-muted-foreground">Match</dt>
                    <dd className="font-medium tabular-nums">{counts.unchanged}</dd>
                  </div>
                ) : null}
                {counts.changed > 0 ? (
                  <div className="flex justify-between gap-2">
                    <dt className="text-muted-foreground">Changed</dt>
                    <dd className="font-medium tabular-nums">{counts.changed}</dd>
                  </div>
                ) : null}
                {counts.added > 0 ? (
                  <div className="flex justify-between gap-2">
                    <dt className="text-muted-foreground">New</dt>
                    <dd className="font-medium tabular-nums">{counts.added}</dd>
                  </div>
                ) : null}
                {counts.removed > 0 ? (
                  <div className="flex justify-between gap-2">
                    <dt className="text-muted-foreground">Removed</dt>
                    <dd className="font-medium tabular-nums text-destructive">
                      {counts.removed}
                    </dd>
                  </div>
                ) : null}
                {counts.ambiguous > 0 ? (
                  <div className="flex justify-between gap-2">
                    <dt className="text-muted-foreground">Unmatched</dt>
                    <dd className="font-medium tabular-nums text-destructive">
                      {counts.ambiguous}
                    </dd>
                  </div>
                ) : null}
              </dl>
            </div>
            <div className="flex flex-1 flex-col px-3 py-3 text-[11px] leading-relaxed text-muted-foreground">
              <p className="font-medium text-foreground/80">What happens</p>
              <ul className="mt-2 list-inside list-disc space-y-1.5">
                <li>Checked scenes keep canvas, chat, cheat sheets, and shoot day.</li>
                <li>Removed or unmatched scenes lose all prep permanently.</li>
                <li>New scenes start with an empty canvas.</li>
              </ul>
            </div>
          </div>
        </div>

        <div className="flex shrink-0 items-center justify-between gap-2 border-t border-border px-4 py-3">
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={applying}
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            size="sm"
            className="gap-1.5"
            disabled={applying}
            onClick={() => onConfirm(transfers)}
          >
            <Check className="size-3.5" />
            {applying ? "Applying…" : "Apply revision"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
