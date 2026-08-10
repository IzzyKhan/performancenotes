/**
 * Stage 2 — enforce plan entitlements on write APIs.
 *
 * Limits apply only when auth is enabled; local/self-hosted dev (no
 * AUTH_SECRET) stays unrestricted, matching quota behavior in quotas.ts.
 */

import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { projects, scenes, scripts, users } from "@/db/schema";
import { authRequired } from "@/lib/auth-guard";
import { entitlementsForPlan, normalizePlan } from "@/lib/entitlements";

export type EntitlementCheck = { ok: true } | { ok: false; error: NextResponse };

function planLimitResponse(opts: {
  message: string;
  limit: number;
  plan: string;
}): NextResponse {
  return NextResponse.json(
    {
      error: opts.message,
      code: "plan_limit",
      limit: opts.limit,
      plan: opts.plan,
    },
    { status: 403 }
  );
}

async function planForUser(userId: string) {
  const row = await db
    .select({ plan: users.plan })
    .from(users)
    .where(eq(users.id, userId))
    .get();
  return normalizePlan(row?.plan);
}

/** Can this user create another project? */
export async function checkProjectCreateAllowed(
  userId: string
): Promise<EntitlementCheck> {
  if (!authRequired() || userId === "local") return { ok: true };

  const plan = await planForUser(userId);
  const ent = entitlementsForPlan(plan);
  if (ent.maxProjects === null) return { ok: true };

  const count = (
    await db
      .select({ id: projects.id })
      .from(projects)
      .where(eq(projects.userId, userId))
      .all()
  ).length;

  if (count >= ent.maxProjects) {
    return {
      ok: false,
      error: planLimitResponse({
        message: `The ${ent.label} plan includes ${ent.maxProjects} project${ent.maxProjects === 1 ? "" : "s"}. Upgrade to Pro for unlimited projects.`,
        limit: ent.maxProjects,
        plan,
      }),
    };
  }
  return { ok: true };
}

/** Can this user add another script (episode) to the project? */
export async function checkScriptCreateAllowed(
  userId: string,
  projectId: string
): Promise<EntitlementCheck> {
  if (!authRequired() || userId === "local") return { ok: true };

  const plan = await planForUser(userId);
  const ent = entitlementsForPlan(plan);
  if (ent.maxScriptsPerProject === null) return { ok: true };

  const count = (
    await db
      .select({ id: scripts.id })
      .from(scripts)
      .where(eq(scripts.projectId, projectId))
      .all()
  ).length;

  if (count >= ent.maxScriptsPerProject) {
    return {
      ok: false,
      error: planLimitResponse({
        message: `The ${ent.label} plan includes ${ent.maxScriptsPerProject} script${ent.maxScriptsPerProject === 1 ? "" : "s"} per project. Upgrade to Pro for unlimited episodes.`,
        limit: ent.maxScriptsPerProject,
        plan,
      }),
    };
  }
  return { ok: true };
}

/**
 * Can this user manually add another scene to the project?
 *
 * Applies to single-scene adds/inserts only. Bulk script import deliberately
 * creates all scenes (headings are not sensitive); scenes beyond the cap are
 * locked in the UI instead. Without this check, a capped user could route
 * around the lock by adding scenes one at a time.
 */
export async function checkSceneCreateAllowed(
  userId: string,
  projectId: string
): Promise<EntitlementCheck> {
  if (!authRequired() || userId === "local") return { ok: true };

  const plan = await planForUser(userId);
  const ent = entitlementsForPlan(plan);
  if (ent.maxScenesPerProject === null) return { ok: true };

  const count = (
    await db
      .select({ id: scenes.id })
      .from(scenes)
      .where(eq(scenes.projectId, projectId))
      .all()
  ).length;

  if (count >= ent.maxScenesPerProject) {
    return {
      ok: false,
      error: planLimitResponse({
        message: `The ${ent.label} plan includes ${ent.maxScenesPerProject} scenes per project. Upgrade to Solo for unlimited scenes.`,
        limit: ent.maxScenesPerProject,
        plan,
      }),
    };
  }
  return { ok: true };
}
