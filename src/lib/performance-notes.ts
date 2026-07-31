import { createId } from "@/lib/id";
import type {
  PerformanceNotesBeat,
  PerformanceNotesCharacter,
  PerformanceNotesContent,
} from "@/types";

export function emptyPerformanceCharacter(): PerformanceNotesCharacter {
  return {
    id: createId("pchar"),
    character: "",
    objectives: "",
    actions: "",
  };
}

export function emptyPerformanceBeat(index = 1): PerformanceNotesBeat {
  return {
    id: createId("pbeat"),
    beat: `Beat ${index}`,
    characters: [emptyPerformanceCharacter()],
  };
}

export function defaultPerformanceNotesContent(): PerformanceNotesContent {
  return {
    title: "Performance notes",
    beats: [emptyPerformanceBeat(1)],
  };
}

function normalizeCharacter(raw: unknown): PerformanceNotesCharacter {
  if (!raw || typeof raw !== "object") {
    return emptyPerformanceCharacter();
  }
  const c = raw as Record<string, unknown>;
  return {
    id:
      typeof c.id === "string" && c.id ? c.id : createId("pchar"),
    character: typeof c.character === "string" ? c.character : "",
    objectives: typeof c.objectives === "string" ? c.objectives : "",
    actions: typeof c.actions === "string" ? c.actions : "",
  };
}

function normalizeBeat(raw: unknown, index: number): PerformanceNotesBeat {
  if (!raw || typeof raw !== "object") {
    return emptyPerformanceBeat(index + 1);
  }
  const b = raw as Record<string, unknown>;
  const charsRaw = Array.isArray(b.characters) ? b.characters : [];
  const characters =
    charsRaw.length > 0
      ? charsRaw.map(normalizeCharacter)
      : [emptyPerformanceCharacter()];
  return {
    id: typeof b.id === "string" && b.id ? b.id : createId("pbeat"),
    beat: typeof b.beat === "string" ? b.beat : `Beat ${index + 1}`,
    characters,
  };
}

export function normalizePerformanceNotesContent(
  raw: unknown
): PerformanceNotesContent {
  if (!raw || typeof raw !== "object") {
    return defaultPerformanceNotesContent();
  }
  const c = raw as Record<string, unknown>;
  const title =
    typeof c.title === "string" ? c.title : "Performance notes";

  const beatsRaw = Array.isArray(c.beats) ? c.beats : [];
  const beats =
    beatsRaw.length > 0
      ? beatsRaw.map((b, i) => normalizeBeat(b, i))
      : [emptyPerformanceBeat(1)];

  const frameWidth =
    typeof c.frameWidth === "number" &&
    Number.isFinite(c.frameWidth) &&
    c.frameWidth >= 360
      ? Math.min(1200, Math.floor(c.frameWidth))
      : undefined;

  const frameHeight =
    typeof c.frameHeight === "number" &&
    Number.isFinite(c.frameHeight) &&
    c.frameHeight >= 200
      ? Math.min(900, Math.floor(c.frameHeight))
      : undefined;

  return { title, beats, frameWidth, frameHeight };
}

export function formatPerformanceNotesForContext(
  title: string,
  beats: PerformanceNotesBeat[]
): string {
  if (beats.length === 0) return `${title}: (empty)`;
  const lines: string[] = [];
  for (const beat of beats) {
    lines.push(`• ${beat.beat || "(untitled beat)"}`);
    for (const ch of beat.characters) {
      const name = ch.character.trim() || "(character)";
      const obj = ch.objectives.trim() || "—";
      const verbs = ch.actions.trim() || "—";
      lines.push(`  ${name}: ${obj} → ${verbs}`);
    }
  }
  return `${title}:\n${lines.join("\n")}`;
}
