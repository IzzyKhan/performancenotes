"use client";

import { ChevronDown, Download, FileStack } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";

export async function downloadExport(params: URLSearchParams) {
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
  a.download = match?.[1] ?? "scene-packs";
  a.click();
  URL.revokeObjectURL(a.href);
}

/**
 * Export scene reference packs (canvas materials), optionally ordered by
 * script or shoot day. Works without cheat sheets when mode=pack.
 */
export function ExportMenu({
  projectId,
  sceneId,
  hasMultipleScenes,
  variant = "outline",
  size = "sm",
}: {
  projectId: string;
  sceneId?: string | null;
  hasMultipleScenes?: boolean;
  variant?: "outline" | "ghost" | "default" | "secondary";
  size?: "sm" | "default";
}) {
  const base = { projectId, mode: "pack", includeCanvas: "1" };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button type="button" size={size} variant={variant} className="gap-1.5">
            <Download className="size-3.5" />
            <span className="hidden sm:inline">Export</span>
            <ChevronDown className="size-3" />
          </Button>
        }
      />
      <DropdownMenuContent align="end">
        {sceneId ? (
          <DropdownMenuItem
            onClick={() =>
              void downloadExport(
                new URLSearchParams({ ...base, sceneId })
              )
            }
          >
            This scene pack
          </DropdownMenuItem>
        ) : null}
        {hasMultipleScenes ? (
          <>
            <DropdownMenuItem
              onClick={() =>
                void downloadExport(
                  new URLSearchParams({
                    ...base,
                    scope: "all",
                    order: "script",
                  })
                )
              }
            >
              <FileStack className="size-3.5" />
              All scenes (script order)
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() =>
                void downloadExport(
                  new URLSearchParams({
                    ...base,
                    scope: "all",
                    order: "shoot",
                  })
                )
              }
            >
              <FileStack className="size-3.5" />
              All scenes (shoot order)
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() =>
                void downloadExport(
                  new URLSearchParams({
                    ...base,
                    scope: "all",
                    format: "zip",
                    order: "shoot",
                  })
                )
              }
            >
              Zip by shoot day
            </DropdownMenuItem>
          </>
        ) : sceneId ? null : (
          <DropdownMenuItem
            onClick={() =>
              void downloadExport(new URLSearchParams({ ...base, scope: "all" }))
            }
          >
            Export project pack
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
