import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db, ensureDb } from "@/db";
import { canvasNodes, canvasTemplates, scenes } from "@/db/schema";
import { requireProjectAccess } from "@/lib/auth-guard";
import {
  newTemplateNodeIds,
  parseTemplateNodes,
} from "@/lib/canvas-template";
import { nowIso } from "@/lib/id";
import { mapCanvasNode } from "@/lib/mappers";

export const runtime = "nodejs";

/**
 * POST /api/canvas-templates/apply
 * Body: { projectId, templateId, sceneIds: string[], overwrite?: boolean }
 *
 * Applies empty layout shells to target scenes. Skips scenes that already
 * have nodes unless overwrite is true (then deletes existing scene nodes first).
 */
export async function POST(request: Request) {
  await ensureDb();
  const body = await request.json();
  const { projectId, templateId, sceneIds, overwrite } = body as {
    projectId?: string;
    templateId?: string;
    sceneIds?: string[];
    overwrite?: boolean;
  };

  if (!projectId || !templateId || !Array.isArray(sceneIds) || sceneIds.length === 0) {
    return NextResponse.json(
      { error: "projectId, templateId, and sceneIds are required" },
      { status: 400 }
    );
  }

  const access = await requireProjectAccess(projectId);
  if ("error" in access) return access.error;

  const templateRow = await db
    .select()
    .from(canvasTemplates)
    .where(eq(canvasTemplates.id, templateId))
    .get();
  if (!templateRow || templateRow.projectId !== projectId) {
    return NextResponse.json({ error: "Template not found" }, { status: 404 });
  }

  let parsed: unknown = [];
  try {
    parsed = JSON.parse(templateRow.nodes);
  } catch {
    parsed = [];
  }
  const templateNodes = parseTemplateNodes(parsed);
  if (templateNodes.length === 0) {
    return NextResponse.json(
      { error: "Template has no nodes" },
      { status: 400 }
    );
  }

  const projectScenes = await db
    .select()
    .from(scenes)
    .where(eq(scenes.projectId, projectId))
    .all();
  const sceneById = new Map(projectScenes.map((s) => [s.id, s]));

  const allNodes = (
    await db
      .select()
      .from(canvasNodes)
      .where(eq(canvasNodes.projectId, projectId))
      .all()
  ).map(mapCanvasNode);

  const nodesByScene = new Map<string, number>();
  for (const n of allNodes) {
    if (!n.sceneId) continue;
    nodesByScene.set(n.sceneId, (nodesByScene.get(n.sceneId) ?? 0) + 1);
  }

  const applied: string[] = [];
  const skipped: string[] = [];
  const missing: string[] = [];

  await db.transaction(async (tx) => {
    for (const sceneId of sceneIds) {
      if (!sceneById.has(sceneId)) {
        missing.push(sceneId);
        continue;
      }
      const existingCount = nodesByScene.get(sceneId) ?? 0;
      if (existingCount > 0 && !overwrite) {
        skipped.push(sceneId);
        continue;
      }
      if (existingCount > 0 && overwrite) {
        await tx
          .delete(canvasNodes)
          .where(
            and(
              eq(canvasNodes.projectId, projectId),
              eq(canvasNodes.sceneId, sceneId)
            )
          )
          .run();
      }
      const created = nowIso();
      for (const node of newTemplateNodeIds(templateNodes)) {
        await tx
          .insert(canvasNodes)
          .values({
            id: node.id,
            projectId,
            sceneId,
            type: node.type,
            content: JSON.stringify(node.content ?? {}),
            positionX: node.positionX,
            positionY: node.positionY,
            label: node.label,
            createdAt: created,
          })
          .run();
      }
      applied.push(sceneId);
    }
  });

  return NextResponse.json({
    applied,
    skipped,
    missing,
    nodeCount: templateNodes.length,
  });
}
