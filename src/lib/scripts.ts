import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { db, sqlite } from "@/db";
import { cheatSheets, scenes, scripts } from "@/db/schema";
import { createId, nowIso } from "@/lib/id";
import { mapScene, mapScript } from "@/lib/mappers";
import { parseScreenplayText, splitScenes } from "@/lib/screenplay";
import type { Scene, Script, SceneSourceType } from "@/types";

export type ScriptCreateResult = {
  script: Script;
  sceneCount: number;
};

export function listScriptsForProject(projectId: string): Script[] {
  return db
    .select()
    .from(scripts)
    .where(eq(scripts.projectId, projectId))
    .orderBy(asc(scripts.episodeNumber), asc(scripts.orderIndex))
    .all()
    .map(mapScript);
}

/** Parse character/beat meta for scenes that were imported without it. */
export function backfillParsedMeta(projectId: string, limit = 30): void {
  const rows = db
    .select({ id: scenes.id, rawText: scenes.rawText })
    .from(scenes)
    .where(and(eq(scenes.projectId, projectId), isNull(scenes.parsedMeta)))
    .limit(limit)
    .all();

  for (const row of rows) {
    db.update(scenes)
      .set({
        parsedMeta: JSON.stringify(parseScreenplayText(row.rawText)),
      })
      .where(eq(scenes.id, row.id))
      .run();
  }
}

export function listScenesForProject(projectId: string): Scene[] {
  backfillParsedMeta(projectId);

  const scriptRows = listScriptsForProject(projectId);
  const scriptOrder = new Map(
    scriptRows.map((s) => [s.id, s.episodeNumber * 1000 + s.orderIndex])
  );
  const sceneRows = db
    .select()
    .from(scenes)
    .where(eq(scenes.projectId, projectId))
    .all()
    .map(mapScene);

  return sceneRows.sort((a, b) => {
    const ao = scriptOrder.get(a.scriptId) ?? 0;
    const bo = scriptOrder.get(b.scriptId) ?? 0;
    if (ao !== bo) return ao - bo;
    return a.orderIndex - b.orderIndex;
  });
}

export function nextScriptOrderIndex(projectId: string): number {
  const rows = db
    .select()
    .from(scripts)
    .where(eq(scripts.projectId, projectId))
    .all();
  if (rows.length === 0) return 0;
  return Math.max(...rows.map((r) => r.orderIndex)) + 1;
}

export function nextEpisodeNumber(projectId: string): number {
  const rows = db
    .select()
    .from(scripts)
    .where(eq(scripts.projectId, projectId))
    .all();
  if (rows.length === 0) return 1;
  return Math.max(...rows.map((r) => r.episodeNumber ?? r.orderIndex + 1)) + 1;
}

export function createScriptWithScenes(opts: {
  projectId: string;
  title: string;
  rawText: string;
  sourceType: SceneSourceType;
  orderIndex?: number;
  episodeNumber?: number;
}): ScriptCreateResult {
  const now = nowIso();
  const scriptId = createId("script");
  const orderIndex = opts.orderIndex ?? nextScriptOrderIndex(opts.projectId);
  const episodeNumber =
    typeof opts.episodeNumber === "number" && opts.episodeNumber >= 1
      ? Math.floor(opts.episodeNumber)
      : nextEpisodeNumber(opts.projectId);
  const title = opts.title.trim() || `Episode ${episodeNumber}`;

  const parts = splitScenes(opts.rawText.trim());
  const sceneRows = parts.map((part, i) => ({
    id: createId("scene"),
    projectId: opts.projectId,
    scriptId,
    heading: part.heading,
    orderIndex: i,
    sceneNumber: part.sceneNumber,
    rawText: part.text,
    sourceType: opts.sourceType,
    parsedMeta: null as string | null,
    createdAt: now,
  }));

  sqlite.transaction(() => {
    db.insert(scripts)
      .values({
        id: scriptId,
        projectId: opts.projectId,
        title,
        orderIndex,
        episodeNumber,
        sourceType: opts.sourceType,
        createdAt: now,
      })
      .run();

    for (const row of sceneRows) {
      db.insert(scenes).values(row).run();
    }
  })();

  const script = mapScript(
    db.select().from(scripts).where(eq(scripts.id, scriptId)).get()!
  );

  return { script, sceneCount: sceneRows.length };
}

/** Replace all scenes under a script; drop their per-scene cheat sheets. */
export function replaceScriptScenes(opts: {
  projectId: string;
  scriptId: string;
  rawText: string;
  sourceType: SceneSourceType;
}): number {
  const now = nowIso();
  const parts = splitScenes(opts.rawText.trim());
  const sceneRows = parts.map((part, i) => ({
    id: createId("scene"),
    projectId: opts.projectId,
    scriptId: opts.scriptId,
    heading: part.heading,
    orderIndex: i,
    sceneNumber: part.sceneNumber,
    rawText: part.text,
    sourceType: opts.sourceType,
    parsedMeta: null as string | null,
    createdAt: now,
  }));

  sqlite.transaction(() => {
    const oldScenes = db
      .select({ id: scenes.id })
      .from(scenes)
      .where(
        and(
          eq(scenes.projectId, opts.projectId),
          eq(scenes.scriptId, opts.scriptId)
        )
      )
      .all();

    for (const old of oldScenes) {
      db.delete(cheatSheets).where(eq(cheatSheets.sceneId, old.id)).run();
    }

    db.delete(scenes)
      .where(
        and(
          eq(scenes.projectId, opts.projectId),
          eq(scenes.scriptId, opts.scriptId)
        )
      )
      .run();

    db.update(scripts)
      .set({ sourceType: opts.sourceType })
      .where(eq(scripts.id, opts.scriptId))
      .run();

    for (const row of sceneRows) {
      db.insert(scenes).values(row).run();
    }
  })();

  return sceneRows.length;
}

export function deleteScriptAndScenes(scriptId: string) {
  const sceneRows = db
    .select()
    .from(scenes)
    .where(eq(scenes.scriptId, scriptId))
    .all();
  const sceneIds = sceneRows.map((s) => s.id);
  if (sceneIds.length > 0) {
    db.delete(cheatSheets).where(inArray(cheatSheets.sceneId, sceneIds)).run();
  }
  db.delete(scenes).where(eq(scenes.scriptId, scriptId)).run();
  db.delete(scripts).where(eq(scripts.id, scriptId)).run();
}
