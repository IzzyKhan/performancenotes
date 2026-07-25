import type {
  ActionNote,
  BeatEntry,
  CanvasNode,
  CanvasNodeContent,
  CharacterNotes,
  CheatSheet,
  CheatSheetContent,
  ParsedMeta,
  Scene,
  Script,
} from "@/types";
import { normalizeActionNote } from "@/lib/action-verbs";

export function mapScript(row: {
  id: string;
  projectId: string;
  title: string;
  orderIndex: number;
  episodeNumber?: number | null;
  sourceType: string;
  createdAt: string;
}): Script {
  return {
    id: row.id,
    projectId: row.projectId,
    title: row.title,
    orderIndex: row.orderIndex,
    episodeNumber: row.episodeNumber ?? row.orderIndex + 1,
    sourceType: row.sourceType as Script["sourceType"],
    createdAt: row.createdAt,
  };
}

export function parseJson<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export function mapScene(row: {
  id: string;
  projectId: string;
  scriptId: string;
  heading: string;
  orderIndex: number;
  sceneNumber?: string | null;
  shootDay?: number | null;
  shootOrder?: number | null;
  rawText: string;
  sourceType: string;
  parsedMeta: string | null;
  createdAt: string;
}): Scene {
  return {
    id: row.id,
    projectId: row.projectId,
    scriptId: row.scriptId,
    heading: row.heading,
    orderIndex: row.orderIndex,
    sceneNumber: row.sceneNumber ?? null,
    shootDay: row.shootDay ?? null,
    shootOrder: row.shootOrder ?? null,
    rawText: row.rawText,
    sourceType: row.sourceType as Scene["sourceType"],
    parsedMeta: parseJson<ParsedMeta | null>(row.parsedMeta, null),
    createdAt: row.createdAt,
  };
}

export function mapCanvasNode(row: {
  id: string;
  projectId: string;
  sceneId: string | null;
  type: string;
  content: string;
  positionX: number;
  positionY: number;
  label: string | null;
  createdAt: string;
}): CanvasNode {
  return {
    id: row.id,
    projectId: row.projectId,
    sceneId: row.sceneId,
    type: row.type as CanvasNode["type"],
    content: parseJson<CanvasNodeContent>(row.content, {}),
    positionX: row.positionX,
    positionY: row.positionY,
    label: row.label,
    createdAt: row.createdAt,
  };
}

/** Coerce tool / DB payloads into a stable CheatSheetContent shape. */
export function normalizeCheatSheetContent(
  raw: unknown
): CheatSheetContent {
  if (!raw || typeof raw !== "object") {
    return { beats: [] };
  }

  let candidate = raw as Record<string, unknown>;

  // Model sometimes returns beats as a JSON string of { beats: [...] } or [...].
  let beatsRaw = candidate.beats;
  if (typeof beatsRaw === "string") {
    const parsed = parseJson<unknown>(beatsRaw, null);
    if (Array.isArray(parsed)) {
      beatsRaw = parsed;
    } else if (parsed && typeof parsed === "object") {
      const nested = parsed as Record<string, unknown>;
      if (Array.isArray(nested.beats)) {
        beatsRaw = nested.beats;
        if (typeof candidate.notes !== "string" && typeof nested.notes === "string") {
          candidate = { ...candidate, notes: nested.notes };
        }
      } else {
        beatsRaw = [];
      }
    } else {
      beatsRaw = [];
    }
  }

  if (!Array.isArray(beatsRaw)) {
    // Object keyed by index → array
    if (beatsRaw && typeof beatsRaw === "object") {
      beatsRaw = Object.values(beatsRaw as Record<string, unknown>);
    } else {
      beatsRaw = [];
    }
  }

  const beats = (beatsRaw as unknown[]).map(normalizeBeatEntry).filter(
    (b): b is BeatEntry => b !== null
  );

  return {
    beats,
    notes: typeof candidate.notes === "string" ? candidate.notes : undefined,
  };
}

function normalizeBeatEntry(raw: unknown): BeatEntry | null {
  if (!raw || typeof raw !== "object") return null;
  const b = raw as Record<string, unknown>;
  const charactersRaw = Array.isArray(b.characters)
    ? b.characters
    : b.characters && typeof b.characters === "object"
      ? Object.values(b.characters as Record<string, unknown>)
      : [];

  return {
    beat: typeof b.beat === "string" ? b.beat : "Beat",
    summary: typeof b.summary === "string" ? b.summary : undefined,
    characters: charactersRaw.map(normalizeCharacterNotes).filter(
      (c): c is CharacterNotes => c !== null
    ),
  };
}

function normalizeCharacterNotes(raw: unknown): CharacterNotes | null {
  if (!raw || typeof raw !== "object") return null;
  const c = raw as Record<string, unknown>;
  const actionsRaw = Array.isArray(c.actions)
    ? c.actions
    : c.actions && typeof c.actions === "object"
      ? Object.values(c.actions as Record<string, unknown>)
      : [];

  return {
    name: typeof c.name === "string" ? c.name : "Character",
    objective: typeof c.objective === "string" ? c.objective : "",
    obstacle: typeof c.obstacle === "string" ? c.obstacle : "",
    actions: actionsRaw
      .map((a) => normalizeActionNote(a))
      .filter((a): a is ActionNote => a !== null),
    adjustments: typeof c.adjustments === "string" ? c.adjustments : "",
    pitfalls: typeof c.pitfalls === "string" ? c.pitfalls : "",
  };
}

export function mapCheatSheet(row: {
  id: string;
  projectId: string;
  sceneId: string | null;
  content: string;
  version: number;
  createdAt: string;
}): CheatSheet {
  const content = normalizeCheatSheetContent(
    parseJson<unknown>(row.content, { beats: [] })
  );
  return {
    id: row.id,
    projectId: row.projectId,
    sceneId: row.sceneId,
    content,
    version: row.version,
    createdAt: row.createdAt,
  };
}
