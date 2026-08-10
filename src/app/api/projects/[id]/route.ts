import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, ensureDb } from "@/db";
import {
  projects,
  canvasNodes,
  chatMessages,
  cheatSheets,
} from "@/db/schema";
import { requireProjectAccess } from "@/lib/auth-guard";
import { mapCanvasNode, mapCheatSheet, mapProject } from "@/lib/mappers";
import { isColorThemeId } from "@/lib/color-themes";
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
  await ensureDb();
  const { id } = await params;

  const access = await requireProjectAccess(id);
  if ("error" in access) return access.error;
  const { project } = access;

  const nodeRows = await db
    .select()
    .from(canvasNodes)
    .where(eq(canvasNodes.projectId, id))
    .all();
  const messageRows = await db
    .select()
    .from(chatMessages)
    .where(eq(chatMessages.projectId, id))
    .all();
  const cheatRows = await db
    .select()
    .from(cheatSheets)
    .where(eq(cheatSheets.projectId, id))
    .all();

  const bundle: ProjectBundle = {
    project: mapProject(project),
    scripts: await listScriptsForProject(id),
    scenes: await listScenesForProject(id),
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
  await ensureDb();
  const { id } = await params;
  const access = await requireProjectAccess(id);
  if ("error" in access) return access.error;

  const body = await request.json();
  const patch: {
    title?: string;
    prepStartDate?: string | null;
    shootStartDate?: string | null;
    techRecceDate?: string | null;
    prepEndBeforeTechRecce?: number;
    prepDaysPerWeek?: number;
    colorTheme?: string;
  } = {};

  if (typeof body.title === "string" && body.title.trim()) {
    patch.title = body.title.trim();
  }

  if ("prepStartDate" in body) {
    if (body.prepStartDate === null || body.prepStartDate === "") {
      patch.prepStartDate = null;
    } else if (
      typeof body.prepStartDate === "string" &&
      /^\d{4}-\d{2}-\d{2}$/.test(body.prepStartDate)
    ) {
      patch.prepStartDate = body.prepStartDate;
    } else {
      return NextResponse.json(
        { error: "prepStartDate must be YYYY-MM-DD or null" },
        { status: 400 }
      );
    }
  }

  if ("shootStartDate" in body) {
    if (body.shootStartDate === null || body.shootStartDate === "") {
      patch.shootStartDate = null;
    } else if (
      typeof body.shootStartDate === "string" &&
      /^\d{4}-\d{2}-\d{2}$/.test(body.shootStartDate)
    ) {
      patch.shootStartDate = body.shootStartDate;
    } else {
      return NextResponse.json(
        { error: "shootStartDate must be YYYY-MM-DD or null" },
        { status: 400 }
      );
    }
  }

  if ("techRecceDate" in body) {
    if (body.techRecceDate === null || body.techRecceDate === "") {
      patch.techRecceDate = null;
    } else if (
      typeof body.techRecceDate === "string" &&
      /^\d{4}-\d{2}-\d{2}$/.test(body.techRecceDate)
    ) {
      patch.techRecceDate = body.techRecceDate;
    } else {
      return NextResponse.json(
        { error: "techRecceDate must be YYYY-MM-DD or null" },
        { status: 400 }
      );
    }
  }

  if ("prepEndBeforeTechRecce" in body) {
    patch.prepEndBeforeTechRecce = body.prepEndBeforeTechRecce ? 1 : 0;
  }

  if ("prepDaysPerWeek" in body) {
    const n = Number(body.prepDaysPerWeek);
    if (!Number.isInteger(n) || n < 1 || n > 7) {
      return NextResponse.json(
        { error: "prepDaysPerWeek must be an integer from 1 to 7" },
        { status: 400 }
      );
    }
    patch.prepDaysPerWeek = n;
  }

  if ("colorTheme" in body) {
    if (typeof body.colorTheme !== "string" || !isColorThemeId(body.colorTheme)) {
      return NextResponse.json(
        { error: "colorTheme must be a known theme id" },
        { status: 400 }
      );
    }
    patch.colorTheme = body.colorTheme;
  }

  if (Object.keys(patch).length > 0) {
    await db.update(projects).set(patch).where(eq(projects.id, id)).run();
  }

  const updated = (await db.select().from(projects).where(eq(projects.id, id)).get())!;
  return NextResponse.json(mapProject(updated));
}
