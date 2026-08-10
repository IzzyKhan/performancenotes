import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, ensureDb } from "@/db";
import { scripts } from "@/db/schema";
import { requireProjectAccess } from "@/lib/auth-guard";
import { mapScript } from "@/lib/mappers";
import { deleteScriptAndScenes } from "@/lib/scripts";

export const runtime = "nodejs";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  await ensureDb();
  const { id } = await params;
  const body = await request.json();

  const existing = await db.select().from(scripts).where(eq(scripts.id, id)).get();
  if (!existing) {
    return NextResponse.json({ error: "Script not found" }, { status: 404 });
  }

  const access = await requireProjectAccess(existing.projectId);
  if ("error" in access) return access.error;

  if (typeof body.title === "string" && body.title.trim()) {
    await db
      .update(scripts)
      .set({ title: body.title.trim() })
      .where(eq(scripts.id, id))
      .run();
  }

  if (
    typeof body.episodeNumber === "number" &&
    body.episodeNumber >= 1 &&
    Number.isFinite(body.episodeNumber)
  ) {
    await db
      .update(scripts)
      .set({ episodeNumber: Math.floor(body.episodeNumber) })
      .where(eq(scripts.id, id))
      .run();
  }

  const updated = (await db.select().from(scripts).where(eq(scripts.id, id)).get())!;
  return NextResponse.json(mapScript(updated));
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  await ensureDb();
  const { id } = await params;
  const existing = await db.select().from(scripts).where(eq(scripts.id, id)).get();
  if (!existing) {
    return NextResponse.json({ error: "Script not found" }, { status: 404 });
  }

  const access = await requireProjectAccess(existing.projectId);
  if ("error" in access) return access.error;

  await deleteScriptAndScenes(id);
  return NextResponse.json({ ok: true });
}
