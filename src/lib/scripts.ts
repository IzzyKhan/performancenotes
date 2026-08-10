import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/db";
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

export async function listScriptsForProject(projectId: string): Promise<Script[]> {
  return (
    await db
      .select()
      .from(scripts)
      .where(eq(scripts.projectId, projectId))
      .orderBy(asc(scripts.episodeNumber), asc(scripts.orderIndex))
      .all()
  ).map(mapScript);
}

/** Parse character/beat meta for scenes that were imported without it. */
export async function backfillParsedMeta(
  projectId: string,
  limit = 30
): Promise<void> {
  const rows = await db
    .select({ id: scenes.id, rawText: scenes.rawText })
    .from(scenes)
    .where(and(eq(scenes.projectId, projectId), isNull(scenes.parsedMeta)))
    .limit(limit)
    .all();

  for (const row of rows) {
    await db
      .update(scenes)
      .set({
        parsedMeta: JSON.stringify(parseScreenplayText(row.rawText)),
      })
      .where(eq(scenes.id, row.id))
      .run();
  }
}

export async function listScenesForProject(projectId: string): Promise<Scene[]> {
  await backfillParsedMeta(projectId);

  const scriptRows = await listScriptsForProject(projectId);
  const scriptOrder = new Map(
    scriptRows.map((s) => [s.id, s.episodeNumber * 1000 + s.orderIndex])
  );
  const sceneRows = (
    await db.select().from(scenes).where(eq(scenes.projectId, projectId)).all()
  ).map(mapScene);

  return sceneRows.sort((a, b) => {
    const ao = scriptOrder.get(a.scriptId) ?? 0;
    const bo = scriptOrder.get(b.scriptId) ?? 0;
    if (ao !== bo) return ao - bo;
    return a.orderIndex - b.orderIndex;
  });
}

export async function nextScriptOrderIndex(projectId: string): Promise<number> {
  const rows = await db
    .select()
    .from(scripts)
    .where(eq(scripts.projectId, projectId))
    .all();
  if (rows.length === 0) return 0;
  return Math.max(...rows.map((r) => r.orderIndex)) + 1;
}

export async function nextEpisodeNumber(projectId: string): Promise<number> {
  const rows = await db
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

export async function createScriptWithSceneSlugs(opts: {
  projectId: string;
  title: string;
  slugs: SceneSlugPayload[];
  sourceType: SceneSourceType;
  orderIndex?: number;
  episodeNumber?: number;
}): Promise<ScriptCreateResult> {
  const now = nowIso();
  const scriptId = createId("script");
  const orderIndex =
    opts.orderIndex ?? (await nextScriptOrderIndex(opts.projectId));
  const episodeNumber =
    typeof opts.episodeNumber === "number" && opts.episodeNumber >= 1
      ? Math.floor(opts.episodeNumber)
      : await nextEpisodeNumber(opts.projectId);
  const title = opts.title.trim() || `Episode ${episodeNumber}`;

  const sceneRows = sceneRowsFromSlugs({
    projectId: opts.projectId,
    scriptId,
    slugs: opts.slugs,
    sourceType: opts.sourceType,
    now,
  });

  await db.transaction(async (tx) => {
    await tx
      .insert(scripts)
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
      await tx.insert(scenes).values(row).run();
    }
  });

  const script = mapScript(
    (await db.select().from(scripts).where(eq(scripts.id, scriptId)).get())!
  );

  return { script, sceneCount: sceneRows.length };
}

/** Replace all scenes under a script from slug payloads (no script bodies). */
export async function replaceScriptSceneSlugs(opts: {
  projectId: string;
  scriptId: string;
  slugs: SceneSlugPayload[];
  sourceType: SceneSourceType;
}): Promise<number> {
  const now = nowIso();
  const sceneRows = sceneRowsFromSlugs({
    projectId: opts.projectId,
    scriptId: opts.scriptId,
    slugs: opts.slugs,
    sourceType: opts.sourceType,
    now,
  });

  await db.transaction(async (tx) => {
    const oldScenes = await tx
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
      await tx.delete(cheatSheets).where(eq(cheatSheets.sceneId, old.id)).run();
    }

    await tx
      .delete(scenes)
      .where(
        and(
          eq(scenes.projectId, opts.projectId),
          eq(scenes.scriptId, opts.scriptId)
        )
      )
      .run();

    await tx
      .update(scripts)
      .set({ sourceType: opts.sourceType })
      .where(eq(scripts.id, opts.scriptId))
      .run();

    for (const row of sceneRows) {
      await tx.insert(scenes).values(row).run();
    }
  });

  return sceneRows.length;
}

export type RemapTransferMap = Record<string, boolean>;

/**
 * Manually insert one scene after `afterSceneId` (or at the end of the script).
 * For small edits the user would rather make by hand than re-upload a revision.
 */
export async function insertSceneAfter(opts: {
  projectId: string;
  scriptId: string;
  heading: string;
  sceneNumber: string | null;
  afterSceneId?: string | null;
}): Promise<Scene> {
  const now = nowIso();
  const newId = createId("scene");

  await db.transaction(async (tx) => {
    const siblings = (
      await tx
        .select()
        .from(scenes)
        .where(
          and(
            eq(scenes.projectId, opts.projectId),
            eq(scenes.scriptId, opts.scriptId)
          )
        )
        .all()
    ).sort((a, b) => a.orderIndex - b.orderIndex);

    const afterPos = opts.afterSceneId
      ? siblings.findIndex((s) => s.id === opts.afterSceneId)
      : -1;
    const insertAt = afterPos >= 0 ? afterPos + 1 : siblings.length;

    // Renumber from the tail so the shifted rows never collide mid-update.
    for (let i = siblings.length - 1; i >= insertAt; i--) {
      await tx
        .update(scenes)
        .set({ orderIndex: i + 1 })
        .where(eq(scenes.id, siblings[i].id))
        .run();
    }

    const script = await tx
      .select()
      .from(scripts)
      .where(eq(scripts.id, opts.scriptId))
      .get();

    await tx
      .insert(scenes)
      .values({
        id: newId,
        projectId: opts.projectId,
        scriptId: opts.scriptId,
        heading: opts.heading,
        orderIndex: insertAt,
        sceneNumber: opts.sceneNumber,
        rawText: SLUG_ONLY_RAW_TEXT,
        sourceType: (script?.sourceType as SceneSourceType) ?? "typed",
        parsedMeta: null,
        createdAt: now,
      })
      .run();
  });

  return mapScene(
    (await db.select().from(scenes).where(eq(scenes.id, newId)).get())!
  );
}

/** Delete one scene plus its canvas / chat / cheat sheet prep, then reindex. */
export async function deleteSceneById(sceneId: string): Promise<boolean> {
  const scene = await db
    .select()
    .from(scenes)
    .where(eq(scenes.id, sceneId))
    .get();
  if (!scene) return false;

  await db.transaction(async (tx) => {
    await deleteSceneScopedData(tx, sceneId);
    await tx.delete(scenes).where(eq(scenes.id, sceneId)).run();

    const remaining = (
      await tx
        .select()
        .from(scenes)
        .where(
          and(
            eq(scenes.projectId, scene.projectId),
            eq(scenes.scriptId, scene.scriptId)
          )
        )
        .all()
    ).sort((a, b) => a.orderIndex - b.orderIndex);

    for (let i = 0; i < remaining.length; i++) {
      const row = remaining[i];
      if (row.orderIndex !== i) {
        await tx
          .update(scenes)
          .set({ orderIndex: i })
          .where(eq(scenes.id, row.id))
          .run();
      }
    }
  });

  return true;
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function reassignSceneScopedData(tx: Tx, oldId: string, newId: string) {
  await tx
    .update(canvasNodes)
    .set({ sceneId: newId })
    .where(eq(canvasNodes.sceneId, oldId))
    .run();
  await tx
    .update(chatMessages)
    .set({ sceneId: newId })
    .where(eq(chatMessages.sceneId, oldId))
    .run();
  await tx
    .update(cheatSheets)
    .set({ sceneId: newId })
    .where(eq(cheatSheets.sceneId, oldId))
    .run();
}

async function deleteSceneScopedData(tx: Tx, sceneId: string) {
  await tx.delete(canvasNodes).where(eq(canvasNodes.sceneId, sceneId)).run();
  await tx.delete(chatMessages).where(eq(chatMessages.sceneId, sceneId)).run();
  await tx.delete(cheatSheets).where(eq(cheatSheets.sceneId, sceneId)).run();
}

export async function previewScriptReplaceFromSlugs(opts: {
  projectId: string;
  scriptId: string;
  slugs: SceneSlugPayload[];
}): Promise<{ diff: SceneDiffEntry[]; newSceneCount: number }> {
  const oldScenes = (
    await db
      .select()
      .from(scenes)
      .where(
        and(
          eq(scenes.projectId, opts.projectId),
          eq(scenes.scriptId, opts.scriptId)
        )
      )
      .all()
  ).map(mapScene);

  const parts = slugsToSplitScenes(opts.slugs);
  return {
    diff: diffScriptScenes(oldScenes, parts),
    newSceneCount: parts.length,
  };
}

export async function replaceScriptScenesWithRemapFromSlugs(opts: {
  projectId: string;
  scriptId: string;
  slugs: SceneSlugPayload[];
  sourceType: SceneSourceType;
  transfers: RemapTransferMap;
}): Promise<{ sceneCount: number; transferred: number }> {
  const now = nowIso();
  const parts = slugsToSplitScenes(opts.slugs);
  const oldScenes = (
    await db
      .select()
      .from(scenes)
      .where(
        and(
          eq(scenes.projectId, opts.projectId),
          eq(scenes.scriptId, opts.scriptId)
        )
      )
      .all()
  ).map(mapScene);

  const diff = diffScriptScenes(oldScenes, parts);
  let transferred = 0;

  await db.transaction(async (tx) => {
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

      await tx
        .insert(scenes)
        .values({
          id: newId,
          projectId: opts.projectId,
          scriptId: opts.scriptId,
          heading: entry.newScene.heading,
          orderIndex: entry.newScene.orderIndex,
          sceneNumber: entry.newScene.sceneNumber,
          shootDay: shouldTransfer ? (old?.shootDay ?? null) : null,
          shootOrder: shouldTransfer ? (old?.shootOrder ?? null) : null,
          prepped: shouldTransfer && old?.prepped ? 1 : 0,
          rawText: SLUG_ONLY_RAW_TEXT,
          sourceType: opts.sourceType,
          parsedMeta: null,
          createdAt: now,
        })
        .run();

      if (shouldTransfer && old) {
        await reassignSceneScopedData(tx, old.id, newId);
        remappedOldIds.add(old.id);
        transferred += 1;
      }
    }

    for (const id of oldIds) {
      if (!remappedOldIds.has(id)) {
        await deleteSceneScopedData(tx, id);
      }
    }

    if (oldIds.length > 0) {
      await tx.delete(scenes).where(inArray(scenes.id, oldIds)).run();
    }

    await tx
      .update(scripts)
      .set({ sourceType: opts.sourceType })
      .where(eq(scripts.id, opts.scriptId))
      .run();
  });

  return { sceneCount: parts.length, transferred };
}

export async function deleteScriptAndScenes(scriptId: string): Promise<void> {
  const sceneRows = await db
    .select()
    .from(scenes)
    .where(eq(scenes.scriptId, scriptId))
    .all();
  const sceneIds = sceneRows.map((s) => s.id);
  if (sceneIds.length > 0) {
    await db
      .delete(cheatSheets)
      .where(inArray(cheatSheets.sceneId, sceneIds))
      .run();
    await db
      .delete(canvasNodes)
      .where(inArray(canvasNodes.sceneId, sceneIds))
      .run();
    await db
      .delete(chatMessages)
      .where(inArray(chatMessages.sceneId, sceneIds))
      .run();
  }
  await db.delete(scenes).where(eq(scenes.scriptId, scriptId)).run();
  await db.delete(scripts).where(eq(scripts.id, scriptId)).run();
}
