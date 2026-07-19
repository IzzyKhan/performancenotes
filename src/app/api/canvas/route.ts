import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { canvasNodes } from "@/db/schema";
import { requireProjectAccess } from "@/lib/auth-guard";
import { createId, nowIso } from "@/lib/id";
import { mapCanvasNode } from "@/lib/mappers";
import type { CanvasNodeType } from "@/types";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const projectId = searchParams.get("projectId");
  const sceneId = searchParams.get("sceneId");
  if (!projectId) {
    return NextResponse.json({ error: "Missing projectId" }, { status: 400 });
  }

  const access = await requireProjectAccess(projectId);
  if ("error" in access) return access.error;

  const rows = db
    .select()
    .from(canvasNodes)
    .where(eq(canvasNodes.projectId, projectId))
    .all()
    .map(mapCanvasNode);

  // Scene filter keeps project-wide (null-sceneId) nodes visible everywhere
  const filtered = sceneId
    ? rows.filter((n) => n.sceneId === null || n.sceneId === sceneId)
    : rows;

  return NextResponse.json(filtered);
}

export async function POST(request: Request) {
  const body = await request.json();
  const { projectId, sceneId = null, type, content, positionX, positionY, label } =
    body as {
      projectId: string;
      sceneId?: string | null;
      type: CanvasNodeType;
      content: Record<string, unknown>;
      positionX?: number;
      positionY?: number;
      label?: string | null;
    };

  if (!projectId || !type) {
    return NextResponse.json(
      { error: "projectId and type are required" },
      { status: 400 }
    );
  }

  const access = await requireProjectAccess(projectId);
  if ("error" in access) return access.error;

  const id = createId("node");
  db.insert(canvasNodes)
    .values({
      id,
      projectId,
      sceneId,
      type,
      content: JSON.stringify(content ?? {}),
      positionX: positionX ?? 100,
      positionY: positionY ?? 100,
      label: label ?? null,
      createdAt: nowIso(),
    })
    .run();

  const created = db
    .select()
    .from(canvasNodes)
    .where(eq(canvasNodes.id, id))
    .get()!;
  return NextResponse.json(mapCanvasNode(created), { status: 201 });
}

export async function PATCH(request: Request) {
  const body = await request.json();
  const { id, content, positionX, positionY, label, type } = body;

  if (!id) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }

  const existing = db
    .select()
    .from(canvasNodes)
    .where(eq(canvasNodes.id, id))
    .get();
  if (!existing) {
    return NextResponse.json({ error: "Node not found" }, { status: 404 });
  }

  const access = await requireProjectAccess(existing.projectId);
  if ("error" in access) return access.error;

  const updates: Partial<typeof existing> = {};
  if (content !== undefined) updates.content = JSON.stringify(content);
  if (positionX !== undefined) updates.positionX = positionX;
  if (positionY !== undefined) updates.positionY = positionY;
  if (label !== undefined) updates.label = label;
  if (type !== undefined) updates.type = type;

  db.update(canvasNodes).set(updates).where(eq(canvasNodes.id, id)).run();

  const updated = db
    .select()
    .from(canvasNodes)
    .where(eq(canvasNodes.id, id))
    .get()!;
  return NextResponse.json(mapCanvasNode(updated));
}

export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }

  const existing = db
    .select()
    .from(canvasNodes)
    .where(eq(canvasNodes.id, id))
    .get();
  if (!existing) {
    return NextResponse.json({ error: "Node not found" }, { status: 404 });
  }

  const access = await requireProjectAccess(existing.projectId);
  if ("error" in access) return access.error;

  db.delete(canvasNodes).where(eq(canvasNodes.id, id)).run();
  return NextResponse.json({ ok: true });
}
