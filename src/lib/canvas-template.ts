import { createId } from "@/lib/id";
import {
  defaultImageGridContent,
  normalizeImageGridContent,
} from "@/lib/image-grid";
import {
  defaultPerformanceNotesContent,
  normalizePerformanceNotesContent,
} from "@/lib/performance-notes";
import {
  defaultShotListContent,
  normalizeShotListContent,
} from "@/lib/shot-list";
import type {
  CanvasNode,
  CanvasNodeContent,
  CanvasNodeType,
} from "@/types";

/** One node in a saved layout template (empty content shell). */
export interface CanvasTemplateNode {
  type: CanvasNodeType;
  label: string | null;
  positionX: number;
  positionY: number;
  content: CanvasNodeContent;
}

export interface CanvasTemplateRecord {
  id: string;
  projectId: string;
  name: string;
  sourceSceneId: string | null;
  nodes: CanvasTemplateNode[];
  createdAt: string;
}

/** Strip media/text into empty shells while keeping layout metadata. */
export function emptyShellFromNode(node: CanvasNode): CanvasTemplateNode {
  const base = {
    type: node.type,
    label: node.label,
    positionX: node.positionX,
    positionY: node.positionY,
  };

  switch (node.type) {
    case "text":
      return { ...base, content: { text: "" } };
    case "image":
      return { ...base, content: {} };
    case "audio":
      return { ...base, content: {} };
    case "video-link":
      return { ...base, content: { url: "" } };
    case "mood":
      return {
        ...base,
        content: {
          mood: "",
          color: node.content.color || "#34d399",
        },
      };
    case "shot-list": {
      const shot = normalizeShotListContent(node.content);
      const empty = defaultShotListContent();
      return {
        ...base,
        content: {
          title: shot.title || empty.title,
          columns: shot.columns.length > 0 ? shot.columns : empty.columns,
          rows: empty.rows,
          frameWidth: shot.frameWidth,
          frameHeight: shot.frameHeight,
        },
      };
    }
    case "image-grid": {
      const grid = normalizeImageGridContent(node.content);
      const empty = defaultImageGridContent();
      return {
        ...base,
        content: {
          title: grid.title || empty.title,
          images: [],
          gridColumns: grid.gridColumns || empty.gridColumns,
          frameWidth: grid.frameWidth,
          frameHeight: grid.frameHeight,
        },
      };
    }
    case "performance-notes": {
      const perf = normalizePerformanceNotesContent(node.content);
      const empty = defaultPerformanceNotesContent();
      return {
        ...base,
        content: {
          title: perf.title || empty.title,
          beats: empty.beats,
          frameWidth: perf.frameWidth,
          frameHeight: perf.frameHeight,
        },
      };
    }
    case "scene-synopsis":
      return { ...base, content: { synopsis: "" } };
    default:
      return { ...base, content: {} };
  }
}

export function snapshotSceneAsTemplateNodes(
  nodes: CanvasNode[]
): CanvasTemplateNode[] {
  return nodes
    .filter((n) => n.sceneId != null)
    .map(emptyShellFromNode);
}

export function parseTemplateNodes(raw: unknown): CanvasTemplateNode[] {
  if (!Array.isArray(raw)) return [];
  const out: CanvasTemplateNode[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const r = item as Record<string, unknown>;
    const type = r.type as CanvasNodeType;
    if (typeof type !== "string") continue;
    out.push({
      type,
      label: typeof r.label === "string" ? r.label : null,
      positionX:
        typeof r.positionX === "number" && Number.isFinite(r.positionX)
          ? r.positionX
          : 100,
      positionY:
        typeof r.positionY === "number" && Number.isFinite(r.positionY)
          ? r.positionY
          : 100,
      content:
        r.content && typeof r.content === "object"
          ? (r.content as CanvasNodeContent)
          : {},
    });
  }
  return out;
}

export function newTemplateNodeIds(
  nodes: CanvasTemplateNode[]
): Array<{
  id: string;
  type: CanvasNodeType;
  content: CanvasNodeContent;
  positionX: number;
  positionY: number;
  label: string | null;
}> {
  return nodes.map((n) => ({
    id: createId("node"),
    type: n.type,
    content: n.content,
    positionX: n.positionX,
    positionY: n.positionY,
    label: n.label,
  }));
}
