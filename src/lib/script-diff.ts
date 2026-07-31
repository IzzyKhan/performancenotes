import type { Scene } from "@/types";
import type { SplitScene } from "@/lib/screenplay";

export type SceneDiffStatus =
  | "unchanged"
  | "changed"
  | "added"
  | "removed"
  | "ambiguous";

export type DiffOldScene = {
  id: string;
  heading: string;
  sceneNumber: string | null;
  shootDay: number | null;
  shootOrder: number | null;
  orderIndex: number;
  rawText: string;
};

export type DiffNewScene = {
  key: string;
  heading: string;
  sceneNumber: string | null;
  orderIndex: number;
  rawText: string;
};

export type SceneDiffEntry = {
  status: SceneDiffStatus;
  oldScene?: DiffOldScene;
  newScene?: DiffNewScene;
  matchReason?: "sceneNumber" | "heading";
  /** Default: transfer prep for unchanged/changed matches. */
  transferDefault: boolean;
};

function normalizeHeading(h: string): string {
  return h
    .toUpperCase()
    .replace(/\s+/g, " ")
    .replace(/[–—]/g, "-")
    .trim();
}

function normalizeSceneNumber(n: string | null | undefined): string | null {
  if (!n) return null;
  return n.trim().toUpperCase();
}

function toOld(s: Scene): DiffOldScene {
  return {
    id: s.id,
    heading: s.heading,
    sceneNumber: s.sceneNumber,
    shootDay: s.shootDay,
    shootOrder: s.shootOrder,
    orderIndex: s.orderIndex,
    rawText: s.rawText,
  };
}

function toNew(part: SplitScene, orderIndex: number): DiffNewScene {
  return {
    key: `new_${orderIndex}_${part.sceneNumber ?? "x"}_${normalizeHeading(part.heading).slice(0, 24)}`,
    heading: part.heading,
    sceneNumber: part.sceneNumber,
    orderIndex,
    rawText: part.text,
  };
}

/**
 * Diff existing episode scenes against a newly parsed script revision.
 * Slug-only at launch: "changed" means heading differs (not dialogue/action).
 * Prefers production scene numbers, then normalized headings.
 */
export function diffScriptScenes(
  oldScenes: Scene[],
  newParts: SplitScene[]
): SceneDiffEntry[] {
  const olds = [...oldScenes].sort((a, b) => a.orderIndex - b.orderIndex);
  const news = newParts.map((p, i) => toNew(p, i));

  const usedOld = new Set<string>();
  const usedNew = new Set<string>();
  const entries: SceneDiffEntry[] = [];

  const oldByNum = new Map<string, DiffOldScene[]>();
  for (const s of olds) {
    const num = normalizeSceneNumber(s.sceneNumber);
    if (!num) continue;
    const list = oldByNum.get(num) ?? [];
    list.push(toOld(s));
    oldByNum.set(num, list);
  }

  const newByNum = new Map<string, DiffNewScene[]>();
  for (const n of news) {
    const num = normalizeSceneNumber(n.sceneNumber);
    if (!num) continue;
    const list = newByNum.get(num) ?? [];
    list.push(n);
    newByNum.set(num, list);
  }

  // 1) Unique scene-number matches
  for (const [num, oldList] of oldByNum) {
    const newList = newByNum.get(num);
    if (!newList) continue;
    if (oldList.length === 1 && newList.length === 1) {
      const oldScene = oldList[0];
      const newScene = newList[0];
      usedOld.add(oldScene.id);
      usedNew.add(newScene.key);
      const changed =
        normalizeHeading(oldScene.heading) !==
        normalizeHeading(newScene.heading);
      entries.push({
        status: changed ? "changed" : "unchanged",
        oldScene,
        newScene,
        matchReason: "sceneNumber",
        transferDefault: true,
      });
    } else {
      // Duplicate numbers — leave for heading / ambiguous handling
    }
  }

  // 2) Heading matches among leftovers
  const remainingOld = olds
    .map(toOld)
    .filter((s) => !usedOld.has(s.id));
  const remainingNew = news.filter((n) => !usedNew.has(n.key));

  for (const oldScene of remainingOld) {
    const needle = normalizeHeading(oldScene.heading);
    const hits = remainingNew.filter(
      (n) => !usedNew.has(n.key) && normalizeHeading(n.heading) === needle
    );
    if (hits.length === 1) {
      const newScene = hits[0];
      usedOld.add(oldScene.id);
      usedNew.add(newScene.key);
      entries.push({
        status: "unchanged",
        oldScene,
        newScene,
        matchReason: "heading",
        transferDefault: true,
      });
    } else if (hits.length > 1) {
      usedOld.add(oldScene.id);
      entries.push({
        status: "ambiguous",
        oldScene,
        transferDefault: false,
      });
    }
  }

  // 3) Removals
  for (const s of olds) {
    if (usedOld.has(s.id)) continue;
    entries.push({
      status: "removed",
      oldScene: toOld(s),
      transferDefault: false,
    });
  }

  // 4) Additions
  for (const n of news) {
    if (usedNew.has(n.key)) continue;
    entries.push({
      status: "added",
      newScene: n,
      transferDefault: false,
    });
  }

  // Stable-ish order: by new orderIndex, then removals at end
  return entries.sort((a, b) => {
    const ai = a.newScene?.orderIndex ?? a.oldScene?.orderIndex ?? 9999;
    const bi = b.newScene?.orderIndex ?? b.oldScene?.orderIndex ?? 9999;
    if (ai !== bi) return ai - bi;
    if (a.status === "removed" && b.status !== "removed") return 1;
    if (b.status === "removed" && a.status !== "removed") return -1;
    return 0;
  });
}
