import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { db, sqlite } from "@/db";
import {
  canvasNodes,
  chatMessages,
  cheatSheets,
  scenes,
  scripts,
} from "@/db/schema";
import { createId, nowIso } from "@/lib/id";
import { mapScene, mapScript } from "@/lib/mappers";
import { parseScreenplayText } from "@/lib/screenplay";
import { diffScriptScenes, type SceneDiffEntry } from "@/lib/script-diff";
import {
  SLUG_ONLY_RAW_TEXT,
  type SceneSlugPayload,
  slugsToSplitScenes,
} from "@/lib/scene-slug";
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

function sceneRowsFromSlugs(opts: {
  projectId: string;
  scriptId: string;
  slugs: SceneSlugPayload[];
  sourceType: SceneSourceType;
  now: string;
}) {
  return opts.slugs.map((slug) => ({
    id: createId("scene"),
    projectId: opts.projectId,
    scriptId: opts.scriptId,
    heading: slug.heading,
    orderIndex: slug.orderIndex,
    sceneNumber: slug.sceneNumber,
    rawText: SLUG_ONLY_RAW_TEXT,
    sourceType: opts.sourceType,
    parsedMeta: null as string | null,
    createdAt: opts.now,
  }));
}

export function createScriptWithSceneSlugs(opts: {
  projectId: string;
  title: string;
  slugs: SceneSlugPayload[];
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

  const sceneRows = sceneRowsFromSlugs({
    projectId: opts.projectId,
    scriptId,
    slugs: opts.slugs,
    sourceType: opts.sourceType,
    now,
  });

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

/** Replace all scenes under a script from slug payloads (no script bodies). */
export function replaceScriptSceneSlugs(opts: {
  projectId: string;
  scriptId: string;
  slugs: SceneSlugPayload[];
  sourceType: SceneSourceType;
}): number {
  const now = nowIso();
  const sceneRows = sceneRowsFromSlugs({
    projectId: opts.projectId,
    scriptId: opts.scriptId,
    slugs: opts.slugs,
    sourceType: opts.sourceType,
    now,
  });

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

export type RemapTransferMap = Record<string, boolean>;

function reassignSceneScopedData(oldId: string, newId: string) {
  db.update(canvasNodes)
    .set({ sceneId: newId })
    .where(eq(canvasNodes.sceneId, oldId))
    .run();
  db.update(chatMessages)
    .set({ sceneId: newId })
    .where(eq(chatMessages.sceneId, oldId))
    .run();
  db.update(cheatSheets)
    .set({ sceneId: newId })
    .where(eq(cheatSheets.sceneId, oldId))
    .run();
}

function deleteSceneScopedData(sceneId: string) {
  db.delete(canvasNodes).where(eq(canvasNodes.sceneId, sceneId)).run();
  db.delete(chatMessages).where(eq(chatMessages.sceneId, sceneId)).run();
  db.delete(cheatSheets).where(eq(cheatSheets.sceneId, sceneId)).run();
}

export function previewScriptReplaceFromSlugs(opts: {
  projectId: string;
  scriptId: string;
  slugs: SceneSlugPayload[];
}): { diff: SceneDiffEntry[]; newSceneCount: number } {
  const oldScenes = db
    .select()
    .from(scenes)
    .where(
      and(
        eq(scenes.projectId, opts.projectId),
        eq(scenes.scriptId, opts.scriptId)
      )
    )
    .all()
    .map(mapScene);

  const parts = slugsToSplitScenes(opts.slugs);
  return {
    diff: diffScriptScenes(oldScenes, parts),
    newSceneCount: parts.length,
  };
}

export function replaceScriptScenesWithRemapFromSlugs(opts: {
  projectId: string;
  scriptId: string;
  slugs: SceneSlugPayload[];
  sourceType: SceneSourceType;
  transfers: RemapTransferMap;
}): { sceneCount: number; transferred: number } {
  const now = nowIso();
  const parts = slugsToSplitScenes(opts.slugs);
  const oldScenes = db
    .select()
    .from(scenes)
    .where(
      and(
        eq(scenes.projectId, opts.projectId),
        eq(scenes.scriptId, opts.scriptId)
      )
    )
    .all()
    .map(mapScene);

  const diff = diffScriptScenes(oldScenes, parts);
  let transferred = 0;

  sqlite.transaction(() => {
    const oldIds = oldScenes.map((s) => s.id);
    const remappedOldIds = new Set<string>();

    for (const entry of diff) {
      if (!entry.newScene) continue;
      const newId = createId("scene");
      const old = entry.oldScene;
      const shouldTransfer =
        Boolean(old) &&
        (entry.status === "unchanged" || entry.status === "changed") &&
        (opts.transfers[old!.id] ?? entry.transferDefault);

      db.insert(scenes)
        .values({
          id: newId,
          projectId: opts.projectId,
          scriptId: opts.scriptId,
          heading: entry.newScene.heading,
          orderIndex: entry.newScene.orderIndex,
          sceneNumber: entry.newScene.sceneNumber,
          shootDay: shouldTransfer ? (old?.shootDay ?? null) : null,
          shootOrder: shouldTransfer ? (old?.shootOrder ?? null) : null,
          rawText: SLUG_ONLY_RAW_TEXT,
          sourceType: opts.sourceType,
          parsedMeta: null,
          createdAt: now,
        })
        .run();

      if (shouldTransfer && old) {
        reassignSceneScopedData(old.id, newId);
        remappedOldIds.add(old.id);
        transferred += 1;
      }
    }

    for (const id of oldIds) {
      if (!remappedOldIds.has(id)) {
        deleteSceneScopedData(id);
      }
    }

    if (oldIds.length > 0) {
      db.delete(scenes).where(inArray(scenes.id, oldIds)).run();
    }

    db.update(scripts)
      .set({ sourceType: opts.sourceType })
      .where(eq(scripts.id, opts.scriptId))
      .run();
  })();

  return { sceneCount: parts.length, transferred };
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
    db.delete(canvasNodes).where(inArray(canvasNodes.sceneId, sceneIds)).run();
    db.delete(chatMessages).where(inArray(chatMessages.sceneId, sceneIds)).run();
  }
  db.delete(scenes).where(eq(scenes.scriptId, scriptId)).run();
  db.delete(scripts).where(eq(scripts.id, scriptId)).run();
}
