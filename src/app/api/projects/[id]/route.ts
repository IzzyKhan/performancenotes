import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import {
  projects,
  canvasNodes,
  chatMessages,
  cheatSheets,
} from "@/db/schema";
import { requireProjectAccess } from "@/lib/auth-guard";
import { mapCanvasNode, mapCheatSheet } from "@/lib/mappers";
import {
  listScenesForProject,
  listScriptsForProject,
} from "@/lib/scripts";
import type { ProjectBundle } from "@/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function noStoreJson(data: unknown, init?: { status?: number }) {
  return NextResponse.json(data, {
    status: init?.status,
    headers: {
      "Cache-Control": "no-store, max-age=0",
    },
  });
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const access = await requireProjectAccess(id);
  if ("error" in access) return access.error;
  const { project } = access;

  const nodeRows = db
    .select()
    .from(canvasNodes)
    .where(eq(canvasNodes.projectId, id))
    .all();
  const messageRows = db
    .select()
    .from(chatMessages)
    .where(eq(chatMessages.projectId, id))
    .all();
  const cheatRows = db
    .select()
    .from(cheatSheets)
    .where(eq(cheatSheets.projectId, id))
    .all();

  const bundle: ProjectBundle = {
    project,
    scripts: listScriptsForProject(id),
    scenes: listScenesForProject(id),
    canvasNodes: nodeRows.map(mapCanvasNode),
    chatMessages: messageRows.map((m) => ({
      id: m.id,
      projectId: m.projectId,
      sceneId: m.sceneId,
      role: m.role as "user" | "assistant",
      content: m.content,
      createdAt: m.createdAt,
    })),
    cheatSheets: cheatRows.map(mapCheatSheet),
  };

  return noStoreJson(bundle);
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const access = await requireProjectAccess(id);
  if ("error" in access) return access.error;

  const body = await request.json();

  if (typeof body.title === "string" && body.title.trim()) {
    db.update(projects)
      .set({ title: body.title.trim() })
      .where(eq(projects.id, id))
      .run();
  }

  const updated = db.select().from(projects).where(eq(projects.id, id)).get();
  return NextResponse.json(updated);
}
