/**
 * Per-user Claude usage quotas (Agent tier — Stage 7).
 * Enforced when AUTH_SECRET is set. Free/Organize: agent off (0 quota).
 * dramaturg: ~180 actions/mo at launch (override CHAT_QUOTA_DRAMATURG).
 */

import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { nowIso } from "@/lib/id";
import { authRequired } from "@/lib/auth-guard";
import { entitlementsForPlan } from "@/lib/entitlements";

function monthKey(d = new Date()): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function quotaForPlan(plan: string | null | undefined): number {
  const ent = entitlementsForPlan(plan);
  if (!ent.agentEnabled) return 0;
  return Number(process.env.CHAT_QUOTA_DRAMATURG || ent.agentMonthlyActions);
}

export type QuotaResult =
  | { ok: true }
  | { ok: false; error: string; limit: number; used: number };

export async function checkAndIncrementChatQuota(
  userId: string
): Promise<QuotaResult> {
  if (!authRequired() || userId === "local") return { ok: true };

  const row = await db.select().from(users).where(eq(users.id, userId)).get();
  if (!row) return { ok: false, error: "User not found", limit: 0, used: 0 };

  const currentMonth = monthKey();
  let used = row.chatUsageCount ?? 0;
  if (row.chatUsageResetAt !== currentMonth) {
    used = 0;
  }

  const limit = quotaForPlan(row.plan);
  if (used >= limit) {
    return {
      ok: false,
      error: `Monthly AI quota reached (${limit}). Upgrade plan or wait until next month.`,
      limit,
      used,
    };
  }

  await db
    .update(users)
    .set({
      chatUsageCount: used + 1,
      chatUsageResetAt: currentMonth,
    })
    .where(eq(users.id, userId))
    .run();

  return { ok: true };
}

/** Apply plan entitlement after Stripe webhook (Phase 4). */
export async function setUserPlan(
  userId: string,
  plan: "free" | "solo" | "pro" | "dramaturg" | "prep" | "organize" | null,
  stripeCustomerId?: string
) {
  await db
    .update(users)
    .set({
      plan,
      ...(stripeCustomerId ? { stripeCustomerId } : {}),
    })
    .where(eq(users.id, userId))
    .run();
}

export function touchUserUpdated(_userId: string) {
  // placeholder for future audit fields
  void nowIso;
}
