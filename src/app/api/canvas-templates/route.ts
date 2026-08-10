import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, ensureDb } from "@/db";
import { canvasNodes, canvasTemplates, scenes } from "@/db/schema";
import { requireProjectAccess } from "@/lib/auth-guard";
import {
  newTemplateNodeIds,
  parseTemplateNodes,
  snapshotSceneAsTemplateNodes,
  type CanvasTemplateRecord,
} from "@/lib/canvas-template";
import { createId, nowIso } from "@/lib/id";
import { mapCanvasNode } from "@/lib/mappers";

export const runtime = "nodejs";

function mapTemplate(row: {
  id: string;
  projectId: string;
  name: string;
  sourceSceneId: string | null;
  nodes: string;
  createdAt: string;
}): CanvasTemplateRecord {
  let parsed: unknown = [];
  try {
    parsed = JSON.parse(row.nodes);
  } catch {
    parsed = [];
  }
  return {
    id: row.id,
    projectId: row.projectId,
    name: row.name,
    sourceSceneId: row.sourceSceneId,
    nodes: parseTemplateNodes(parsed),
    createdAt: row.createdAt,
  };
}

/** GET /api/canvas-templates?projectId=… */
export async function GET(request: Request) {
  await ensureDb();
  const { searchParams } = new URL(request.url);
  const projectId = searchParams.get("projectId");
  if (!projectId) {
    return NextResponse.json({ error: "Missing projectId" }, { status: 400 });
  }

  const access = await requireProjectAccess(projectId);
  if ("error" in access) return access.error;

  const rows = (
    await db
      .select()
      .from(canvasTemplates)
      .where(eq(canvasTemplates.projectId, projectId))
      .all()
  )
    .map(mapTemplate)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return NextResponse.json(rows);
}

/**
 * POST /api/canvas-templates
 * Body: { projectId, sceneId, name? } — save current scene layout as empty shells.
 */
export async function POST(request: Request) {
  await ensureDb();
  const body = await request.json();
  const { projectId, sceneId, name } = body as {
    projectId?: string;
    sceneId?: string;
    name?: string;
  };

  if (!projectId || !sceneId) {
    return NextResponse.json(
      { error: "projectId and sceneId are required" },
      { status: 400 }
    );
  }

  const access = await requireProjectAccess(projectId);
  if ("error" in access) return access.error;

  const scene = await db.select().from(scenes).where(eq(scenes.id, sceneId)).get();
  if (!scene || scene.projectId !== projectId) {
    return NextResponse.json({ error: "Scene not found" }, { status: 404 });
  }

  const sceneNodes = (
    await db
      .select()
      .from(canvasNodes)
      .where(eq(canvasNodes.projectId, projectId))
      .all()
  )
    .map(mapCanvasNode)
    .filter((n) => n.sceneId === sceneId);

  if (sceneNodes.length === 0) {
    return NextResponse.json(
      { error: "This scene’s canvas is empty — add nodes before saving a template." },
      { status: 400 }
    );
  }

  const templateNodes = snapshotSceneAsTemplateNodes(sceneNodes);
  const id = createId("tmpl");
  const templateName =
    typeof name === "string" && name.trim()
      ? name.trim()
      : `Layout from ${scene.heading || "scene"}`;

  await db
    .insert(canvasTemplates)
    .values({
      id,
      projectId,
      name: templateName,
      sourceSceneId: sceneId,
      nodes: JSON.stringify(templateNodes),
      createdAt: nowIso(),
    })
    .run();

  const created = (await db
    .select()
    .from(canvasTemplates)
    .where(eq(canvasTemplates.id, id))
    .get())!;

  return NextResponse.json(mapTemplate(created), { status: 201 });
}
