import type { ActionNote } from "@/types";

/**
 * Normalize an action note from stored JSON or model output.
 * Accepts legacy `{ verb }`, `{ verb, synonyms }`, or `{ verbs: string[] }`.
 */
export function normalizeActionNote(raw: unknown): ActionNote | null {
  if (!raw || typeof raw !== "object") return null;
  const a = raw as Record<string, unknown>;
  const moment = typeof a.moment === "string" ? a.moment : "";

  let verbs: string[] = [];
  if (Array.isArray(a.verbs)) {
    verbs = a.verbs
      .filter((v): v is string => typeof v === "string")
      .map((v) => v.trim())
      .filter(Boolean);
  } else {
    const primary = typeof a.verb === "string" ? a.verb.trim() : "";
    const synonyms = Array.isArray(a.synonyms)
      ? a.synonyms
          .filter((v): v is string => typeof v === "string")
          .map((v) => v.trim())
          .filter(Boolean)
      : [];
    if (primary) verbs = [primary, ...synonyms.filter((s) => s !== primary)];
    else verbs = synonyms;
  }

  // Cap at 3 options for on-set readability
  verbs = verbs.slice(0, 3);
  if (verbs.length === 0 && !moment) return { verb: "", synonyms: [], moment: "" };

  return {
    verb: verbs[0] ?? "",
    synonyms: verbs.slice(1),
    moment,
  };
}

/** All playable options for an action, primary first. */
export function actionVerbList(a: ActionNote): string[] {
  const list = [a.verb, ...(a.synonyms ?? [])]
    .map((v) => v.trim())
    .filter(Boolean);
  return [...new Set(list)].slice(0, 3);
}

/**
 * On-set format from the iteration notes:
 * `to (provoke, bait, needle)` or `to provoke` when only one.
 */
export function formatActionVerbs(a: ActionNote): string {
  const verbs = actionVerbList(a);
  if (verbs.length === 0) return "";
  if (verbs.length === 1) return `to ${verbs[0]}`;
  return `to (${verbs.join(", ")})`;
}

export function formatActionLine(a: ActionNote): string {
  const verbs = formatActionVerbs(a);
  if (!verbs) return "";
  const moment = a.moment?.trim();
  return moment ? `${verbs} — ${moment}` : verbs;
}
