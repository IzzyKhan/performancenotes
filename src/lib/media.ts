import fs from "fs";
import path from "path";
import type { CanvasNode } from "@/types";

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
        default:
          return `[Node ${i + 1}] ${annotation}`;
      }
    })
    .join("\n\n");
}

export function getImageNodes(nodes: CanvasNode[]): CanvasNode[] {
  return nodes.filter((n) => n.type === "image" && n.content.filePath);
}

export function readImageAsBase64(filePath: string): {
  mediaType: "image/jpeg" | "image/png" | "image/gif" | "image/webp";
  data: string;
} | null {
  try {
    const candidates = [
      path.join(UPLOADS_DIR, path.basename(filePath)),
      path.join(
        /* turbopackIgnore: true */ process.cwd(),
        "data",
        "uploads",
        path.basename(filePath)
      ),
    ];

    let found: string | null = null;
    for (const c of candidates) {
      if (fs.existsSync(c)) {
        found = c;
        break;
      }
    }
    if (!found) return null;

    const ext = path.extname(found).toLowerCase();
    const mediaType =
      ext === ".png"
        ? "image/png"
        : ext === ".gif"
          ? "image/gif"
          : ext === ".webp"
            ? "image/webp"
            : "image/jpeg";

    const data = fs.readFileSync(found).toString("base64");
    return { mediaType, data };
  } catch {
    return null;
  }
}
