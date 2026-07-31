import { splitScenes, type SplitScene } from "@/lib/screenplay";
import type { SceneSourceType } from "@/types";

/** Persisted on org tiers — dialogue/action never stored server-side. */
export const SLUG_ONLY_RAW_TEXT = "";

/** Scene structure sent to the API after client-side parse. */
export type SceneSlugPayload = {
  heading: string;
  sceneNumber: string | null;
  orderIndex: number;
};

export function splitTextToSceneSlugs(rawText: string): SceneSlugPayload[] {
  return splitScenes(rawText.trim()).map((part, i) => ({
    heading: part.heading,
    sceneNumber: part.sceneNumber,
    orderIndex: i,
  }));
}

export function isValidSceneSlugPayload(
  value: unknown
): value is SceneSlugPayload {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.heading === "string" &&
    v.heading.trim().length > 0 &&
    typeof v.orderIndex === "number" &&
    Number.isFinite(v.orderIndex) &&
    (v.sceneNumber === null ||
      v.sceneNumber === undefined ||
      typeof v.sceneNumber === "string")
  );
}

export function parseSceneSlugList(raw: unknown): SceneSlugPayload[] | null {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const out: SceneSlugPayload[] = [];
  for (const item of raw) {
    if (!isValidSceneSlugPayload(item)) return null;
    out.push({
      heading: item.heading.trim(),
      sceneNumber: item.sceneNumber?.trim() || null,
      orderIndex: Math.floor(item.orderIndex),
    });
  }
  return out.sort((a, b) => a.orderIndex - b.orderIndex);
}

export function slugsToSplitScenes(slugs: SceneSlugPayload[]): SplitScene[] {
  return slugs.map((s) => ({
    heading: s.heading,
    sceneNumber: s.sceneNumber,
    text: SLUG_ONLY_RAW_TEXT,
  }));
}

export type SlugIngestBody = {
  projectId: string;
  scriptId?: string | null;
  title?: string;
  sourceType: SceneSourceType;
  scenes: SceneSlugPayload[];
  mode?: string | null;
  transfers?: Record<string, boolean> | null;
};

export function parseSlugIngestBody(body: unknown): SlugIngestBody | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  const projectId = typeof b.projectId === "string" ? b.projectId.trim() : "";
  if (!projectId) return null;

  const scenes = parseSceneSlugList(b.scenes);
  if (!scenes) return null;

  const sourceType = b.sourceType === "pdf" ? "pdf" : "typed";
  const scriptId =
    typeof b.scriptId === "string" && b.scriptId.trim()
      ? b.scriptId.trim()
      : null;
  const title = typeof b.title === "string" ? b.title.trim() : "";
  const mode = typeof b.mode === "string" ? b.mode : null;

  let transfers: Record<string, boolean> | null = null;
  if (b.transfers && typeof b.transfers === "object" && !Array.isArray(b.transfers)) {
    transfers = {};
    for (const [k, v] of Object.entries(b.transfers as Record<string, unknown>)) {
      transfers[k] = Boolean(v);
    }
  }

  if (typeof b.rawText === "string" && b.rawText.trim()) {
    return null;
  }

  return {
    projectId,
    scriptId,
    title,
    sourceType,
    scenes,
    mode,
    transfers,
  };
}
