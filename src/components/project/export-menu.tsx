"use client";

import { ExportDialog } from "@/components/project/export-dialog";
import type { Scene, Script } from "@/types";

export { downloadExport, fetchExportPreview } from "@/lib/export-client";

/**
 * Export scene reference packs. Opens a dialog to pick scenes,
 * order, and preview before download.
 */
export function ExportMenu({
  projectId,
  scripts,
  scenes,
  sceneId,
  variant = "outline",
  size = "sm",
}: {
  projectId: string;
  scripts: Script[];
  scenes: Scene[];
  sceneId?: string | null;
  variant?: "outline" | "ghost" | "default" | "secondary";
  size?: "sm" | "default";
}) {
  if (scenes.length === 0) return null;

  return (
    <ExportDialog
      projectId={projectId}
      scripts={scripts}
      scenes={scenes}
      activeSceneId={sceneId}
      mode="pack"
      triggerLabel="Export"
      triggerVariant={variant}
      triggerSize={size}
    />
  );
}
