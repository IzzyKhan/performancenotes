import type { Scene, Script } from "@/types";

export type ScheduleAssignment = {
  id: string;
  shootDay: number | null;
  shootOrder: number | null;
};

function scriptOrderMap(scripts: Script[]): Map<string, number> {
  return new Map(
    scripts.map((s) => [s.id, s.episodeNumber * 1000 + s.orderIndex])
  );
}

/** Scheduled first (day, order), then by script order, then scene order. */
export function sortScenesByShootThenScript(
  scenes: Scene[],
  scripts: Script[] = []
): Scene[] {
  const order = scriptOrderMap(scripts);
  return [...scenes].sort((a, b) => {
    const aSched = a.shootDay != null;
    const bSched = b.shootDay != null;
    if (aSched !== bSched) return aSched ? -1 : 1;
    if (aSched && bSched) {
      const day = (a.shootDay ?? 0) - (b.shootDay ?? 0);
      if (day !== 0) return day;
      const shootOrd = (a.shootOrder ?? 0) - (b.shootOrder ?? 0);
      if (shootOrd !== 0) return shootOrd;
    }
    const ao = order.get(a.scriptId) ?? 0;
    const bo = order.get(b.scriptId) ?? 0;
    if (ao !== bo) return ao - bo;
    return a.orderIndex - b.orderIndex;
  });
}

/**
 * Normalize board assignments: clear order when unscheduled;
 * renumber shootOrder 1…n within each day by submitted sequence.
 */
export function normalizeScheduleAssignments(
  assignments: ScheduleAssignment[]
): ScheduleAssignment[] {
  const byDay = new Map<number, ScheduleAssignment[]>();
  const unscheduled: ScheduleAssignment[] = [];

  for (const a of assignments) {
    if (a.shootDay == null || a.shootDay < 1) {
      unscheduled.push({ id: a.id, shootDay: null, shootOrder: null });
      continue;
    }
    const day = Math.floor(a.shootDay);
    const list = byDay.get(day) ?? [];
    list.push(a);
    byDay.set(day, list);
  }

  const normalized: ScheduleAssignment[] = [...unscheduled];
  const days = [...byDay.keys()].sort((x, y) => x - y);
  for (const day of days) {
    const list = byDay.get(day)!;
    list
      .sort((a, b) => (a.shootOrder ?? 0) - (b.shootOrder ?? 0))
      .forEach((a, i) => {
        normalized.push({
          id: a.id,
          shootDay: day,
          shootOrder: i + 1,
        });
      });
  }
  return normalized;
}

/** Short episode prefix from the script's episode number: "E3". */
export function scriptShortLabel(script: Script): string {
  return `E${script.episodeNumber}`;
}

/**
 * Scene slug for UI / PDF. Multi-script: "E1 · 3. INT…";
 * single-script: "3. INT…".
 * Prefers production sceneNumber from the script when present.
 */
export function sceneSlugLabel(
  scene: Scene,
  script?: Script | null,
  multiScript = false
): string {
  const num = scene.sceneNumber?.trim() || String(scene.orderIndex + 1);
  const base = `${num}. ${scene.heading}`;
  if (!multiScript || !script) return base;
  return `${scriptShortLabel(script)} · ${base}`;
}

/** Shoot-day chip for PDF headers: "Day 2 · #3", or null if unscheduled. */
export function shootDayOrderLabel(scene: Scene): string | null {
  if (scene.shootDay == null) return null;
  const order = scene.shootOrder ?? 1;
  return `Day ${scene.shootDay} · #${order}`;
}

export function shootSectionLabel(
  scene: Scene,
  script?: Script | null,
  multiScript = false
): string {
  const slug = sceneSlugLabel(scene, script, multiScript);
  const day = shootDayOrderLabel(scene);
  return day ? `${day} · ${slug}` : slug;
}

/** Sort scene ids by script order then scene order (for unscheduled column). */
export function sortSceneIdsByScriptThenOrder(
  ids: string[],
  scenesById: Map<string, Scene>,
  scripts: Script[]
): string[] {
  const order = scriptOrderMap(scripts);
  return [...ids].sort((a, b) => {
    const sa = scenesById.get(a);
    const sb = scenesById.get(b);
    const ao = order.get(sa?.scriptId ?? "") ?? 0;
    const bo = order.get(sb?.scriptId ?? "") ?? 0;
    if (ao !== bo) return ao - bo;
    return (sa?.orderIndex ?? 0) - (sb?.orderIndex ?? 0);
  });
}
