import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { authRequired, requireUser } from "@/lib/auth-guard";
import { entitlementsForPlan, normalizePlan } from "@/lib/entitlements";

export const runtime = "nodejs";

/** Current user's plan + entitlement limits, for client-side gating. */
export async function GET() {
  const authResult = await requireUser();
  if ("error" in authResult) return authResult.error;

  // Local / self-hosted dev without auth: no limits.
  if (!authRequired() || authResult.user.id === "local") {
    return NextResponse.json({
      email: authResult.user.email,
      plan: "organize",
      planLabel: "Local",
      maxProjects: null,
      maxScriptsPerProject: null,
    });
  }

  const row = db
    .select({ plan: users.plan })
    .from(users)
    .where(eq(users.id, authResult.user.id))
    .get();
  const plan = normalizePlan(row?.plan);
  const ent = entitlementsForPlan(plan);

  return NextResponse.json({
    email: authResult.user.email,
    plan,
    planLabel: ent.label,
    maxProjects: ent.maxProjects,
    maxScriptsPerProject: ent.maxScriptsPerProject,
  });
}
