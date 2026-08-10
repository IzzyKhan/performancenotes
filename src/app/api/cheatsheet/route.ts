import { NextResponse } from "next/server";
import { and, eq, isNull } from "drizzle-orm";
import { db, ensureDb } from "@/db";
import { cheatSheets } from "@/db/schema";
import { requireProjectAccess } from "@/lib/auth-guard";
import { createId, nowIso } from "@/lib/id";
import { mapCheatSheet, normalizeCheatSheetContent } from "@/lib/mappers";
import type { CheatSheetContent } from "@/types";

export const runtime = "nodejs";

function sheetScope(projectId: string, sceneId: string | null) {
  return sceneId
    ? and(eq(cheatSheets.projectId, projectId), eq(cheatSheets.sceneId, sceneId))
    : and(eq(cheatSheets.projectId, projectId), isNull(cheatSheets.sceneId));
}

export async function GET(request: Request) {
  await ensureDb();
  const { searchParams } = new URL(request.url);
  const projectId = searchParams.get("projectId");
  const sceneId = searchParams.get("sceneId");
  if (!projectId) {
    return NextResponse.json({ error: "Missing projectId" }, { status: 400 });
  }

  const access = await requireProjectAccess(projectId);
  if ("error" in access) return access.error;

  const row = await db
    .select()
    .from(cheatSheets)
    .where(sheetScope(projectId, sceneId))
    .get();

  return NextResponse.json(row ? mapCheatSheet(row) : null);
}

export async function PUT(request: Request) {
  await ensureDb();
  const body = await request.json();
  const { projectId, sceneId = null, content } = body as {
    projectId: string;
    sceneId?: string | null;
    content: CheatSheetContent;
  };

  if (!projectId || !content) {
    return NextResponse.json(
      { error: "projectId and content are required" },
      { status: 400 }
    );
  }

  const access = await requireProjectAccess(projectId);
  if ("error" in access) return access.error;

  const normalized = normalizeCheatSheetContent(content);

  const existing = await db
    .select()
    .from(cheatSheets)
    .where(sheetScope(projectId, sceneId))
    .get();

  if (existing) {
    await db
      .update(cheatSheets)
      .set({
        content: JSON.stringify(normalized),
        version: existing.version + 1,
        createdAt: nowIso(),
      })
      .where(eq(cheatSheets.id, existing.id))
      .run();
  } else {
    await db
      .insert(cheatSheets)
      .values({
        id: createId("sheet"),
        projectId,
        sceneId,
        content: JSON.stringify(normalized),
        version: 1,
        createdAt: nowIso(),
      })
      .run();
  }

  const saved = (await db
    .select()
    .from(cheatSheets)
    .where(sheetScope(projectId, sceneId))
    .get())!;
  return NextResponse.json(mapCheatSheet(saved));
}
