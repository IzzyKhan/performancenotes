import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db, ensureDb } from "@/db";
import { projects } from "@/db/schema";
import { isOpenAccess } from "@/lib/features";

export type SessionUser = { id: string; email: string };

/**
 * When AUTH_SECRET is unset, APIs stay open (legacy local / Phase 1).
 * NEXT_PUBLIC_OPEN_ACCESS=true also skips accounts (recruiter demo).
 */
export function authRequired(): boolean {
  if (isOpenAccess()) return false;
  return Boolean(process.env.AUTH_SECRET);
}

export async function requireUser(): Promise<
  { user: SessionUser } | { error: NextResponse }
> {
  await ensureDb();

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

export async function getOwnedProject(projectId: string, userId: string) {
  await ensureDb();
  if (!authRequired() || userId === "local") {
    return await db
      .select()
      .from(projects)
      .where(eq(projects.id, projectId))
      .get();
  }
  return await db
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

  const project = await getOwnedProject(projectId, authResult.user.id);
  if (!project) {
    return {
      error: NextResponse.json({ error: "Project not found" }, { status: 404 }),
    };
  }
  return { user: authResult.user, project };
}
