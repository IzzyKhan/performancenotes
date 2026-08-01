import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { scenes, scripts } from "@/db/schema";
import { requireProjectAccess } from "@/lib/auth-guard";
import { checkScriptCreateAllowed } from "@/lib/entitlement-guard";
import { mapScene } from "@/lib/mappers";
import { parseSlugIngestBody } from "@/lib/scene-slug";
import {
  createScriptWithSceneSlugs,
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
  const { searchParams } = new URL(request.url);
  const projectId = searchParams.get("projectId");
  if (!projectId) {
    return NextResponse.json({ error: "Missing projectId" }, { status: 400 });
  }

  const access = await requireProjectAccess(projectId);
  if ("error" in access) return access.error;

  return NextResponse.json(listScenesForProject(projectId));
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
    const script = db
      .select()
      .from(scripts)
      .where(eq(scripts.id, scriptId))
      .get();
    if (!script || script.projectId !== projectId) {
      return NextResponse.json({ error: "Script not found" }, { status: 404 });
    }

    if (mode === "preview") {
      const preview = previewScriptReplaceFromSlugs({
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
      const result = replaceScriptScenesWithRemapFromSlugs({
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

    const sceneCount = replaceScriptSceneSlugs({
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

  const allowed = checkScriptCreateAllowed(access.user.id, projectId);
  if (!allowed.ok) return allowed.error;

  const result = createScriptWithSceneSlugs({
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

/** Edit a single scene heading (slug-only — body text is not stored). */
export async function PATCH(request: Request) {
  const body = await request.json();
  const { id, rawText, heading } = body as {
    id: string;
    rawText?: string;
    heading?: string;
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

  const existing = db.select().from(scenes).where(eq(scenes.id, id)).get();
  if (!existing) {
    return NextResponse.json({ error: "Scene not found" }, { status: 404 });
  }

  const access = await requireProjectAccess(existing.projectId);
  if ("error" in access) return access.error;

  if (typeof heading === "string" && heading.trim()) {
    db.update(scenes)
      .set({ heading: heading.trim() })
      .where(eq(scenes.id, id))
      .run();
  }

  const updated = db.select().from(scenes).where(eq(scenes.id, id)).get()!;
  return NextResponse.json(mapScene(updated));
}
