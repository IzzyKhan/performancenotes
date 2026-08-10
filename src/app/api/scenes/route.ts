import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, ensureDb } from "@/db";
import { scenes, scripts } from "@/db/schema";
import { requireProjectAccess } from "@/lib/auth-guard";
import {
  checkSceneCreateAllowed,
  checkScriptCreateAllowed,
} from "@/lib/entitlement-guard";
import { mapScene } from "@/lib/mappers";
import { parseSlugIngestBody } from "@/lib/scene-slug";
import {
  createScriptWithSceneSlugs,
  deleteSceneById,
  insertSceneAfter,
  listScenesForProject,
  replaceScriptSceneSlugs,
  replaceScriptScenesWithRemapFromSlugs,
  previewScriptReplaceFromSlugs,
  type RemapTransferMap,
} from "@/lib/scripts";

export const runtime = "nodejs";
export const maxDuration = 120;

const SLUG_ONLY_HINT =
  "Parse the PDF in your browser and send scene headings as JSON (scenes array). We do not accept script files or body text on the server.";

export async function GET(request: Request) {
  await ensureDb();
  const { searchParams } = new URL(request.url);
  const projectId = searchParams.get("projectId");
  if (!projectId) {
    return NextResponse.json({ error: "Missing projectId" }, { status: 400 });
  }

  const access = await requireProjectAccess(projectId);
  if ("error" in access) return access.error;

  return NextResponse.json(await listScenesForProject(projectId));
}

/**
 * Sync scene slugs for one episode (client-parsed). Replaces scenes under that
 * script. If scriptId is omitted, creates a new script on the project.
 *
 * JSON body:
 * { projectId, scriptId?, title?, sourceType, scenes: [{ heading, sceneNumber, orderIndex }] }
 *
 * Replace modes (when scriptId is set):
 * - mode=preview — diff only, no DB write (optional; client may diff locally)
 * - transfers — apply remap (canvas/chat/cheat/schedule for matched scenes)
 * - otherwise — wipe-and-replace
 */
export async function POST(request: Request) {
  await ensureDb();
  const contentType = request.headers.get("content-type") || "";

  if (contentType.includes("multipart/form-data")) {
    return NextResponse.json({ error: SLUG_ONLY_HINT }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const single = parseSingleSceneBody(body);
  if (single) return addSingleScene(single);

  const ingest = parseSlugIngestBody(body);
  if (!ingest) {
    return NextResponse.json(
      {
        error: `projectId and scenes[] are required. ${SLUG_ONLY_HINT}`,
      },
      { status: 400 }
    );
  }

  const {
    projectId,
    scriptId,
    title,
    sourceType,
    scenes: slugs,
    mode,
    transfers,
  } = ingest;

  const access = await requireProjectAccess(projectId);
  if ("error" in access) return access.error;

  const saveStarted = Date.now();

  if (scriptId) {
    const script = await db
      .select()
      .from(scripts)
      .where(eq(scripts.id, scriptId))
      .get();
    if (!script || script.projectId !== projectId) {
      return NextResponse.json({ error: "Script not found" }, { status: 404 });
    }

    if (mode === "preview") {
      const preview = await previewScriptReplaceFromSlugs({
        projectId,
        scriptId,
        slugs,
      });
      console.info(
        `[api/scenes POST] Preview ${scriptId}: ${preview.newSceneCount} new scenes, ${Date.now() - saveStarted}ms`
      );
      return NextResponse.json(preview);
    }

    if (transfers) {
      const result = await replaceScriptScenesWithRemapFromSlugs({
        projectId,
        scriptId,
        slugs,
        sourceType,
        transfers: transfers as RemapTransferMap,
      });
      console.info(
        `[api/scenes POST] Remapped ${scriptId}: ${result.sceneCount} scenes, ${result.transferred} transferred, ${Date.now() - saveStarted}ms`
      );
      return NextResponse.json(
        {
          scriptId,
          sceneCount: result.sceneCount,
          transferred: result.transferred,
        },
        { status: 201 }
      );
    }

    const sceneCount = await replaceScriptSceneSlugs({
      projectId,
      scriptId,
      slugs,
      sourceType,
    });
    console.info(
      `[api/scenes POST] Replaced ${scriptId}: ${sceneCount} scenes, ${Date.now() - saveStarted}ms`
    );
    return NextResponse.json({ scriptId, sceneCount }, { status: 201 });
  }

  const allowed = await checkScriptCreateAllowed(access.user.id, projectId);
  if (!allowed.ok) return allowed.error;

  const result = await createScriptWithSceneSlugs({
    projectId,
    title: title || "Episode 1",
    slugs,
    sourceType,
  });
  console.info(
    `[api/scenes POST] Created ${result.script.title}: ${result.sceneCount} scenes, ${Date.now() - saveStarted}ms`
  );
  return NextResponse.json(result, { status: 201 });
}

/** Manual single-scene add: { projectId, scriptId, scene: { heading, sceneNumber?, afterSceneId? } } */
type SingleSceneBody = {
  projectId: string;
  scriptId: string;
  heading: string;
  sceneNumber: string | null;
  afterSceneId: string | null;
};

function parseSingleSceneBody(body: unknown): SingleSceneBody | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  const scene = b.scene;
  if (!scene || typeof scene !== "object" || Array.isArray(scene)) return null;

  const s = scene as Record<string, unknown>;
  const projectId = typeof b.projectId === "string" ? b.projectId.trim() : "";
  const scriptId = typeof b.scriptId === "string" ? b.scriptId.trim() : "";
  const heading = typeof s.heading === "string" ? s.heading.trim() : "";
  if (!projectId || !scriptId || !heading) return null;

  return {
    projectId,
    scriptId,
    heading,
    sceneNumber:
      typeof s.sceneNumber === "string" && s.sceneNumber.trim()
        ? s.sceneNumber.trim()
        : null,
    afterSceneId:
      typeof s.afterSceneId === "string" && s.afterSceneId.trim()
        ? s.afterSceneId.trim()
        : null,
  };
}

async function addSingleScene(input: SingleSceneBody) {
  const access = await requireProjectAccess(input.projectId);
  if ("error" in access) return access.error;

  const allowed = await checkSceneCreateAllowed(access.user.id, input.projectId);
  if (!allowed.ok) return allowed.error;

  const script = await db
    .select()
    .from(scripts)
    .where(eq(scripts.id, input.scriptId))
    .get();
  if (!script || script.projectId !== input.projectId) {
    return NextResponse.json({ error: "Script not found" }, { status: 404 });
  }

  const scene = await insertSceneAfter({
    projectId: input.projectId,
    scriptId: input.scriptId,
    heading: input.heading,
    sceneNumber: input.sceneNumber,
    afterSceneId: input.afterSceneId,
  });

  return NextResponse.json(scene, { status: 201 });
}

/** Edit a single scene heading / number / prepped flag (slug-only — body text is not stored). */
export async function PATCH(request: Request) {
  await ensureDb();
  const body = await request.json();
  const { id, rawText, heading, sceneNumber, prepped } = body as {
    id: string;
    rawText?: string;
    heading?: string;
    sceneNumber?: string | null;
    prepped?: boolean;
  };

  if (!id) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }

  if (typeof rawText === "string" && rawText.trim()) {
    return NextResponse.json(
      { error: "Scene body text is not stored. Update slugs via PDF upload or paste." },
      { status: 400 }
    );
  }

  const existing = await db.select().from(scenes).where(eq(scenes.id, id)).get();
  if (!existing) {
    return NextResponse.json({ error: "Scene not found" }, { status: 404 });
  }

  const access = await requireProjectAccess(existing.projectId);
  if ("error" in access) return access.error;

  const patch: {
    heading?: string;
    sceneNumber?: string | null;
    prepped?: number;
  } = {};
  if (typeof heading === "string" && heading.trim()) {
    patch.heading = heading.trim();
  }
  if (sceneNumber !== undefined) {
    patch.sceneNumber =
      typeof sceneNumber === "string" && sceneNumber.trim()
        ? sceneNumber.trim()
        : null;
  }
  if (typeof prepped === "boolean") {
    patch.prepped = prepped ? 1 : 0;
  }

  if (Object.keys(patch).length > 0) {
    await db.update(scenes).set(patch).where(eq(scenes.id, id)).run();
  }

  const updated = (await db.select().from(scenes).where(eq(scenes.id, id)).get())!;
  return NextResponse.json(mapScene(updated));
}

/** Delete one scene and its canvas / chat / cheat sheet prep. */
export async function DELETE(request: Request) {
  await ensureDb();
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }

  const existing = await db.select().from(scenes).where(eq(scenes.id, id)).get();
  if (!existing) {
    return NextResponse.json({ error: "Scene not found" }, { status: 404 });
  }

  const access = await requireProjectAccess(existing.projectId);
  if ("error" in access) return access.error;

  await deleteSceneById(id);
  return NextResponse.json({ ok: true });
}
