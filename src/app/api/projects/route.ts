import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  projects,
  scenes,
  scripts,
  canvasNodes,
  chatMessages,
  cheatSheets,
} from "@/db/schema";
import { createId, nowIso } from "@/lib/id";
import { seedDemoIfEmpty } from "@/lib/seed";
import { createScriptWithScenes } from "@/lib/scripts";
import {
  authRequired,
  getOwnedProject,
  requireUser,
} from "@/lib/auth-guard";

export const runtime = "nodejs";

export async function GET() {
  const authResult = await requireUser();
  if ("error" in authResult) return authResult.error;

  if (!authRequired()) {
    seedDemoIfEmpty();
    const rows = db
      .select()
      .from(projects)
      .orderBy(desc(projects.createdAt))
      .all();
    return NextResponse.json(rows);
  }

  const rows = db
    .select()
    .from(projects)
    .where(eq(projects.userId, authResult.user.id))
    .orderBy(desc(projects.createdAt))
    .all();
  return NextResponse.json(rows);
}

export async function POST(request: Request) {
  const authResult = await requireUser();
  if ("error" in authResult) return authResult.error;

  const body = await request.json();
  const title = (body.title as string)?.trim() || "Untitled Project";

  const project = {
    id: createId("proj"),
    userId: authRequired() ? authResult.user.id : null,
    title,
    createdAt: nowIso(),
  };

  db.insert(projects).values(project).run();

  if (body.rawText && typeof body.rawText === "string" && body.rawText.trim()) {
    const sourceType = body.sourceType === "pdf" ? "pdf" : "typed";
    const scriptTitle =
      typeof body.scriptTitle === "string" && body.scriptTitle.trim()
        ? body.scriptTitle.trim()
        : title;

    createScriptWithScenes({
      projectId: project.id,
      title: scriptTitle,
      rawText: body.rawText.trim(),
      sourceType,
      orderIndex: 0,
    });
  }

  return NextResponse.json(project, { status: 201 });
}

export async function DELETE(request: Request) {
  const authResult = await requireUser();
  if ("error" in authResult) return authResult.error;

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }

  const owned = getOwnedProject(id, authResult.user.id);
  if (!owned) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  db.delete(chatMessages).where(eq(chatMessages.projectId, id)).run();
  db.delete(canvasNodes).where(eq(canvasNodes.projectId, id)).run();
  db.delete(cheatSheets).where(eq(cheatSheets.projectId, id)).run();
  db.delete(scenes).where(eq(scenes.projectId, id)).run();
  db.delete(scripts).where(eq(scripts.projectId, id)).run();
  db.delete(projects).where(eq(projects.id, id)).run();

  return NextResponse.json({ ok: true });
}
