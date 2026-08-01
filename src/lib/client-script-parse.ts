import { extractPdfTextWithLines } from "@/lib/pdf";
import {
  splitTextToSceneSlugs,
  type SceneSlugPayload,
} from "@/lib/scene-slug";
import type { SceneSourceType } from "@/types";

export type ClientParseResult =
  | {
      ok: true;
      slugs: SceneSlugPayload[];
      sourceType: SceneSourceType;
      sceneNumberWarning: string | null;
    }
  | { ok: false; error: string };

function noScenesError(sourceType: SceneSourceType): string {
  return sourceType === "pdf"
    ? "No scenes found — the script needs INT./EXT. scene headings (slug lines)."
    : "No scenes found — paste text with INT./EXT. scene headings (slug lines).";
}

/** Warn when production numbers are missing from slug lines (import order is used). */
export function sceneNumberImportWarning(
  slugs: SceneSlugPayload[]
): string | null {
  if (slugs.length === 0) return null;
  const missing = slugs.filter((s) => !s.sceneNumber?.trim()).length;
  if (missing === slugs.length) {
    return "No production scene numbers found — scenes are labeled 1, 2, 3… in import order.";
  }
  if (missing > 0) {
    return `${missing} scene(s) had no production number — those use import order in the list.`;
  }
  return null;
}

export async function parsePdfFileToSlugs(file: File): Promise<ClientParseResult> {
  const buffer = await file.arrayBuffer();
  let rawText: string;
  try {
    rawText = await extractPdfTextWithLines(new Uint8Array(buffer));
  } catch (e) {
    const message = e instanceof Error ? e.message : "PDF parse failed";
    return {
      ok: false,
      error: `Could not read that PDF (${message}). Try a smaller file or paste text instead.`,
    };
  }

  if (!rawText.trim()) {
    return { ok: false, error: "Could not extract text from PDF" };
  }

  const slugs = splitTextToSceneSlugs(rawText);
  if (slugs.length === 0) {
    return { ok: false, error: noScenesError("pdf") };
  }

  return {
    ok: true,
    slugs,
    sourceType: "pdf",
    sceneNumberWarning: sceneNumberImportWarning(slugs),
  };
}

export function parseTypedTextToSlugs(text: string): ClientParseResult {
  const trimmed = text.trim();
  if (!trimmed) {
    return { ok: false, error: "Script text is empty" };
  }

  const slugs = splitTextToSceneSlugs(trimmed);
  if (slugs.length === 0) {
    return { ok: false, error: noScenesError("typed") };
  }

  return {
    ok: true,
    slugs,
    sourceType: "typed",
    sceneNumberWarning: sceneNumberImportWarning(slugs),
  };
}
