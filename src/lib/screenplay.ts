import type { ParsedMeta } from "@/types";

const CHARACTER_CUE =
  /^[A-Z][A-Z0-9 .'\-]{1,30}$/;

// Optionally preceded by a scene number ("6  EXT. SHOPS" is common in numbered drafts)
// Include INT/EXT and EXT/INT (both appear in reports / multi-location slugs)
const SCENE_HEADING =
  /^(?:\d+[A-Z]?\s+)?(INT\.\/EXT\.|EXT\.\/INT\.|INT\/EXT\.|EXT\/INT\.|I\/E\.|INT\.|EXT\.)\s+/i;

/** Pattern-based page chrome (headers, footers, report banners). */
export function isLikelyPageChrome(line: string): boolean {
  const t = line.trim();
  if (!t) return false;
  if (/SHOOTING\s+SCRIPT/i.test(t)) return true;
  if (/Script\s+Report/i.test(t)) return true;
  if (/Cast\s+List/i.test(t)) return true;
  if (/^SEASON\s+\d+$/i.test(t)) return true;
  // Report chrome with glued page numbers: OMITTED28 28 — not bare "OMITTED"
  // (bare OMITTED is a real screenplay omission placeholder)
  if (/^OMITTED\d+/i.test(t)) return true;
  if (/^OMITTED\b/i.test(t) && /\d/.test(t)) return true;
  if (/^Episode\s+(One|Two|Three|Four|Five|Six|Seven|Eight|Nine|Ten|\d+)/i.test(t)) {
    return true;
  }
  if (/\bp\d+\b/i.test(t) && /BUMP|Episode|SCRIPT|Report/i.test(t)) return true;
  if (/^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(t)) return true;
  // Lone page-number pairs left by PDF extraction: "12 12" / "28 28"
  if (/^\d{1,3}[A-Z]?(?:\s+\d{1,3}[A-Z]?)+$/.test(t) && t.length <= 12) {
    return true;
  }
  if (
    /^(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2}/i.test(
      t
    ) &&
    t.length < 40
  ) {
    return true;
  }
  if (/^Copyright\s+\d{4}/i.test(t)) return true;
  if (/All rights \(by all media\) reserved/i.test(t)) return true;
  return false;
}

/**
 * Light heuristics to pull character names and beat-ish markers from screenplay text.
 */
export function parseScreenplayText(rawText: string): ParsedMeta {
  const lines = rawText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const characterCounts = new Map<string, number>();
  const detectedBeats: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (SCENE_HEADING.test(line)) {
      detectedBeats.push(line);
      continue;
    }

    // Character cues are typically short ALL CAPS lines followed by dialogue
    if (
      CHARACTER_CUE.test(line) &&
      !line.includes("  ") &&
      line.length < 32 &&
      !SCENE_HEADING.test(line) &&
      !/^(FADE|CUT|SMASH|DISSOLVE|TITLE|SUPER|CONTINUED|MORE|OMITTED)/i.test(line)
    ) {
      const next = lines[i + 1];
      // Prefer cues that look like they precede dialogue (not another cue / heading)
      if (next && !CHARACTER_CUE.test(next) && !SCENE_HEADING.test(next)) {
        const name = line.replace(/\s*\(.*\)$/, "").trim();
        characterCounts.set(name, (characterCounts.get(name) ?? 0) + 1);
      }
    }
  }

  const characters = [...characterCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([name]) => name)
    .slice(0, 12);

  // If no scene headings, invent soft beat markers from paragraph breaks
  if (detectedBeats.length === 0) {
    const paragraphs = rawText.split(/\n\s*\n/).filter((p) => p.trim().length > 40);
    paragraphs.slice(0, 6).forEach((_, idx) => {
      detectedBeats.push(`Beat ${idx + 1}`);
    });
  }

  return { characters, detectedBeats };
}

export interface SplitScene {
  heading: string;
  text: string;
  /** Production scene number when present on the slug line. */
  sceneNumber: string | null;
}

/** Pull production scene number from a slug before cleaning ("28", "12A"). */
export function extractSceneNumber(headingLine: string): string | null {
  const t = headingLine.trim();
  const lead = t.match(
    /^(\d+[A-Z]?)\s+(?=INT\.|EXT\.|I\/E\.|INT\/|EXT\/)/i
  );
  if (lead) return lead[1].toUpperCase();

  const trail = t.match(/(\d+[A-Z]?)(?:\s+\d+[A-Z]?)*\s*$/);
  if (!trail || trail.index == null) return null;
  const before = t.slice(0, trail.index);
  if (/[A-Za-z)]$/.test(before) || / $/.test(before)) {
    return trail[1].toUpperCase();
  }
  return null;
}

/**
 * PDF extraction sometimes runs slug lines into the surrounding action text
 * ("Malcolm walks out. EXT. LOCAL SHOPS - CONTINUOUS6 6 Malcolm exits...").
 * Break those onto their own lines so the line-based splitter can see them.
 */
function normalizeInlineHeadings(rawText: string): string {
  return (
    rawText
      // Newline before a slug that follows punctuation or lowercase text.
      // Do NOT match digits here — that breaks numbered drafts ("27 EXT. …").
      .replace(
        /([.!?…:'"”\)]|[a-z])[ \t]+((?:INT\.\/EXT\.|EXT\.\/INT\.|INT\/EXT\.|EXT\/INT\.|I\/E\.|INT\.|EXT\.)\s)/gi,
        "$1\n$2"
      )
      // Newline after a slug's trailing scene numbers when action text or a
      // character cue continues on the same line
      .replace(
        /^((?:\d+[A-Z]?\s+)?(?:INT\.\/EXT\.|EXT\.\/INT\.|INT\/EXT\.|EXT\/INT\.|I\/E\.|INT\.|EXT\.)[^\n]*?(?:\d+[A-Z]?(?:\s+\d+[A-Z]?)*))[ \t]+(?=[A-Z])/gim,
        "$1\n"
      )
  );
}

/** Strip production scene numbers glued to the ends of a slug line. */
function cleanHeading(headingLine: string): string {
  return headingLine
    .trim()
    .replace(/^\d+[A-Z]?\s+/, "")
    .replace(/(\d+[A-Z]?)(\s+\d+[A-Z]?)*\s*$/, (match, _g, __g, offset, str) => {
      // Only strip when the digits trail a word (glued or spaced scene
      // numbers), never when they're part of the location name itself
      const before = str.slice(0, offset as number);
      return /[A-Za-z)]$/.test(before) || / $/.test(before) ? "" : match;
    })
    .trim();
}

/** Drop title-page / cast-list / running-header noise from extracted text. */
function stripScriptChrome(rawText: string): string {
  const lines = rawText.split(/\r?\n/);
  const freq = new Map<string, number>();
  for (const line of lines) {
    const key = line.replace(/\s+/g, " ").trim().toLowerCase();
    if (!key || key.length > 60) continue;
    freq.set(key, (freq.get(key) ?? 0) + 1);
  }

  return lines
    .filter((line) => {
      const t = line.trim();
      if (isLikelyPageChrome(t)) return false;
      const key = t.replace(/\s+/g, " ").toLowerCase();
      // Repeating short lines (watermarks like "ISMAIL KHAN") across the doc
      if (key && t.length <= 40 && (freq.get(key) ?? 0) >= 4) {
        // Keep real content that happens to recur (e.g. "OLY") only if it's
        // a single token character cue — those are rare as page chrome.
        if (/^[A-Z][A-Z0-9 .'\-]{2,}$/.test(t) && !SCENE_HEADING.test(t)) {
          // Multi-word ALL CAPS repeating lines are almost always watermarks
          if (t.includes(" ")) return false;
        }
      }
      return true;
    })
    .join("\n");
}

/**
 * Cast-only body lines from a Script Report / scene list, e.g.
 * "OLY, SANTI, JACINDA" or "SANTI, MATIAS, ALEJANDRO".
 * Handles mid-list line wraps that leave a trailing comma.
 */
function isCastListLine(line: string): boolean {
  const t = line
    .trim()
    .replace(/,+\s*$/, "") // trailing comma from wrapped cast lists
    .trim();
  if (!t || /[a-z]/.test(t)) return false;
  if (
    /^(INTERCUT|FADE|CUT TO|DISSOLVE|SMASH|TITLE|SUPER|MORE|CONTINUED|OMITTED)\b/i.test(
      t
    )
  ) {
    return false;
  }
  if (SCENE_HEADING.test(t)) return false;
  // Multi-name cast: "OLY, SANTI, N/S STAFF"
  if (/^[A-Z0-9][A-Z0-9 .'"/\-]*(?:,\s*[A-Z0-9][A-Z0-9 .'"/\-]*)+$/.test(t)) {
    return true;
  }
  // Single cast name on its own line in a report (incl. N/S ROLE)
  if (/^[A-Z][A-Z0-9 .'"/\-]{0,40}$/.test(t) && t.length <= 40) {
    return true;
  }
  return false;
}

/**
 * Script Report / scene-breakdown stubs: heading + cast list only, no
 * action or dialogue. Real scenes almost always contain lowercase prose.
 *
 * Nested slug lines inside the chunk (report rows glued together by PDF
 * extraction) are ignored when judging content — they're still stubs.
 */
export function isSceneStub(text: string): boolean {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !isLikelyPageChrome(l));

  let i = 0;
  while (i < lines.length && SCENE_HEADING.test(lines[i])) i++;
  const body = lines.slice(i);
  if (body.length === 0) {
    // Screenplay omission: slug + OMITTED only (OMITTED stripped as chrome)
    if (/\bOMITTED\b/i.test(text)) return false;
    return true;
  }

  // Keep transitional markers even if they're all-caps and short
  if (body.some((l) => /^(INTERCUT|FADE IN|FADE OUT|CUT TO)\b/i.test(l))) {
    return false;
  }

  // Nested report slugs / cast rows — ignore slug lines when scoring content
  const content = body.filter((l) => !SCENE_HEADING.test(l));
  if (content.length === 0) {
    if (/\bOMITTED\b/i.test(text)) return false;
    return true;
  }

  // Intentional screenplay omission placeholder
  if (
    content.length > 0 &&
    content.every((l) => /^OMITTED\b/i.test(l))
  ) {
    return false;
  }

  // Any lowercase = action/dialogue → real scene
  if (content.some((l) => /[a-z]/.test(l))) return false;

  // All remaining lines look like cast lists → stub from scene report
  return content.every(isCastListLine);
}

/**
 * Ensure scene text starts at its slug (no title-page preamble) and has
 * chrome lines removed from the body.
 */
function finalizeSceneText(headingLine: string, chunk: string): string {
  const lines = chunk
    .split(/\r?\n/)
    .filter((l) => !isLikelyPageChrome(l.trim()));

  const headingIdx = lines.findIndex((l) => SCENE_HEADING.test(l.trim()));
  const fromHeading = headingIdx >= 0 ? lines.slice(headingIdx) : lines;

  // Prefer the cleaned heading as the first line for consistent display
  if (fromHeading.length === 0) return cleanHeading(headingLine);

  const first = fromHeading[0].trim();
  if (SCENE_HEADING.test(first)) {
    fromHeading[0] = cleanHeading(first);
  } else {
    fromHeading.unshift(cleanHeading(headingLine));
  }

  return fromHeading.join("\n").trim();
}

/**
 * Split a script into scenes on INT./EXT. slug lines.
 *
 * - Title-page / cast-list preamble before the first heading is discarded
 *   (not folded into scene 1).
 * - Cast-only "Script Report" stubs (heading + names, no body) are dropped
 *   so numbered drafts don't produce a duplicate empty half of the list.
 * - Page chrome inside a scene body is stripped.
 */
export function splitScenes(rawText: string): SplitScene[] {
  const cleaned = stripScriptChrome(rawText);
  const normalized = normalizeInlineHeadings(cleaned);
  const lines = normalized.split(/\r?\n/);

  const headingIndexes: number[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    // Slug lines are short; avoid matching prose that merely mentions "INT."
    if (SCENE_HEADING.test(line) && line.length <= 90) {
      headingIndexes.push(i);
    }
  }

  if (headingIndexes.length === 0) {
    return [{ heading: "Scene 1", text: normalized.trim(), sceneNumber: null }];
  }

  if (headingIndexes.length === 1) {
    const headingLine = lines[headingIndexes[0]];
    const text = finalizeSceneText(
      headingLine,
      lines.slice(headingIndexes[0]).join("\n")
    );
    return [
      {
        heading: cleanHeading(headingLine),
        text,
        sceneNumber: extractSceneNumber(headingLine),
      },
    ];
  }

  const scenes: SplitScene[] = [];
  for (let s = 0; s < headingIndexes.length; s++) {
    // Do NOT fold title-page preamble into the first scene
    const start = headingIndexes[s];
    const end =
      s + 1 < headingIndexes.length ? headingIndexes[s + 1] : lines.length;
    const chunk = lines.slice(start, end).join("\n").trim();
    if (!chunk) continue;
    if (isSceneStub(chunk)) continue;

    const headingLine = lines[headingIndexes[s]];
    scenes.push({
      heading: cleanHeading(headingLine),
      text: finalizeSceneText(headingLine, chunk),
      sceneNumber: extractSceneNumber(headingLine),
    });
  }

  // If every heading was a stub (unlikely), fall back to unfiltered split
  // so we never return an empty project.
  if (scenes.length === 0) {
    for (let s = 0; s < headingIndexes.length; s++) {
      const start = headingIndexes[s];
      const end =
        s + 1 < headingIndexes.length ? headingIndexes[s + 1] : lines.length;
      const chunk = lines.slice(start, end).join("\n").trim();
      if (!chunk) continue;
      const headingLine = lines[headingIndexes[s]];
      scenes.push({
        heading: cleanHeading(headingLine),
        text: finalizeSceneText(headingLine, chunk),
        sceneNumber: extractSceneNumber(headingLine),
      });
    }
  }

  return scenes;
}

export type ScreenplayElementType =
  | "slug"
  | "action"
  | "character"
  | "parenthetical"
  | "dialogue"
  | "transition"
  | "blank";

export interface ScreenplayElement {
  type: ScreenplayElementType;
  text: string;
}

const TRANSITION_LINE =
  /^(FADE (IN|OUT|TO BLACK)|CUT TO|SMASH CUT|DISSOLVE TO|MATCH CUT|JUMP CUT|WIPE TO|IRIS (IN|OUT)|TITLE|SUPER|INTERCUT)[:.]?\s*$/i;

const PARENTHETICAL_LINE = /^\([^)]+\)$/;

/** Extension parentheticals on cues — not age tags like (12). */
const CUE_EXTENSION =
  /\(\s*(V\.?\s*O\.?|O\.?\s*S\.?|O\.?\s*C\.?|CONT['’]?D|OFF(?:\s*SCREEN)?|INTO|PRELAP|FILTERED|OVER\s*PHONE|OVER\s*RADIO|casually|beat|whisper(?:ing)?|calling|shouting)[^)]*\)$/i;

/** Character cue: ALL CAPS, optional (V.O.) / (O.S.) / (CONT'D). */
const CHARACTER_LINE =
  /^[A-Z][A-Z0-9 .'\-]{0,36}(?:\s*\([^)]{1,28}\))?$/;

function isCharacterCueLine(line: string): boolean {
  const t = line.trim();
  if (!t || t.length > 42) return false;
  if (SCENE_HEADING.test(t) || TRANSITION_LINE.test(t)) return false;
  if (
    /^(FADE|CUT|SMASH|DISSOLVE|TITLE|SUPER|CONTINUED|MORE|OMITTED|THE END)\b/i.test(
      t
    )
  ) {
    return false;
  }
  if (!CHARACTER_LINE.test(t)) return false;
  if (/[a-z]/.test(t.replace(/\([^)]*\)/g, ""))) return false;
  const bare = t.replace(/\s*\([^)]*\)\s*$/, "").trim();
  if (bare.split(/\s+/).length > 6) return false;
  return true;
}

function splitDialogueAndAction(
  line: string
): { dialogue: string; action: string } | null {
  const re = /[.!?…]\s+/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(line)) !== null) {
    const after = line.slice(m.index + m[0].length);
    if (
      after &&
      looksLikeActionProse(after) &&
      /^(?:[A-Z][a-z]+|He|She|They|We|The|A|An|Another|As|Mum|Dad)\b/.test(after)
    ) {
      return {
        dialogue: line.slice(0, m.index + 1).trim(),
        action: after,
      };
    }
  }
  return null;
}

function looksLikeActionProse(line: string): boolean {
  const t = line.trim();
  if (!t) return false;
  if (/^["“'‘]/.test(t)) return false;
  if (t.length > 110) return true;
  if (/[;]$/.test(t) || /,\s*$/.test(t)) return true;
  if (
    /^(The |A |An |He |She |They |We |It |His |Her |Their |Another |As |On |In |Outside |Little |Suddenly |Then |Meanwhile )/i.test(
      t
    )
  ) {
    return true;
  }
  // Proper name + continuing prose (not a short spoken reply)
  if (
    /^[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?\b/.test(t) &&
    /\b[a-z]{3,}\b/.test(t) &&
    t.split(/\s+/).length >= 4
  ) {
    return true;
  }
  return false;
}

/**
 * Soft-split PDF extraction that ran character cues into action lines:
 * "...text. MUM Give it to me."
 * Careful not to split after INT./EXT. abbreviations in scene headings.
 */
function softSplitInlineCues(rawText: string): string {
  return rawText.replace(
    /(?<=[.!?…'"”)])\s+([A-Z][A-Z0-9.'\-]{1,28}(?:\s+[A-Z][A-Z0-9.'\-]{1,20}){0,2})(\s*\([^)]{1,28}\))?\s+(?=["“A-Z])/g,
    (match, name: string, paren: string | undefined, offset: number, full: string) => {
      const before = full.slice(0, offset).replace(/\s+$/, "");
      // INT. / EXT. / I/E. scene-heading abbreviations — not sentence ends
      if (/(?:^|[\s\n])(?:INT|EXT|EST|I\/E)\.?$/i.test(before)) return match;
      if (/(?:INT\.\/EXT|INT\/EXT|I\/E)\.?$/i.test(before)) return match;

      const cue = `${name}${paren ?? ""}`.trim();
      if (SCENE_HEADING.test(cue) || TRANSITION_LINE.test(cue)) return match;
      if (!isCharacterCueLine(cue)) return match;
      if (paren && !CUE_EXTENSION.test(paren) && /^\(\s*\d/.test(paren)) {
        return match;
      }
      // Don't invent a cue out of the location half of a slug line
      const lineStart = before.slice(before.lastIndexOf("\n") + 1);
      if (SCENE_HEADING.test(`${lineStart} ${cue}`)) return match;

      return `\n${cue}\n`;
    }
  );
}

/**
 * Classify screenplay lines into Final Draft–style elements for the View tab.
 */
export function tokenizeScreenplay(rawText: string): ScreenplayElement[] {
  if (!rawText.trim()) return [];

  const prepared = softSplitInlineCues(rawText);
  const lines = prepared.split(/\r?\n/);
  const elements: ScreenplayElement[] = [];

  let mode: "neutral" | "dialogue" = "neutral";

  for (const raw of lines) {
    const trimmed = raw.trim();

    if (!trimmed) {
      elements.push({ type: "blank", text: "" });
      mode = "neutral";
      continue;
    }

    if (/^\d{1,3}\.?$/.test(trimmed)) {
      mode = "neutral";
      continue;
    }

    if (SCENE_HEADING.test(trimmed)) {
      elements.push({ type: "slug", text: cleanHeading(trimmed) });
      mode = "neutral";
      continue;
    }

    if (TRANSITION_LINE.test(trimmed)) {
      elements.push({ type: "transition", text: trimmed.toUpperCase() });
      mode = "neutral";
      continue;
    }

    if (PARENTHETICAL_LINE.test(trimmed)) {
      elements.push({ type: "parenthetical", text: trimmed });
      mode = "dialogue";
      continue;
    }

    if (isCharacterCueLine(trimmed)) {
      elements.push({ type: "character", text: trimmed });
      mode = "dialogue";
      continue;
    }

    if (mode === "dialogue" && /^\([^)]+\)\s+\S/.test(trimmed)) {
      const m = trimmed.match(/^(\([^)]+\))\s+(.*)$/);
      if (m) {
        elements.push({ type: "parenthetical", text: m[1] });
        if (m[2]) {
          if (looksLikeActionProse(m[2])) {
            elements.push({ type: "action", text: m[2] });
            mode = "neutral";
          } else {
            elements.push({ type: "dialogue", text: m[2] });
          }
        }
        continue;
      }
    }

    if (mode === "dialogue") {
      const split = splitDialogueAndAction(trimmed);
      if (split?.dialogue) {
        elements.push({ type: "dialogue", text: split.dialogue });
        elements.push({ type: "action", text: split.action });
        mode = "neutral";
      } else if (looksLikeActionProse(trimmed)) {
        elements.push({ type: "action", text: trimmed });
        mode = "neutral";
      } else {
        elements.push({ type: "dialogue", text: trimmed });
      }
      continue;
    }

    elements.push({ type: "action", text: trimmed });
  }

  const collapsed: ScreenplayElement[] = [];
  for (const el of elements) {
    if (
      el.type === "blank" &&
      collapsed.length > 0 &&
      collapsed[collapsed.length - 1].type === "blank"
    ) {
      continue;
    }
    collapsed.push(el);
  }
  return collapsed;
}

