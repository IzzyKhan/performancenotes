import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { extractPdfTextWithLines } from "@/lib/pdf";
import { db } from "@/db";
import { scenes, scripts } from "@/db/schema";
import { requireProjectAccess } from "@/lib/auth-guard";
import { parseMultipartForm } from "@/lib/multipart";
import { mapScene } from "@/lib/mappers";
import { parseScreenplayText } from "@/lib/screenplay";
import {
  createScriptWithScenes,
  listScenesForProject,
  replaceScriptScenes,
} from "@/lib/scripts";

export const runtime = "nodejs";
export const maxDuration = 120;

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
 * Upload or paste a script for one episode. Replaces scenes under that
 * script only. If scriptId is omitted, creates a new script on the project.
 */
export async function POST(request: Request) {
  const contentType = request.headers.get("content-type") || "";

  let projectId: string;
  let scriptId: string | null = null;
  let title: string = "";
  let rawText: string;
  let sourceType: "pdf" | "typed";

  if (contentType.includes("multipart/form-data")) {
    const formOrErr = await parseMultipartForm(request);
    if (formOrErr instanceof NextResponse) return formOrErr;
    const form = formOrErr;
    projectId = String(form.get("projectId") || "");
    scriptId = String(form.get("scriptId") || "") || null;
    title = String(form.get("title") || "").trim();
    const file = form.get("file");

    if (!projectId || !(file instanceof File)) {
      return NextResponse.json(
        { error: "projectId and PDF file are required" },
        { status: 400 }
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const started = Date.now();
    rawText = await extractPdfTextWithLines(new Uint8Array(buffer));
    console.info(
      `[api/scenes POST] PDF extracted ${title || file.name}: ${(buffer.length / 1024 / 1024).toFixed(1)}MB, ${Date.now() - started}ms`
    );
    sourceType = "pdf";
    if (!title) {
      title = file.name.replace(/\.pdf$/i, "").trim();
    }

    if (!rawText) {
      return NextResponse.json(
        { error: "Could not extract text from PDF" },
        { status: 400 }
      );
    }
  } else {
    const body = await request.json();
    projectId = body.projectId;
    scriptId = typeof body.scriptId === "string" ? body.scriptId : null;
    title = typeof body.title === "string" ? body.title.trim() : "";
    rawText = (body.rawText as string)?.trim();
    sourceType = body.sourceType === "pdf" ? "pdf" : "typed";

    if (!projectId || !rawText) {
      return NextResponse.json(
        { error: "projectId and rawText are required" },
        { status: 400 }
      );
    }
  }

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

    const sceneCount = replaceScriptScenes({
      projectId,
      scriptId,
      rawText,
      sourceType,
    });
    console.info(
      `[api/scenes POST] Replaced ${scriptId}: ${sceneCount} scenes, ${Date.now() - saveStarted}ms`
    );
    return NextResponse.json({ scriptId, sceneCount }, { status: 201 });
  }

  const result = createScriptWithScenes({
    projectId,
    title: title || "Episode 1",
    rawText,
    sourceType,
  });
  console.info(
    `[api/scenes POST] Created ${result.script.title}: ${result.sceneCount} scenes, ${Date.now() - saveStarted}ms`
  );
  return NextResponse.json(result, { status: 201 });
}

/** Edit a single scene's text (re-parses characters/beats). */
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

  const existing = db.select().from(scenes).where(eq(scenes.id, id)).get();
  if (!existing) {
    return NextResponse.json({ error: "Scene not found" }, { status: 404 });
  }

  const access = await requireProjectAccess(existing.projectId);
  if ("error" in access) return access.error;

  const updates: Partial<typeof existing> = {};
  if (typeof rawText === "string" && rawText.trim()) {
    updates.rawText = rawText.trim();
    updates.parsedMeta = JSON.stringify(parseScreenplayText(rawText));
  }
  if (typeof heading === "string" && heading.trim()) {
    updates.heading = heading.trim();
  }

  if (Object.keys(updates).length > 0) {
    db.update(scenes).set(updates).where(eq(scenes.id, id)).run();
  }

  const updated = db.select().from(scenes).where(eq(scenes.id, id)).get()!;
  return NextResponse.json(mapScene(updated));
}
