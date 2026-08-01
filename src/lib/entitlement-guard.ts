/**
 * Stage 2 — enforce plan entitlements on write APIs.
 *
 * Limits apply only when auth is enabled; local/self-hosted dev (no
 * AUTH_SECRET) stays unrestricted, matching quota behavior in quotas.ts.
 */

import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { projects, scripts, users } from "@/db/schema";
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

function planForUser(userId: string) {
  const row = db
    .select({ plan: users.plan })
    .from(users)
    .where(eq(users.id, userId))
    .get();
  return normalizePlan(row?.plan);
}

/** Can this user create another project? */
export function checkProjectCreateAllowed(userId: string): EntitlementCheck {
  if (!authRequired() || userId === "local") return { ok: true };

  const plan = planForUser(userId);
  const ent = entitlementsForPlan(plan);
  if (ent.maxProjects === null) return { ok: true };

  const count = db
    .select({ id: projects.id })
    .from(projects)
    .where(eq(projects.userId, userId))
    .all().length;

  if (count >= ent.maxProjects) {
    return {
      ok: false,
      error: planLimitResponse({
        message: `The ${ent.label} plan includes ${ent.maxProjects} project${ent.maxProjects === 1 ? "" : "s"}. Upgrade to Organize for unlimited projects.`,
        limit: ent.maxProjects,
        plan,
      }),
    };
  }
  return { ok: true };
}

/** Can this user add another script (episode) to the project? */
export function checkScriptCreateAllowed(
  userId: string,
  projectId: string
): EntitlementCheck {
  if (!authRequired() || userId === "local") return { ok: true };

  const plan = planForUser(userId);
  const ent = entitlementsForPlan(plan);
  if (ent.maxScriptsPerProject === null) return { ok: true };

  const count = db
    .select({ id: scripts.id })
    .from(scripts)
    .where(eq(scripts.projectId, projectId))
    .all().length;

  if (count >= ent.maxScriptsPerProject) {
    return {
      ok: false,
      error: planLimitResponse({
        message: `The ${ent.label} plan includes ${ent.maxScriptsPerProject} script${ent.maxScriptsPerProject === 1 ? "" : "s"} per project. Upgrade to Organize for unlimited episodes.`,
        limit: ent.maxScriptsPerProject,
        plan,
      }),
    };
  }
  return { ok: true };
}
