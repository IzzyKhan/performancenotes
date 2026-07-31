import type { CanvasNodeType } from "@/types";

/** Default PDF appendix order for canvas reference types. */
export const DEFAULT_EXPORT_TYPE_ORDER: CanvasNodeType[] = [
  "scene-synopsis",
  "shot-list",
  "performance-notes",
  "image-grid",
  "text",
  "image",
  "audio",
  "video-link",
  "mood",
];

export const EXPORT_TYPE_LABELS: Record<CanvasNodeType, string> = {
  text: "Text notes",
  "scene-synopsis": "Scene synopses",
  "performance-notes": "Performance notes",
  image: "Images",
  "image-grid": "Image grids",
  mood: "Mood tags",
  "video-link": "Reference links",
  audio: "Audio",
  "shot-list": "Shot lists",
};

const ALLOWED = new Set<string>(DEFAULT_EXPORT_TYPE_ORDER);

/**
 * Parse `typeOrder=text,image,…` from the export query string.
 * - missing param → full default order
 * - empty string → no appendix types
 * - unknown ids ignored
 */
export function parseExportTypeOrder(raw: string | null): CanvasNodeType[] {
  if (raw === null) return [...DEFAULT_EXPORT_TYPE_ORDER];
  if (!raw.trim()) return [];
  const seen = new Set<CanvasNodeType>();
  const result: CanvasNodeType[] = [];
  for (const part of raw.split(",")) {
    const t = part.trim();
    if (!ALLOWED.has(t) || seen.has(t as CanvasNodeType)) continue;
    seen.add(t as CanvasNodeType);
    result.push(t as CanvasNodeType);
  }
  return result;
}

export function serializeExportTypeOrder(types: CanvasNodeType[]): string {
  return types.join(",");
}
