import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, ensureDb } from "@/db";
import { scenes } from "@/db/schema";
import { requireProjectAccess } from "@/lib/auth-guard";
import {
  normalizeScheduleAssignments,
  type ScheduleAssignment,
} from "@/lib/schedule";
import { listScenesForProject } from "@/lib/scripts";

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

export async function PUT(request: Request) {
  await ensureDb();
  const body = await request.json();
  const { projectId, assignments } = body as {
    projectId?: string;
    assignments?: ScheduleAssignment[];
  };

  if (!projectId || !Array.isArray(assignments)) {
    return noStoreJson(
      { error: "projectId and assignments[] are required" },
      { status: 400 }
    );
  }

  const access = await requireProjectAccess(projectId);
  if ("error" in access) return access.error;

  const existing = await db
    .select()
    .from(scenes)
    .where(eq(scenes.projectId, projectId))
    .all();
  const existingIds = new Set(existing.map((s) => s.id));

  // Ignore stale client ids (e.g. scenes removed after a re-parse / stub cleanup)
  const validAssignments = (assignments ?? []).filter(
    (a) => a?.id && existingIds.has(a.id)
  );

  const byId = new Map<string, ScheduleAssignment>();
  for (const a of validAssignments) {
    const prev = byId.get(a.id);
    // Prefer a scheduled assignment if the same id appears twice
    if (!prev || (prev.shootDay == null && a.shootDay != null)) {
      const dayNum =
        a.shootDay == null ? NaN : Number(a.shootDay);
      const orderNum =
        a.shootOrder == null ? NaN : Number(a.shootOrder);
      byId.set(a.id, {
        id: a.id,
        shootDay: Number.isFinite(dayNum) ? dayNum : null,
        shootOrder: Number.isFinite(orderNum) ? orderNum : null,
      });
    }
  }

  // Full replace for scenes included in the payload. Scenes omitted from the
  // payload keep their existing DB values — avoids wiping the schedule when the
  // client sends a partial board (stale ids filtered, race, etc.).
  const complete: ScheduleAssignment[] = existing.map((s) => {
    const a = byId.get(s.id);
    if (!a) {
      return {
        id: s.id,
        shootDay: s.shootDay ?? null,
        shootOrder: s.shootOrder ?? null,
      };
    }
    return {
      id: s.id,
      shootDay: a.shootDay,
      shootOrder: a.shootOrder,
    };
  });

  const normalized = normalizeScheduleAssignments(complete);

  await db.transaction(async (tx) => {
    for (const a of normalized) {
      await tx
        .update(scenes)
        .set({
          shootDay: a.shootDay,
          shootOrder: a.shootOrder,
        })
        .where(eq(scenes.id, a.id))
        .run();
    }
  });

  return noStoreJson(await listScenesForProject(projectId));
}
