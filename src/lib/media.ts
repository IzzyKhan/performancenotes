import fs from "fs";
import path from "path";
import type { CanvasNode, ShotListRow } from "@/types";
import { formatShotListForContext } from "@/lib/shot-list";
import {
  collectImagePaths,
  formatImageGridForContext,
  normalizeImageGridContent,
} from "@/lib/image-grid";
import {
  formatPerformanceNotesForContext,
  normalizePerformanceNotesContent,
} from "@/lib/performance-notes";
import { normalizeSceneSynopsisContent } from "@/lib/scene-synopsis";

export const UPLOADS_DIR = path.join(
  /* turbopackIgnore: true */ process.cwd(),
  "data",
  "uploads"
);

export function ensureUploadsDir() {
  if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  }
}

export function mediaUrl(filePath: string): string {
  const name = path.basename(filePath);
  return `/api/media/${name}`;
}

export function serializeCanvasForText(nodes: CanvasNode[]): string {
  if (nodes.length === 0) {
    return "No canvas nodes yet — the instinct layer is empty.";
  }

  return nodes
    .map((node, i) => {
      const annotation = node.label
        ? `Annotation: "${node.label}"`
        : "No annotation";
      switch (node.type) {
        case "text":
          return `[Node ${i + 1} — TEXT] ${annotation}\n${node.content.text ?? ""}`;
        case "image":
          return `[Node ${i + 1} — IMAGE] ${annotation}\nFile: ${node.content.filePath ?? "unknown"} (image attached for vision if available)`;
        case "audio":
          return `[Node ${i + 1} — AUDIO] ${annotation}\nFile: ${node.content.filePath ?? "unknown"} (${node.content.mimeType ?? "audio"})`;
        case "video-link":
          return `[Node ${i + 1} — VIDEO/REF LINK] ${annotation}\nURL: ${node.content.url ?? ""}`;
        case "mood":
          return `[Node ${i + 1} — MOOD] ${annotation}\nMood: ${node.content.mood ?? ""}`;
        case "shot-list": {
          const title = node.content.title ?? node.label ?? "Shot list";
          const rows = Array.isArray(node.content.rows)
            ? (node.content.rows as ShotListRow[])
            : [];
          return `[Node ${i + 1} — SHOT LIST] ${annotation}\n${formatShotListForContext(title, rows)}`;
        }
        case "image-grid": {
          const grid = normalizeImageGridContent(node.content);
          return `[Node ${i + 1} — IMAGE GRID] ${annotation}\n${formatImageGridForContext(grid.title, grid.images)}`;
        }
        case "performance-notes": {
          const perf = normalizePerformanceNotesContent(node.content);
          return `[Node ${i + 1} — PERFORMANCE NOTES] ${annotation}\n${formatPerformanceNotesForContext(perf.title, perf.beats)}`;
        }
        case "scene-synopsis": {
          const syn = normalizeSceneSynopsisContent(node.content);
          return `[Node ${i + 1} — SCENE SYNOPSIS]\n${syn.synopsis || "(empty)"}`;
        }
        default:
          return `[Node ${i + 1}] ${annotation}`;
      }
    })
    .join("\n\n");
}

/** Single-image canvas nodes (legacy helper). Prefer collectVisionImagePaths. */
export function getImageNodes(nodes: CanvasNode[]): CanvasNode[] {
  return nodes.filter((n) => n.type === "image" && n.content.filePath);
}

/** Ordered paths from image + image-grid nodes for vision / export. */
export function collectVisionImagePaths(nodes: CanvasNode[]): string[] {
  return collectImagePaths(nodes);
}

export async function readImageAsBase64(filePath: string): Promise<{
  mediaType: "image/jpeg" | "image/png" | "image/gif" | "image/webp";
  data: string;
} | null> {
  try {
    const { getUploadObject, guessContentType } = await import("@/lib/storage");
    const stored = await getUploadObject(path.basename(filePath));
    if (!stored) return null;

    const mime = stored.contentType || guessContentType(filePath);
    const mediaType =
      mime === "image/png"
        ? "image/png"
        : mime === "image/gif"
          ? "image/gif"
          : mime === "image/webp"
            ? "image/webp"
            : "image/jpeg";

    return { mediaType, data: stored.body.toString("base64") };
  } catch {
    return null;
  }
}
