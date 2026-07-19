import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import { projects } from "@/db/schema";

export type SessionUser = { id: string; email: string };

/** When AUTH_SECRET is unset, APIs stay open (legacy local / Phase 1-only). */
export function authRequired(): boolean {
  return Boolean(process.env.AUTH_SECRET);
}

export async function requireUser(): Promise<
  { user: SessionUser } | { error: NextResponse }
> {
  if (!authRequired()) {
    return { user: { id: "local", email: "local@localhost" } };
  }

  const session = await auth();
  const id = session?.user?.id;
  const email = session?.user?.email;
  if (!id || !email) {
    return {
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }
  return { user: { id, email } };
}

export function getOwnedProject(projectId: string, userId: string) {
  if (!authRequired() || userId === "local") {
    return db.select().from(projects).where(eq(projects.id, projectId)).get();
  }
  return db
    .select()
    .from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.userId, userId)))
    .get();
}

export async function requireProjectAccess(projectId: string): Promise<
  | { user: SessionUser; project: typeof projects.$inferSelect }
  | { error: NextResponse }
> {
  const authResult = await requireUser();
  if ("error" in authResult) return authResult;

  const project = getOwnedProject(projectId, authResult.user.id);
  if (!project) {
    return {
      error: NextResponse.json({ error: "Project not found" }, { status: 404 }),
    };
  }
  return { user: authResult.user, project };
}
