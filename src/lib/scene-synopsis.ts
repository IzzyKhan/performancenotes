import type { SceneSynopsisContent } from "@/types";

export function defaultSceneSynopsisContent(): SceneSynopsisContent {
  return { synopsis: "" };
}

export function normalizeSceneSynopsisContent(
  raw: unknown
): SceneSynopsisContent {
  if (!raw || typeof raw !== "object") {
    return defaultSceneSynopsisContent();
  }
  const c = raw as Record<string, unknown>;
  return {
    synopsis: typeof c.synopsis === "string" ? c.synopsis : "",
  };
}
