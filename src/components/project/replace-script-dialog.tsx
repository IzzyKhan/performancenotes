"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { SceneDiffEntry } from "@/lib/script-diff";

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

function statusVariant(
  status: SceneDiffEntry["status"]
): "default" | "secondary" | "destructive" | "outline" {
  switch (status) {
    case "unchanged":
      return "secondary";
    case "changed":
      return "default";
    case "added":
      return "outline";
    case "removed":
    case "ambiguous":
      return "destructive";
  }
}

function sceneLabel(entry: SceneDiffEntry): string {
  const num =
    entry.newScene?.sceneNumber ?? entry.oldScene?.sceneNumber ?? null;
  const heading = entry.newScene?.heading ?? entry.oldScene?.heading ?? "Scene";
  return num ? `${num} · ${heading}` : heading;
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

  const transferCount = Object.values(transfers).filter(Boolean).length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-lg">
        <DialogHeader className="px-4 pt-4 pr-12">
          <DialogTitle>Review script revision</DialogTitle>
          <DialogDescription>
            Matched scenes can keep their canvas, chat, cheat sheets, and shoot
            day. Removed or unmatched prep is deleted.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap gap-x-2 gap-y-0.5 border-b border-border px-4 py-2 text-[11px] text-muted-foreground">
          {counts.unchanged > 0 ? (
            <span>{counts.unchanged} match</span>
          ) : null}
          {counts.changed > 0 ? (
            <span>{counts.changed} changed</span>
          ) : null}
          {counts.added > 0 ? <span>{counts.added} new</span> : null}
          {counts.removed > 0 ? (
            <span>{counts.removed} removed</span>
          ) : null}
          {counts.ambiguous > 0 ? (
            <span>{counts.ambiguous} unmatched</span>
          ) : null}
        </div>

        <ScrollArea className="min-h-0 max-h-[min(50vh,24rem)] flex-1 px-4">
          <ul className="space-y-2 py-3">
            {diff.map((entry, i) => {
              const canTransfer =
                entry.oldScene &&
                (entry.status === "unchanged" || entry.status === "changed");
              const id = entry.oldScene?.id ?? entry.newScene?.key ?? `row_${i}`;
              return (
                <li
                  key={id}
                  className="flex items-start gap-2 rounded-md border border-border/60 px-2.5 py-2"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Badge variant={statusVariant(entry.status)}>
                        {statusLabel(entry.status)}
                      </Badge>
                      <span className="truncate text-xs font-medium">
                        {sceneLabel(entry)}
                      </span>
                    </div>
                    {entry.status === "changed" ? (
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        Text or heading differs — review before keeping prep.
                      </p>
                    ) : null}
                    {entry.status === "removed" ||
                    entry.status === "ambiguous" ? (
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        Canvas, chat, and cheat sheet for this scene will be
                        deleted.
                      </p>
                    ) : null}
                    {entry.status === "added" ? (
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        New scene — starts with empty prep.
                      </p>
                    ) : null}
                  </div>
                  {canTransfer && entry.oldScene ? (
                    <label className="flex shrink-0 cursor-pointer items-center gap-1.5 pt-0.5 text-[11px] text-muted-foreground">
                      <input
                        type="checkbox"
                        className="size-3.5 accent-primary"
                        checked={transfers[entry.oldScene.id] ?? false}
                        onChange={(e) =>
                          setTransfers((prev) => ({
                            ...prev,
                            [entry.oldScene!.id]: e.target.checked,
                          }))
                        }
                      />
                      Keep prep
                    </label>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </ScrollArea>

        <DialogFooter className="mx-0 mb-0 sm:justify-between">
          <p className="text-[11px] text-muted-foreground sm:mr-auto">
            {transferCount} scene{transferCount === 1 ? "" : "s"} keeping prep
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={applying}
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              disabled={applying}
              onClick={() => onConfirm(transfers)}
            >
              {applying ? "Applying…" : "Apply revision"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
